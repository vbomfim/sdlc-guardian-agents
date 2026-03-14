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
  | "po-guardian"
  | "dev-guardian";

/**
 * Runtime set of valid Guardian agent names.
 *
 * Used for runtime validation of agent names from untrusted input
 * (config files, API payloads). Mirrors the GuardianAgent union.
 *
 * [SECURITY] Prevents arbitrary agent invocation via injection.
 */
export const GUARDIAN_AGENTS: ReadonlySet<string> = new Set<string>([
  "security-guardian",
  "code-review-guardian",
  "qa-guardian",
  "po-guardian",
  "dev-guardian",
]);

/**
 * Type guard: checks if a string is a valid GuardianAgent at runtime.
 *
 * @param value - The string to validate
 * @returns true if the value is a valid GuardianAgent name
 */
export function isGuardianAgent(value: string): value is GuardianAgent {
  return GUARDIAN_AGENTS.has(value);
}

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
 * Successful Guardian agent invocation result.
 *
 * Narrow via `result.success === true` to access output safely.
 *
 * @see Issue #5 — Interface Contract
 */
export interface InvokeSuccess {
  /** Discriminant: invocation succeeded. */
  readonly success: true;

  /** Raw agent output (markdown). */
  readonly output: string;

  /** Duration of the invocation in milliseconds. */
  readonly duration_ms: number;

  /** Model used for the invocation. */
  readonly model_used: string;
}

/**
 * Failed Guardian agent invocation result.
 *
 * Narrow via `result.success === false` to access error safely.
 *
 * @see Issue #5 — Interface Contract
 */
export interface InvokeFailure {
  /** Discriminant: invocation failed. */
  readonly success: false;

  /** Always empty string on failure. */
  readonly output: string;

  /** Duration of the invocation in milliseconds. */
  readonly duration_ms: number;

  /** Model used for the invocation. */
  readonly model_used: string;

  /** Error message describing the failure. Always present on failure. */
  readonly error: string;
}

/**
 * Discriminated union for Guardian agent invocation results.
 *
 * Narrow via `result.success` to get type-safe access:
 * - `true`  → InvokeSuccess (output present, no error field)
 * - `false` → InvokeFailure (error required, output empty)
 *
 * [CLEAN-CODE] Eliminates impossible states — success cannot have error,
 * failure always has error.
 */
export type InvokeResult = InvokeSuccess | InvokeFailure;
