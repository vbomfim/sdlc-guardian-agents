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
