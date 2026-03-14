/**
 * Custom error types for the Auto-Fix analyzer.
 *
 * Each error type maps to a specific class of auto-fix failure.
 * All extend Error with ErrorOptions for error chaining.
 *
 * @module analyzers/auto-fix
 * @see [CLEAN-CODE] — Specific exception types with context
 */

/** Thrown when a linter fix command introduces new issues. */
export class FixVerificationError extends Error {
  constructor(
    readonly linterName: string,
    readonly details: string,
    options?: ErrorOptions,
  ) {
    super(
      `Fix verification failed for ${linterName}: new issues detected. ${details}`,
      options,
    );
    this.name = "FixVerificationError";
  }
}

/** Thrown when git operations fail during auto-fix. */
export class GitOpsError extends Error {
  constructor(
    readonly operation: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(`Git operation '${operation}' failed: ${message}`, options);
    this.name = "GitOpsError";
  }
}
