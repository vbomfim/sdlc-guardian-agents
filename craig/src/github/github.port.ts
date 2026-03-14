/**
 * GitHubPort — the inward-facing interface for GitHub API operations.
 *
 * All GitHub interactions go through this port. No other component
 * imports @octokit/rest directly. This enables swapping the adapter
 * (e.g., from octokit to `gh` CLI) without touching consumer code.
 *
 * @see [HEXAGONAL] — Ports & Adapters pattern
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
} from "./github.types.js";

export interface GitHubPort {
  // Issues
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
