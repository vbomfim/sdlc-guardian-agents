/**
 * GitHubAdapter — Octokit-based implementation of GitHubPort.
 *
 * All GitHub API calls are centralized here. No other component
 * imports @octokit/rest directly. Handles rate limiting, retries,
 * error mapping, and pagination.
 *
 * @see [HEXAGONAL] — Adapter implements the GitHubPort interface
 * @see [CLEAN-CODE] — Small functions, clear error handling
 * @see [SOLID] — Single Responsibility: only GitHub API interaction
 */

import { Octokit } from "@octokit/rest";
import type { GitHubPort } from "./github.port.js";
import type {
  CreateIssueParams,
  CreatePRParams,
  IssueReference,
  PRReference,
  CommentReference,
  CommitInfo,
  CommitDiff,
  RateLimitInfo,
} from "./github.types.js";
import {
  GitHubRateLimitError,
  GitHubAuthError,
  GitHubNotFoundError,
  GitHubAPIError,
} from "./github.errors.js";

/** Maximum title length for GitHub issues. */
const MAX_TITLE_LENGTH = 256;

/** Number of items per page for paginated requests. */
const PAGE_SIZE = 100;

/** Delay in ms before retrying a 5xx error. */
const RETRY_DELAY_MS = 2000;

/** Factory options for creating a GitHubAdapter. */
interface CreateAdapterOptions {
  readonly owner: string;
  readonly repo: string;
  readonly token: string;
}

export class GitHubAdapter implements GitHubPort {
  private readonly octokit: Octokit;
  private readonly owner: string;
  private readonly repo: string;

  constructor(octokit: Octokit, owner: string, repo: string) {
    this.octokit = octokit;
    this.owner = owner;
    this.repo = repo;
  }

  /**
   * Factory method to create a GitHubAdapter with a real Octokit instance.
   *
   * @throws GitHubAuthError if token is empty
   */
  static create(options: CreateAdapterOptions): GitHubAdapter {
    if (!options.token) {
      throw new GitHubAuthError(
        "GITHUB_TOKEN is required. Set it as an environment variable.",
      );
    }

    const octokit = new Octokit({ auth: options.token });
    return new GitHubAdapter(octokit, options.owner, options.repo);
  }

  // -----------------------------------------------------------------------
  // Issues
  // -----------------------------------------------------------------------

  async createIssue(params: CreateIssueParams): Promise<IssueReference> {
    const title = truncateTitle(params.title);

    const response = await this.execute(() =>
      this.octokit.rest.issues.create({
        owner: this.owner,
        repo: this.repo,
        title,
        body: params.body,
        labels: params.labels,
        assignees: params.assignees,
      }),
    );

    return {
      url: response.data.html_url,
      number: response.data.number,
    };
  }

  async findExistingIssue(title: string): Promise<IssueReference | null> {
    let page = 1;

    // eslint-disable-next-line no-constant-condition -- pagination loop
    while (true) {
      const response = await this.execute(() =>
        this.octokit.rest.issues.listForRepo({
          owner: this.owner,
          repo: this.repo,
          state: "open",
          per_page: PAGE_SIZE,
          page,
        }),
      );

      const issues = response.data;
      const match = findMatchingIssue(issues, title);

      if (match) {
        return match;
      }

      if (issues.length < PAGE_SIZE) {
        return null;
      }

      page++;
    }
  }

  async listOpenIssues(labels?: string[]): Promise<IssueReference[]> {
    const response = await this.execute(() =>
      this.octokit.rest.issues.listForRepo({
        owner: this.owner,
        repo: this.repo,
        state: "open",
        per_page: PAGE_SIZE,
        labels: labels?.join(","),
      }),
    );

    return response.data
      .filter((item: GitHubIssueItem) => !item.pull_request)
      .map((item: GitHubIssueItem) => ({
        url: item.html_url,
        number: item.number,
      }));
  }

  // -----------------------------------------------------------------------
  // Pull Requests
  // -----------------------------------------------------------------------

  async createDraftPR(params: CreatePRParams): Promise<PRReference> {
    const response = await this.execute(() =>
      this.octokit.rest.pulls.create({
        owner: this.owner,
        repo: this.repo,
        title: params.title,
        body: params.body,
        head: params.head,
        base: params.base,
        draft: true, // Always force draft — Craig never creates ready PRs
      }),
    );

    return {
      url: response.data.html_url,
      number: response.data.number,
    };
  }

  // -----------------------------------------------------------------------
  // Review Comments
  // -----------------------------------------------------------------------

  async createCommitComment(
    sha: string,
    body: string,
  ): Promise<CommentReference> {
    const response = await this.execute(() =>
      this.octokit.rest.repos.createCommitComment({
        owner: this.owner,
        repo: this.repo,
        commit_sha: sha,
        body,
      }),
    );

    return { url: response.data.html_url };
  }

  // -----------------------------------------------------------------------
  // Repository
  // -----------------------------------------------------------------------

  async getLatestCommits(
    since: string,
    branch?: string,
  ): Promise<CommitInfo[]> {
    const response = await this.execute(() =>
      this.octokit.rest.repos.listCommits({
        owner: this.owner,
        repo: this.repo,
        since,
        sha: branch,
        per_page: PAGE_SIZE,
      }),
    );

    return response.data.map(mapCommit);
  }

  async getCommitDiff(sha: string): Promise<CommitDiff> {
    const response = await this.execute(() =>
      this.octokit.rest.repos.getCommit({
        owner: this.owner,
        repo: this.repo,
        ref: sha,
      }),
    );

    return {
      sha: response.data.sha,
      files: (response.data.files ?? []).map(
        (file: GitHubDiffFileItem) => ({
          filename: file.filename,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          patch: file.patch,
        }),
      ),
    };
  }

  async getMergeCommits(since: string): Promise<CommitInfo[]> {
    const response = await this.execute(() =>
      this.octokit.rest.repos.listCommits({
        owner: this.owner,
        repo: this.repo,
        since,
        per_page: PAGE_SIZE,
      }),
    );

    return response.data
      .filter(isMergeCommit)
      .map(mapCommit);
  }

  // -----------------------------------------------------------------------
  // Rate Limiting
  // -----------------------------------------------------------------------

  async getRateLimit(): Promise<RateLimitInfo> {
    const response = await this.octokit.rest.rateLimit.get();

    return {
      remaining: response.data.rate.remaining,
      reset: new Date(response.data.rate.reset * 1000),
    };
  }

  // -----------------------------------------------------------------------
  // Error handling & retry logic (private)
  // -----------------------------------------------------------------------

  /**
   * Execute a GitHub API call with error mapping and retry on 5xx.
   *
   * - 401 → GitHubAuthError
   * - 403 + rate limit → GitHubRateLimitError
   * - 403 (other) → GitHubAuthError
   * - 404 → GitHubNotFoundError
   * - 5xx → Retry once after delay, then GitHubAPIError
   * - 4xx → GitHubAPIError (no retry)
   * - Non-HTTP errors → re-thrown as-is
   */
  private async execute<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error: unknown) {
      if (!isOctokitError(error)) {
        throw error;
      }

      if (isServerError(error.status)) {
        return this.retryOnce(fn, error);
      }

      throw mapError(error);
    }
  }

  private async retryOnce<T>(
    fn: () => Promise<T>,
    _originalError: OctokitError,
  ): Promise<T> {
    await delay(RETRY_DELAY_MS);

    try {
      return await fn();
    } catch (retryError: unknown) {
      if (isOctokitError(retryError)) {
        throw mapError(retryError);
      }
      throw retryError;
    }
  }
}

// ---------------------------------------------------------------------------
// Helper functions (pure, no side effects)
// ---------------------------------------------------------------------------

/** Truncate title to MAX_TITLE_LENGTH, appending "..." if truncated. */
function truncateTitle(title: string): string {
  if (title.length <= MAX_TITLE_LENGTH) {
    return title;
  }
  return title.slice(0, MAX_TITLE_LENGTH - 3) + "...";
}

/** Find an issue matching the given title (case-insensitive, skip PRs). */
function findMatchingIssue(
  issues: GitHubIssueItem[],
  title: string,
): IssueReference | null {
  const normalizedTitle = title.toLowerCase();

  for (const issue of issues) {
    if (issue.pull_request) continue;
    if (issue.title.toLowerCase() === normalizedTitle) {
      return { url: issue.html_url, number: issue.number };
    }
  }

  return null;
}

/** Check if a commit has more than one parent (i.e., is a merge commit). */
function isMergeCommit(commit: GitHubCommitItem): boolean {
  return commit.parents.length > 1;
}

/** Map a GitHub API commit to our CommitInfo type. */
function mapCommit(commit: GitHubCommitItem): CommitInfo {
  return {
    sha: commit.sha,
    message: commit.commit.message,
    author: commit.commit.author?.name ?? "unknown",
    timestamp: commit.commit.author?.date ?? "",
  };
}

/** Promisified delay. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Type guards & error mapping
// ---------------------------------------------------------------------------

interface OctokitError extends Error {
  status: number;
  response?: { headers: Record<string, string> };
}

function isOctokitError(error: unknown): error is OctokitError {
  return error instanceof Error && typeof (error as OctokitError).status === "number";
}

function isServerError(status: number): boolean {
  return status >= 500;
}

function isRateLimitError(error: OctokitError): boolean {
  return (
    error.status === 403 &&
    error.message.toLowerCase().includes("rate limit")
  );
}

function mapError(error: OctokitError): Error {
  if (isRateLimitError(error)) {
    const resetEpoch = Number(error.response?.headers["x-ratelimit-reset"] ?? "0");
    return new GitHubRateLimitError(new Date(resetEpoch * 1000), { cause: error });
  }

  if (error.status === 401 || error.status === 403) {
    return new GitHubAuthError(error.message, { cause: error });
  }

  if (error.status === 404) {
    return new GitHubNotFoundError(error.message, { cause: error });
  }

  return new GitHubAPIError(error.status, error.message, { cause: error });
}

// ---------------------------------------------------------------------------
// Internal GitHub API response types (not exported — adapter internals)
// ---------------------------------------------------------------------------

interface GitHubIssueItem {
  title: string;
  html_url: string;
  number: number;
  pull_request?: unknown;
}

interface GitHubCommitItem {
  sha: string;
  commit: {
    message: string;
    author?: { name?: string; date?: string } | null;
  };
  parents: { sha: string }[];
}

interface GitHubDiffFileItem {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}
