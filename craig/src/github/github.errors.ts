/**
 * Custom error types for the GitHub integration component.
 *
 * Each error type maps to a specific class of GitHub API failure.
 * All extend Error with ErrorOptions for error chaining.
 *
 * @see [CLEAN-CODE] — Specific exception types with context
 */

/** Thrown when the GitHub API rate limit is exceeded. */
export class GitHubRateLimitError extends Error {
  readonly reset: Date;

  constructor(reset: Date, options?: ErrorOptions) {
    super(
      `GitHub API rate limit exceeded. Resets at ${reset.toISOString()}`,
      options,
    );
    this.name = "GitHubRateLimitError";
    this.reset = reset;
  }
}

/** Thrown when the GitHub token is invalid or has insufficient scopes. */
export class GitHubAuthError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "GitHubAuthError";
  }
}

/** Thrown when a GitHub resource (repo, issue, etc.) is not found. */
export class GitHubNotFoundError extends Error {
  constructor(resource: string, options?: ErrorOptions) {
    super(`GitHub resource not found: ${resource}`, options);
    this.name = "GitHubNotFoundError";
  }
}

/** Thrown for generic GitHub API errors with status code. */
export class GitHubAPIError extends Error {
  readonly status: number;

  constructor(status: number, message: string, options?: ErrorOptions) {
    super(`GitHub API error (${status}): ${message}`, options);
    this.name = "GitHubAPIError";
    this.status = status;
  }
}
