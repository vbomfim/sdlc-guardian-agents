/**
 * Provider-agnostic type definitions for Git platform operations.
 *
 * These types represent concepts common to all Git hosting platforms
 * (GitHub, Azure DevOps, GitLab, etc.). Field names are platform-neutral.
 *
 * Re-exports existing types from the GitHub component where they are
 * already provider-agnostic. New ADO-specific types are NOT added here —
 * only types that belong to the shared port contract.
 *
 * @see [HEXAGONAL] — Port types shared by all adapters
 * @see [DRY] — Re-export from github.types.ts where already agnostic
 */

// Re-export provider-agnostic types that already exist in github.types.ts
// These types use generic names (IssueReference, CommitInfo, etc.) and
// do not contain any GitHub-specific concepts.
export type {
  CreateIssueParams,
  CreatePRParams,
  CreatePRReviewParams,
  IssueReference,
  PRReference,
  PRReviewReference,
  PullRequestInfo,
  CommentReference,
  CommitInfo,
  CommitDiff,
  DiffFile,
  RateLimitInfo,
} from "../github/github.types.js";

/**
 * Supported Git hosting providers.
 *
 * - "github" — GitHub.com or GitHub Enterprise
 * - "ado" — Azure DevOps Services or Azure DevOps Server
 */
export type GitProvider = "github" | "ado";
