/**
 * Error sanitizer for MCP tool responses.
 *
 * Maps known error types to safe, generic messages that don't leak
 * internal details (file paths, API keys, server internals) to MCP
 * clients. Detailed error information is logged to stderr for
 * debugging.
 *
 * [SECURITY] — Prevents information disclosure via error messages.
 * [CLEAN-CODE] — Single function, clear mapping, no side effects
 *   beyond stderr logging.
 * [SRP] — Error sanitization is its own concern, separate from
 *   tool handler logic.
 *
 * @module core/error-sanitizer
 * @see https://github.com/vbomfim/sdlc-guardian-agents/issues/41
 */

import { StateCorruptedError } from "../state/errors.js";
import {
  ConfigNotFoundError,
  ConfigValidationError,
  ConfigParseError,
} from "../config/config.errors.js";
import {
  GitHubRateLimitError,
  GitHubAuthError,
  GitHubNotFoundError,
  GitHubAPIError,
} from "../github/github.errors.js";
import {
  GitRateLimitError,
  GitAuthError,
  GitNotFoundError,
  GitAPIError,
  GitProviderNotSupportedError,
} from "../git-port/git.errors.js";
import {
  CopilotSessionError,
  CopilotTimeoutError,
  CopilotUnavailableError,
} from "../copilot/copilot.errors.js";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Sanitized error returned to MCP clients. */
export interface SanitizedError {
  readonly message: string;
  readonly code: string;
}

/* ------------------------------------------------------------------ */
/*  Error → Safe Message Mapping                                       */
/* ------------------------------------------------------------------ */

/**
 * Each entry maps an error constructor to a safe message and error code.
 * Order doesn't matter — matching is done by instanceof.
 *
 * [SOLID/OCP] — Add new mappings here without modifying sanitizeError().
 */
type ErrorMapping = readonly {
  readonly match: new (...args: never[]) => Error;
  readonly message: string;
  readonly code: string;
}[];

const ERROR_MAP: ErrorMapping = [
  // State errors
  {
    match: StateCorruptedError,
    message: "State storage error. Craig will attempt recovery.",
    code: "STATE_ERROR",
  },

  // Config errors
  {
    match: ConfigNotFoundError,
    message: "Configuration not found. Run craig_config to set up.",
    code: "CONFIG_ERROR",
  },
  {
    match: ConfigValidationError,
    message: "Configuration is invalid. Check your craig.yaml.",
    code: "CONFIG_ERROR",
  },
  {
    match: ConfigParseError,
    message: "Configuration file could not be parsed.",
    code: "CONFIG_ERROR",
  },

  // GitHub errors
  {
    match: GitHubRateLimitError,
    message: "GitHub API rate limit exceeded. Try again later.",
    code: "RATE_LIMIT",
  },
  {
    match: GitHubAuthError,
    message: "GitHub authentication failed. Check your token.",
    code: "AUTH_ERROR",
  },
  {
    match: GitHubNotFoundError,
    message: "Requested GitHub resource was not found.",
    code: "NOT_FOUND",
  },
  {
    match: GitHubAPIError,
    message: "GitHub API request failed.",
    code: "GITHUB_ERROR",
  },

  // Git provider-agnostic errors
  {
    match: GitRateLimitError,
    message: "Git provider rate limit exceeded. Try again later.",
    code: "RATE_LIMIT",
  },
  {
    match: GitAuthError,
    message: "Git provider authentication failed. Check your token.",
    code: "AUTH_ERROR",
  },
  {
    match: GitNotFoundError,
    message: "Requested resource was not found on the Git provider.",
    code: "NOT_FOUND",
  },
  {
    match: GitAPIError,
    message: "Git provider API request failed.",
    code: "GIT_ERROR",
  },
  {
    match: GitProviderNotSupportedError,
    message: "Git provider not supported. Check your config.",
    code: "PROVIDER_ERROR",
  },

  // Copilot errors
  {
    match: CopilotSessionError,
    message: "Copilot session failed. Retry the operation.",
    code: "COPILOT_ERROR",
  },
  {
    match: CopilotTimeoutError,
    message: "Copilot operation timed out. Try again.",
    code: "TIMEOUT",
  },
  {
    match: CopilotUnavailableError,
    message: "Copilot is not available. Check your installation.",
    code: "COPILOT_ERROR",
  },
] as const;

/** Default safe message for unrecognized errors. */
const DEFAULT_MESSAGE = "An internal error occurred.";
const DEFAULT_CODE = "INTERNAL_ERROR";

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Sanitize an error for MCP client consumption.
 *
 * - Known error types → safe, pre-defined message + granular code.
 * - Unknown errors → generic "internal error" message.
 * - All errors are logged to stderr with full detail for debugging.
 *
 * [SECURITY] Never returns raw error.message to the MCP client.
 *
 * @param error - The caught error (unknown type, as from catch blocks).
 * @returns A sanitized error with a safe message and error code.
 */
export function sanitizeError(error: unknown): SanitizedError {
  logDetailedError(error);

  if (error instanceof Error) {
    const mapping = ERROR_MAP.find((entry) => error instanceof entry.match);
    if (mapping) {
      return { message: mapping.message, code: mapping.code };
    }
  }

  return { message: DEFAULT_MESSAGE, code: DEFAULT_CODE };
}

/* ------------------------------------------------------------------ */
/*  Private Helpers                                                    */
/* ------------------------------------------------------------------ */

/**
 * Log the full error details to stderr for debugging.
 *
 * [SECURITY] Stderr is for operators, not MCP clients.
 * MCP uses stdout for JSON-RPC — stderr is safe for diagnostics.
 */
function logDetailedError(error: unknown): void {
  if (error instanceof Error) {
    const name = error.name || error.constructor.name;
    console.error(`[Craig] ${name}: ${error.message}`);
  } else {
    console.error(`[Craig] Non-error thrown: ${String(error)}`);
  }
}
