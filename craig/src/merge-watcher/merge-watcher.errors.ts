/**
 * Custom error types for the Merge Watcher component.
 *
 * @see [CLEAN-CODE] — Specific exception types with context
 * @module merge-watcher/errors
 */

/**
 * Thrown when a force push is detected on the monitored branch.
 * The watcher resets to the current HEAD and logs a warning.
 */
export class ForcePushDetectedError extends Error {
  readonly missingSha: string;

  constructor(missingSha: string, options?: ErrorOptions) {
    super(
      `Force push detected: SHA "${missingSha}" no longer exists on the branch. Resetting to current HEAD.`,
      options,
    );
    this.name = "ForcePushDetectedError";
    this.missingSha = missingSha;
  }
}

/**
 * Thrown when the watcher encounters consecutive API failures
 * beyond the warning threshold.
 */
export class ConsecutiveFailureWarning extends Error {
  readonly failureCount: number;

  constructor(failureCount: number, options?: ErrorOptions) {
    super(
      `Merge watcher: ${failureCount} consecutive API failures. Polling continues but may indicate a persistent issue.`,
      options,
    );
    this.name = "ConsecutiveFailureWarning";
    this.failureCount = failureCount;
  }
}
