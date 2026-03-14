/**
 * GitHub integration component — public API.
 *
 * All consumers import from this barrel. No direct imports
 * from internal files outside this component.
 *
 * Note: For new code, prefer importing from "../git-port/index.js"
 * which provides the provider-agnostic GitPort interface.
 */

export { GitHubAdapter } from "./github.adapter.js";
/** @deprecated Use GitPort from "git-port" module for new code. */
export type { GitHubPort } from "./github.port.js";
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
} from "./github.types.js";
export {
  GitHubRateLimitError,
  GitHubAuthError,
  GitHubNotFoundError,
  GitHubAPIError,
} from "./github.errors.js";
