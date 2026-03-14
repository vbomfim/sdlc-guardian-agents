/**
 * Type definitions for the GitHub integration component.
 *
 * All types use readonly properties to enforce immutability.
 * Field names use snake_case to match project conventions.
 */

/** Parameters for creating a GitHub issue. */
export interface CreateIssueParams {
  readonly title: string;
  readonly body: string;
  readonly labels: string[];
  readonly assignees?: string[];
}

/** Parameters for creating a draft pull request. */
export interface CreatePRParams {
  readonly title: string;
  readonly body: string;
  readonly head: string;
  readonly base: string;
  readonly draft: true;
}

/** Represents a GitHub issue reference (URL + number). */
export interface IssueReference {
  readonly url: string;
  readonly number: number;
}

/** Represents a GitHub pull request reference (URL + number). */
export interface PRReference {
  readonly url: string;
  readonly number: number;
}

/** Represents a GitHub commit comment reference. */
export interface CommentReference {
  readonly url: string;
}

/** Represents a GitHub commit with metadata. */
export interface CommitInfo {
  readonly sha: string;
  readonly message: string;
  readonly author: string;
  readonly timestamp: string;
}

/** Represents a commit diff. */
export interface CommitDiff {
  readonly sha: string;
  readonly files: readonly DiffFile[];
}

/** Represents a single file in a commit diff. */
export interface DiffFile {
  readonly filename: string;
  readonly status: string;
  readonly additions: number;
  readonly deletions: number;
  readonly patch?: string;
}

/** GitHub API rate limit information. */
export interface RateLimitInfo {
  readonly remaining: number;
  readonly reset: Date;
}

// ---------------------------------------------------------------------------
// Pull Request Types (PR Monitoring — Issue #33)
// ---------------------------------------------------------------------------

/** Represents an open pull request with metadata for monitoring. */
export interface PullRequestInfo {
  /** PR number. */
  readonly number: number;
  /** PR title. */
  readonly title: string;
  /** Head branch SHA (latest commit). */
  readonly head_sha: string;
  /** Head branch name. */
  readonly head_ref: string;
  /** Base branch name. */
  readonly base_ref: string;
  /** PR author login. */
  readonly author: string;
  /** PR HTML URL. */
  readonly url: string;
}

/** Parameters for posting a PR review. */
export interface CreatePRReviewParams {
  /** PR number to review. */
  readonly pull_number: number;
  /** Review body (markdown). */
  readonly body: string;
  /** Review event type. */
  readonly event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES";
}

/** Reference to a posted PR review. */
export interface PRReviewReference {
  /** Review ID. */
  readonly id: number;
  /** HTML URL of the review. */
  readonly url: string;
}
