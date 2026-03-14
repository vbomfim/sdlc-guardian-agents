/**
 * Provider-agnostic error types for Git platform operations.
 *
 * These errors represent failures that can occur with any Git hosting
 * provider (GitHub, Azure DevOps, etc.). Provider-specific error types
 * (e.g., GitHubRateLimitError) still exist for adapter-internal use,
 * but components consuming GitPort should catch these generic errors.
 *
 * @see [CLEAN-CODE] — Specific exception types with context
 * @see [HEXAGONAL] — Errors are part of the port contract
 */

/** Thrown when the Git provider's API rate limit is exceeded. */
export class GitRateLimitError extends Error {
  readonly reset: Date;

  constructor(reset: Date, options?: ErrorOptions) {
    super(
      `Git provider rate limit exceeded. Resets at ${reset.toISOString()}`,
      options,
    );
    this.name = "GitRateLimitError";
    this.reset = reset;
  }
}

/** Thrown when authentication to the Git provider fails. */
export class GitAuthError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "GitAuthError";
  }
}

/** Thrown when a requested resource is not found on the Git provider. */
export class GitNotFoundError extends Error {
  constructor(resource: string, options?: ErrorOptions) {
    super(`Resource not found: ${resource}`, options);
    this.name = "GitNotFoundError";
  }
}

/** Thrown for generic Git provider API errors with status code. */
export class GitAPIError extends Error {
  readonly status: number;

  constructor(status: number, message: string, options?: ErrorOptions) {
    super(`Git provider API error (${status}): ${message}`, options);
    this.name = "GitAPIError";
    this.status = status;
  }
}

/** Thrown when a Git provider is not supported or not configured. */
export class GitProviderNotSupportedError extends Error {
  constructor(provider: string, options?: ErrorOptions) {
    super(
      `Git provider "${provider}" is not supported. Supported: github, ado`,
      options,
    );
    this.name = "GitProviderNotSupportedError";
  }
}
