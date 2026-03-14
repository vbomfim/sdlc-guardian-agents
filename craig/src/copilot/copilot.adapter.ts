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
 *
 * @module copilot
 */

import { CopilotClient, approveAll } from "@github/copilot-sdk";
import type { CopilotPort } from "./copilot.port.js";
import type { InvokeParams, InvokeResult } from "./copilot.types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default timeout for agent invocations: 5 minutes. */
const DEFAULT_TIMEOUT_MS = 300_000;

/** Maximum number of session creation attempts (initial + retries). */
const MAX_SESSION_ATTEMPTS = 2;

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
   */
  async invoke(params: InvokeParams): Promise<InvokeResult> {
    const model = params.model ?? this.options.defaultModel;
    const timeout = params.timeout ?? DEFAULT_TIMEOUT_MS;
    const startTime = performance.now();

    const client = new CopilotClient();
    let session: Awaited<ReturnType<CopilotClient["createSession"]>> | undefined;

    try {
      // Create session with retry (AC4)
      session = await this.createSessionWithRetry(client, model);

      // Build and send prompt
      const prompt = this.buildPrompt(params);
      const response = await session.sendAndWait({ prompt }, timeout);

      // Extract output
      const output = this.extractOutput(response);
      const duration_ms = Math.round(performance.now() - startTime);

      return {
        success: true,
        output,
        duration_ms,
        model_used: model,
      };
    } catch (error: unknown) {
      const duration_ms = Math.round(performance.now() - startTime);
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return {
        success: false,
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
      return authStatus.isAuthenticated === true;
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
   * with a fresh attempt. If both fail, throws the second error.
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
          onPermissionRequest: approveAll,
        });
        return session;
      } catch (error: unknown) {
        lastError = error;
      }
    }

    throw lastError;
  }

  /**
   * Build the prompt string including agent routing and optional context.
   *
   * Format:
   * ```
   * @{agent-name} {prompt}
   *
   * Context:
   * {context}
   * ```
   */
  private buildPrompt(params: InvokeParams): string {
    let prompt = `@${params.agent} ${params.prompt}`;

    if (params.context) {
      prompt += `\n\nContext:\n${params.context}`;
    }

    return prompt;
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
    session: Awaited<ReturnType<CopilotClient["createSession"]>> | undefined,
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
