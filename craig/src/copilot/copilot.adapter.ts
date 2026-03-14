/**
 * CopilotAdapter — SDK-based implementation of CopilotPort.
 *
 * Manages Copilot SDK sessions and invokes Guardian agents by name.
 * Each invocation creates a fresh client + session, sends the prompt,
 * captures the response, and cleans up.
 *
 * Design decisions:
 * - One client + session per invocation — no shared state [CLEAN-CODE]
 * - Retry once on session creation failure [AC4]
 * - Never throws — returns InvokeResult with success: false [CLEAN-CODE]
 * - Cleanup always runs (finally block) — prevents session leaks [CLEAN-CODE]
 * - Prompt includes agent name as @-mention for Copilot routing [CUSTOM]
 * - Scoped permissions — only read + safe shell commands allowed [SECURITY]
 * - Input sanitization — control chars stripped, context delimited [SECURITY]
 * - Agent name validated at runtime against allowlist [SECURITY]
 *
 * @module copilot
 */

import { CopilotClient } from "@github/copilot-sdk";
import type { PermissionHandler, PermissionRequest } from "@github/copilot-sdk";
import type { CopilotPort } from "./copilot.port.js";
import type { InvokeParams, InvokeResult } from "./copilot.types.js";
import { GUARDIAN_AGENTS } from "./copilot.types.js";
import {
  CopilotSessionError,
  CopilotTimeoutError,
  CopilotUnavailableError,
} from "./copilot.errors.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default timeout for agent invocations: 5 minutes. */
const DEFAULT_TIMEOUT_MS = 300_000;

/** Maximum number of session creation attempts (initial + retries). */
const MAX_SESSION_ATTEMPTS = 2;

// ---------------------------------------------------------------------------
// Scoped Permission Handler [SECURITY]
// ---------------------------------------------------------------------------

/**
 * Permission kinds that are always safe (read-only operations).
 * Maps to SDK tools: view, grep, glob.
 */
const ALLOWED_PERMISSION_KINDS: ReadonlySet<string> = new Set(["read"]);

/**
 * Safe shell command prefixes for read-only operations.
 * Only commands that cannot modify the filesystem or exfiltrate data.
 */
const ALLOWED_SHELL_PREFIXES: readonly string[] = [
  "git diff",
  "git log",
  "git show",
  "git status",
  "git branch",
  "ls ",
  "cat ",
  "find ",
  "head ",
  "tail ",
  "wc ",
  "grep ",
];

/**
 * Create a scoped permission handler that only allows safe operations.
 *
 * [SECURITY] Replaces `approveAll` which granted blanket permission
 * to every tool request. This handler:
 * - Allows read-only operations (view, grep, glob)
 * - Allows shell commands matching safe prefixes (git diff, ls, cat, etc.)
 * - Denies all write, URL, MCP, and custom-tool operations
 *
 * @returns A PermissionHandler that enforces the allowlist
 */
export function createScopedPermissionHandler(): PermissionHandler {
  return (request: PermissionRequest) => {
    if (ALLOWED_PERMISSION_KINDS.has(request.kind)) {
      return { kind: "approved" as const };
    }

    if (request.kind === "shell") {
      const rawCommand = request["command"];
      const command =
        typeof rawCommand === "string" ? rawCommand.trimStart() : "";

      if (
        ALLOWED_SHELL_PREFIXES.some((prefix) => command.startsWith(prefix))
      ) {
        return { kind: "approved" as const };
      }
    }

    return {
      kind: "denied-by-rules" as const,
      rules: [
        {
          name: "craig-scoped-permissions",
          description: `Denied: ${request.kind}`,
        },
      ],
    };
  };
}

// ---------------------------------------------------------------------------
// Input Sanitization [SECURITY]
// ---------------------------------------------------------------------------

/**
 * Strip control characters from user-provided input.
 *
 * [SECURITY] Removes null bytes and non-printable control characters
 * that could be used for prompt injection or terminal escape attacks.
 * Preserves tabs (\t), newlines (\n), and carriage returns (\r).
 *
 * @param input - Raw user input string
 * @returns Sanitized string with control characters removed
 */
export function sanitizeInput(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

// ---------------------------------------------------------------------------
// Adapter Options
// ---------------------------------------------------------------------------

/**
 * Configuration for the CopilotAdapter.
 * Sourced from Craig's config (models.default, guardians.path).
 */
export interface CopilotAdapterOptions {
  /** Default model to use for invocations. */
  readonly defaultModel: string;

  /** Path to Guardian agent definitions. */
  readonly guardiansPath: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * SDK-based adapter implementing CopilotPort.
 *
 * [HEXAGONAL] This is the outward-facing adapter. It depends on
 * the @github/copilot-sdk concrete implementation. Consumers
 * depend on CopilotPort, never on this class directly.
 */
export class CopilotAdapter implements CopilotPort {
  private readonly options: CopilotAdapterOptions;

  constructor(options: CopilotAdapterOptions) {
    this.options = options;
  }

  /**
   * Invoke a Guardian agent via Copilot SDK.
   *
   * Creates a fresh client + session, sends the agent-routed prompt,
   * waits for the response, and cleans up. Retries once on session
   * creation failure per AC4.
   *
   * @throws Never — always returns InvokeResult, errors captured in result.error
   */
  async invoke(params: InvokeParams): Promise<InvokeResult> {
    const model = params.model ?? this.options.defaultModel;
    const timeout = params.timeout ?? DEFAULT_TIMEOUT_MS;
    const startTime = performance.now();

    // [SECURITY] Validate agent name at runtime against allowlist
    if (!GUARDIAN_AGENTS.has(params.agent)) {
      const duration_ms = Math.round(performance.now() - startTime);
      return {
        success: false as const,
        output: "",
        duration_ms,
        model_used: model,
        error: `Invalid agent: "${params.agent}". Allowed: ${[...GUARDIAN_AGENTS].join(", ")}`,
      };
    }

    const client = new CopilotClient();
    let session:
      | Awaited<ReturnType<CopilotClient["createSession"]>>
      | undefined;

    try {
      // Create session with retry (AC4)
      session = await this.createSessionWithRetry(client, model);

      // Build and send prompt (sanitized)
      const prompt = this.buildPrompt(params);
      const response = await session.sendAndWait({ prompt }, timeout);

      // Extract output
      const output = this.extractOutput(response);
      const duration_ms = Math.round(performance.now() - startTime);

      return {
        success: true as const,
        output,
        duration_ms,
        model_used: model,
      };
    } catch (error: unknown) {
      const duration_ms = Math.round(performance.now() - startTime);
      const errorMessage = this.classifyError(error, timeout);

      return {
        success: false as const,
        output: "",
        duration_ms,
        model_used: model,
        error: errorMessage,
      };
    } finally {
      await this.cleanup(session, client);
    }
  }

  /**
   * Check whether Copilot SDK is available and authenticated.
   *
   * Creates a temporary client, pings the server, and checks auth status.
   * Returns false on any failure — never throws.
   */
  async isAvailable(): Promise<boolean> {
    const client = new CopilotClient();

    try {
      await client.start();
      await client.ping();
      const authStatus = await client.getAuthStatus();

      if (authStatus.isAuthenticated !== true) {
        throw new CopilotUnavailableError(
          "Copilot is not authenticated. Run 'gh auth login' to authenticate.",
        );
      }

      return true;
    } catch {
      return false;
    } finally {
      try {
        await client.stop();
      } catch {
        // Cleanup failure is not a problem for availability check
      }
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Create a session with one retry on failure.
   *
   * [AC4] If the first session creation fails, retries once
   * with a fresh attempt. If both fail, throws CopilotSessionError
   * wrapping the last error for precise error classification.
   */
  private async createSessionWithRetry(
    client: CopilotClient,
    model: string,
  ): Promise<Awaited<ReturnType<CopilotClient["createSession"]>>> {
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_SESSION_ATTEMPTS; attempt++) {
      try {
        const session = await client.createSession({
          model,
          onPermissionRequest: createScopedPermissionHandler(),
        });
        return session;
      } catch (error: unknown) {
        lastError = error;
      }
    }

    throw new CopilotSessionError(
      "Session creation failed after retries",
      { cause: lastError },
    );
  }

  /**
   * Build the prompt string including agent routing and optional context.
   *
   * [SECURITY] Sanitizes prompt and context to strip control characters.
   * Wraps context in structural delimiters to prevent prompt injection.
   *
   * Format:
   * ```
   * @{agent-name} {sanitized-prompt}
   *
   * <context>
   * {sanitized-context}
   * </context>
   * ```
   */
  private buildPrompt(params: InvokeParams): string {
    const sanitizedPrompt = sanitizeInput(params.prompt);
    let prompt = `@${params.agent} ${sanitizedPrompt}`;

    if (params.context) {
      const sanitizedContext = sanitizeInput(params.context);
      prompt += `\n\n<context>\n${sanitizedContext}\n</context>`;
    }

    return prompt;
  }

  /**
   * Classify an error into the appropriate custom error type.
   *
   * [CLEAN-CODE] Maps generic SDK errors to domain-specific error types,
   * providing consumers with actionable error messages.
   *
   * @returns A descriptive error message from the classified error
   */
  private classifyError(error: unknown, timeout: number): string {
    // Already classified — use directly
    if (error instanceof CopilotSessionError) {
      return error.message;
    }

    if (error instanceof CopilotTimeoutError) {
      return error.message;
    }

    if (error instanceof CopilotUnavailableError) {
      return error.message;
    }

    // Detect timeout from SDK errors
    const message = error instanceof Error ? error.message : String(error);
    if (/timeout/i.test(message)) {
      const timeoutError = new CopilotTimeoutError(timeout, { cause: error });
      return timeoutError.message;
    }

    return message;
  }

  /**
   * Extract text content from the SDK response.
   *
   * Handles undefined responses and missing content gracefully.
   */
  private extractOutput(
    response: { type: string; data: { content: string } } | undefined,
  ): string {
    if (!response) {
      return "";
    }

    return response.data?.content ?? "";
  }

  /**
   * Clean up session and client resources.
   *
   * Always runs in the finally block. Swallows cleanup errors
   * to avoid masking the original error.
   */
  private async cleanup(
    session:
      | Awaited<ReturnType<CopilotClient["createSession"]>>
      | undefined,
    client: CopilotClient,
  ): Promise<void> {
    try {
      if (session) {
        await session.disconnect();
      }
    } catch {
      // Swallow disconnect errors — cleanup should not mask original error
    }

    try {
      await client.stop();
    } catch {
      // Swallow stop errors — cleanup should not mask original error
    }
  }
}

// ---------------------------------------------------------------------------
// Factory Function [HEXAGONAL]
// ---------------------------------------------------------------------------

/**
 * Create a CopilotAdapter instance behind the CopilotPort interface.
 *
 * [HEXAGONAL] Consumers use this factory instead of `new CopilotAdapter()`.
 * Returns the port interface, hiding the concrete implementation.
 * Follows the project's factory function convention (see createDefaultState).
 *
 * @param options - Adapter configuration (model, guardians path)
 * @returns A CopilotPort implementation backed by the Copilot SDK
 */
export function createCopilotAdapter(
  options: CopilotAdapterOptions,
): CopilotPort {
  return new CopilotAdapter(options);
}
