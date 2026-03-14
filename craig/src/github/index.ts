/**
 * GitHub integration component — public API.
 *
 * All consumers import from this barrel. No direct imports
 * from internal files outside this component.
 */

export { GitHubAdapter } from "./github.adapter.js";
export type { GitHubPort } from "./github.port.js";
export type {
  CreateIssueParams,
  CreatePRParams,
  IssueReference,
  PRReference,
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
