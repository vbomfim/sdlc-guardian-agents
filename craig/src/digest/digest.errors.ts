/**
 * Custom error types for the Digest Reporter component.
 *
 * [CLEAN-CODE] Specific exception types with descriptive messages.
 *
 * @module digest/errors
 */

/** Thrown when an invalid digest period is provided. */
export class InvalidPeriodError extends Error {
  constructor(period: string) {
    super(`Invalid digest period: "${period}". Must be "today", "week", or "month".`);
    this.name = "InvalidPeriodError";
  }
}

/** Thrown when publishing a digest to GitHub fails. */
export class DigestPublishError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(`Failed to publish digest: ${message}`, options);
    this.name = "DigestPublishError";
  }
}
