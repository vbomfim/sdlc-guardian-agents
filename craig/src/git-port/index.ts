/**
 * Git port component — public API barrel export.
 *
 * This is the primary import point for Git platform abstractions.
 * All consumers should import from here, not from internal files.
 *
 * @module git-port
 */

// Port interface
export type { GitPort } from "./git.port.js";

// Factory
export { createGitAdapter } from "./git-port.factory.js";
export type { GitAdapterConfig } from "./git-port.factory.js";

// Types
export type {
  GitProvider,
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
} from "./git.types.js";

// Errors
export {
  GitRateLimitError,
  GitAuthError,
  GitNotFoundError,
  GitAPIError,
  GitProviderNotSupportedError,
} from "./git.errors.js";

// Adapters (for direct construction in tests or composition roots)
export { AdoAdapter } from "./ado/index.js";
export type { AdoAdapterOptions } from "./ado/index.js";
