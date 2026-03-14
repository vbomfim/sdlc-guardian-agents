/**
 * Copilot component — Type definitions.
 *
 * Defines the data models owned by the copilot component:
 * InvokeParams, InvokeResult, and Guardian agent names.
 *
 * @module copilot
 */

// ---------------------------------------------------------------------------
// Guardian Agent Types
// ---------------------------------------------------------------------------

/** Supported Guardian agent names for invocation. */
export type GuardianAgent =
  | "security-guardian"
  | "code-review-guardian"
  | "qa-guardian"
  | "po-guardian";

// ---------------------------------------------------------------------------
// Invocation Data Models
// ---------------------------------------------------------------------------

/**
 * Parameters for invoking a Guardian agent.
 *
 * @see Issue #5 — Interface Contract
 */
export interface InvokeParams {
  /** Which Guardian agent to invoke. */
  readonly agent: GuardianAgent;

  /** The task description / prompt for the agent. */
  readonly prompt: string;

  /** Additional context (diff, file list, etc.). */
  readonly context?: string;

  /** Override model from config. */
  readonly model?: string;

  /** Timeout in milliseconds. Default: 300_000 (5 min). */
  readonly timeout?: number;
}

/**
 * Result of a Guardian agent invocation.
 *
 * @see Issue #5 — Interface Contract
 */
export interface InvokeResult {
  /** Whether the invocation succeeded. */
  readonly success: boolean;

  /** Raw agent output (markdown). Empty string on failure. */
  readonly output: string;

  /** Duration of the invocation in milliseconds. */
  readonly duration_ms: number;

  /** Model used for the invocation. */
  readonly model_used: string;

  /** Error message if success is false. */
  readonly error?: string;
}
