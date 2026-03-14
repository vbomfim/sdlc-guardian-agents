/**
 * AdoAdapter — Azure DevOps implementation of GitPort.
 *
 * Skeleton implementation for Azure DevOps REST API integration.
 * All methods throw GitProviderNotSupportedError until fully implemented
 * in sub-ticket #2 (ADO adapter core).
 *
 * Authentication:
 * - PAT (Personal Access Token) via ADO_TOKEN env var
 * - Managed Identity for production (future)
 *
 * @see [HEXAGONAL] — Adapter implements the GitPort interface
 * @see [YAGNI] — Skeleton only; full implementation in follow-up ticket
 * @see [SOLID/LSP] — Must satisfy the full GitPort contract when complete
 */

import type { GitPort } from "../git.port.js";
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
} from "../git.types.js";
import { GitAuthError } from "../git.errors.js";

/** Factory options for creating an AdoAdapter. */
export interface AdoAdapterOptions {
  readonly organization: string;
  readonly project: string;
  readonly token: string;
}

/**
 * Build the Azure DevOps REST API base URL.
 *
 * @see https://learn.microsoft.com/en-us/rest/api/azure-devops/
 */
function buildBaseUrl(organization: string): string {
  return `https://dev.azure.com/${organization}`;
}

export class AdoAdapter implements GitPort {
  private readonly organization: string;
  private readonly project: string;
  private readonly baseUrl: string;
  /** Token stored privately — never exposed in logs or errors. */
  private readonly token: string;

  private constructor(options: AdoAdapterOptions) {
    this.organization = options.organization;
    this.project = options.project;
    this.token = options.token;
    this.baseUrl = buildBaseUrl(this.organization);
  }

  /**
   * Factory method to create an AdoAdapter.
   *
   * @throws GitAuthError if token is empty
   */
  static create(options: AdoAdapterOptions): AdoAdapter {
    if (!options.token) {
      throw new GitAuthError(
        "ADO_TOKEN is required. Set it as an environment variable.",
      );
    }

    if (!options.organization) {
      throw new GitAuthError(
        "ADO organization is required in config (ado.organization).",
      );
    }

    if (!options.project) {
      throw new GitAuthError(
        "ADO project is required in config (ado.project).",
      );
    }

    return new AdoAdapter(options);
  }

  /**
   * Build HTTP headers for Azure DevOps API requests.
   * Uses Basic authentication with PAT (Personal Access Token).
   *
   * Called by API methods in sub-ticket #2 — currently unreachable
   * since all API methods throw "not implemented".
   *
   * @see https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate
   */
  buildAuthHeaders(): Record<string, string> {
    const encoded = Buffer.from(`:${this.token}`).toString("base64");
    return {
      Authorization: `Basic ${encoded}`,
      "Content-Type": "application/json",
    };
  }

  /** Get the base URL for debugging/testing (not the token). */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /** Get the project name for debugging/testing. */
  getProject(): string {
    return this.project;
  }

  // -----------------------------------------------------------------------
  // Work Items / Issues — Stub implementations
  // -----------------------------------------------------------------------

  async createIssue(_params: CreateIssueParams): Promise<IssueReference> {
    return this.notImplemented("createIssue (ADO Work Items)");
  }

  async createIssueComment(
    _issueNumber: number,
    _body: string,
  ): Promise<CommentReference> {
    return this.notImplemented("createIssueComment (ADO Work Item Comments)");
  }

  async findExistingIssue(_title: string): Promise<IssueReference | null> {
    return this.notImplemented("findExistingIssue (ADO WIQL Query)");
  }

  async listOpenIssues(_labels?: string[]): Promise<IssueReference[]> {
    return this.notImplemented("listOpenIssues (ADO WIQL Query)");
  }

  // -----------------------------------------------------------------------
  // Pull Requests — Stub implementations
  // -----------------------------------------------------------------------

  async createDraftPR(_params: CreatePRParams): Promise<PRReference> {
    return this.notImplemented("createDraftPR (ADO Pull Requests)");
  }

  async listOpenPRs(): Promise<PullRequestInfo[]> {
    return this.notImplemented("listOpenPRs (ADO Pull Requests)");
  }

  async getPRDiff(_pullNumber: number): Promise<string> {
    return this.notImplemented("getPRDiff (ADO Pull Request Diff)");
  }

  async postPRReview(
    _params: CreatePRReviewParams,
  ): Promise<PRReviewReference> {
    return this.notImplemented("postPRReview (ADO Pull Request Threads)");
  }

  // -----------------------------------------------------------------------
  // Review Comments — Stub implementations
  // -----------------------------------------------------------------------

  async createCommitComment(
    _sha: string,
    _body: string,
  ): Promise<CommentReference> {
    return this.notImplemented("createCommitComment (ADO Commit Comments)");
  }

  // -----------------------------------------------------------------------
  // Repository — Stub implementations
  // -----------------------------------------------------------------------

  async getLatestCommits(
    _since: string,
    _branch?: string,
  ): Promise<CommitInfo[]> {
    return this.notImplemented("getLatestCommits (ADO Commits)");
  }

  async getCommitDiff(_sha: string): Promise<CommitDiff> {
    return this.notImplemented("getCommitDiff (ADO Commit Diff)");
  }

  async getMergeCommits(_since: string): Promise<CommitInfo[]> {
    return this.notImplemented("getMergeCommits (ADO Merge Commits)");
  }

  // -----------------------------------------------------------------------
  // Rate Limiting — Stub implementation
  // -----------------------------------------------------------------------

  async getRateLimit(): Promise<RateLimitInfo> {
    // Azure DevOps doesn't have the same rate-limit API as GitHub.
    // Return a permissive default until ADO rate limiting is implemented.
    return {
      remaining: 1000,
      reset: new Date(Date.now() + 3600_000),
    };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Throw a "not implemented" error for stub methods.
   *
   * @see [YAGNI] — Full implementation deferred to sub-ticket #2
   */
  private notImplemented(method: string): never {
    throw new Error(
      `AdoAdapter.${method} is not yet implemented. ` +
        `Full ADO support is tracked in sub-ticket #2.`,
    );
  }
}
