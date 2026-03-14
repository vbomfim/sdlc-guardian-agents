/**
 * GitPort — Provider-agnostic interface for Git platform operations.
 *
 * All components that need to interact with a Git hosting platform
 * (GitHub, Azure DevOps, etc.) depend on this port. No component
 * should import a concrete adapter directly.
 *
 * This interface is extracted from the original GitHubPort. The method
 * signatures are identical — only the name changed to reflect that the
 * port is no longer GitHub-specific.
 *
 * @see [HEXAGONAL] — Ports & Adapters: provider-agnostic contract
 * @see [SOLID/DIP] — Depend on abstractions, not concrete adapters
 * @see [SOLID/LSP] — All adapters (GitHub, ADO) are interchangeable
 */

import type {
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
  RateLimitInfo,
} from "./git.types.js";

export interface GitPort {
  // Work Items / Issues
  createIssue(params: CreateIssueParams): Promise<IssueReference>;
  createIssueComment(issueNumber: number, body: string): Promise<CommentReference>;
  findExistingIssue(title: string): Promise<IssueReference | null>;
  listOpenIssues(labels?: string[]): Promise<IssueReference[]>;

  // Pull Requests
  createDraftPR(params: CreatePRParams): Promise<PRReference>;
  listOpenPRs(): Promise<PullRequestInfo[]>;
  getPRDiff(pullNumber: number): Promise<string>;
  postPRReview(params: CreatePRReviewParams): Promise<PRReviewReference>;

  // Review Comments
  createCommitComment(sha: string, body: string): Promise<CommentReference>;

  // Repository
  getLatestCommits(since: string, branch?: string): Promise<CommitInfo[]>;
  getCommitDiff(sha: string): Promise<CommitDiff>;
  getMergeCommits(since: string): Promise<CommitInfo[]>;

  // Rate Limiting
  getRateLimit(): Promise<RateLimitInfo>;
}
