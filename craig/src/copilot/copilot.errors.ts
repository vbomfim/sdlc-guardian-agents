/**
 * Custom error types for the Copilot component.
 *
 * Each error type maps to a specific failure mode,
 * giving consumers precise control over error handling.
 *
 * All errors accept an optional `{ cause }` option to preserve
 * the original error chain for debugging.
 *
 * @module copilot
 */

/** Thrown when the Copilot SDK session fails to create or connect. */
export class CopilotSessionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CopilotSessionError";
  }
}

/** Thrown when a Guardian agent invocation exceeds the timeout. */
export class CopilotTimeoutError extends Error {
  public readonly timeout_ms: number;

  constructor(timeout_ms: number, options?: ErrorOptions) {
    super(`Timeout after ${timeout_ms}ms`, options);
    this.name = "CopilotTimeoutError";
    this.timeout_ms = timeout_ms;
  }
}

/** Thrown when Copilot CLI/SDK is not installed or not authenticated. */
export class CopilotUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CopilotUnavailableError";
  }
}
