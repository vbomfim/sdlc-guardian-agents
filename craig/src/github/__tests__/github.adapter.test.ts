/**
 * Unit tests for GitHubAdapter.
 *
 * Tests are organized by acceptance criteria from issue #4.
 * All tests mock @octokit/rest — no real API calls.
 *
 * @see [TDD] — Tests written first, implementation second
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GitHubAdapter } from "../github.adapter.js";
import {
  GitHubRateLimitError,
  GitHubAuthError,
  GitHubNotFoundError,
  GitHubAPIError,
} from "../github.errors.js";
import type { CreateIssueParams, CreatePRParams } from "../github.types.js";

// ---------------------------------------------------------------------------
// Mock factory — produces a fake Octokit instance
// ---------------------------------------------------------------------------

function createMockOctokit() {
  return {
    rest: {
      issues: {
        create: vi.fn(),
        listForRepo: vi.fn(),
      },
      pulls: {
        create: vi.fn(),
      },
      repos: {
        createCommitComment: vi.fn(),
        listCommits: vi.fn(),
        getCommit: vi.fn(),
      },
      rateLimit: {
        get: vi.fn(),
      },
    },
  };
}

type MockOctokit = ReturnType<typeof createMockOctokit>;

function createAdapter(
  mockOctokit: MockOctokit,
  owner = "test-owner",
  repo = "test-repo",
): GitHubAdapter {
  return new GitHubAdapter(mockOctokit as never, owner, repo);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GitHubAdapter", () => {
  let mockOctokit: MockOctokit;
  let adapter: GitHubAdapter;

  beforeEach(() => {
    mockOctokit = createMockOctokit();
    adapter = createAdapter(mockOctokit);
  });

  // -------------------------------------------------------------------------
  // AC1: Create issue
  // -------------------------------------------------------------------------
  describe("AC1: Create issue", () => {
    it("creates an issue and returns url + number", async () => {
      const params: CreateIssueParams = {
        title: "Security: SQL injection in src/db.py",
        body: "Found SQL injection vulnerability.",
        labels: ["security", "critical"],
        assignees: ["alice"],
      };

      mockOctokit.rest.issues.create.mockResolvedValue({
        data: {
          html_url: "https://github.com/test-owner/test-repo/issues/42",
          number: 42,
        },
      });

      const result = await adapter.createIssue(params);

      expect(result).toEqual({
        url: "https://github.com/test-owner/test-repo/issues/42",
        number: 42,
      });

      expect(mockOctokit.rest.issues.create).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        title: "Security: SQL injection in src/db.py",
        body: "Found SQL injection vulnerability.",
        labels: ["security", "critical"],
        assignees: ["alice"],
      });
    });

    it("creates an issue without assignees when not provided", async () => {
      const params: CreateIssueParams = {
        title: "Test issue",
        body: "Test body",
        labels: ["bug"],
      };

      mockOctokit.rest.issues.create.mockResolvedValue({
        data: {
          html_url: "https://github.com/test-owner/test-repo/issues/1",
          number: 1,
        },
      });

      await adapter.createIssue(params);

      expect(mockOctokit.rest.issues.create).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        title: "Test issue",
        body: "Test body",
        labels: ["bug"],
        assignees: undefined,
      });
    });

    it("truncates titles longer than 256 characters", async () => {
      const longTitle = "A".repeat(300);
      const params: CreateIssueParams = {
        title: longTitle,
        body: "Body",
        labels: [],
      };

      mockOctokit.rest.issues.create.mockResolvedValue({
        data: {
          html_url: "https://github.com/test-owner/test-repo/issues/1",
          number: 1,
        },
      });

      await adapter.createIssue(params);

      const calledTitle =
        mockOctokit.rest.issues.create.mock.calls[0]![0].title;
      expect(calledTitle).toHaveLength(256);
      expect(calledTitle.endsWith("...")).toBe(true);
    });

    it("does not truncate titles of exactly 256 characters", async () => {
      const title = "B".repeat(256);
      const params: CreateIssueParams = { title, body: "Body", labels: [] };

      mockOctokit.rest.issues.create.mockResolvedValue({
        data: {
          html_url: "https://github.com/test-owner/test-repo/issues/1",
          number: 1,
        },
      });

      await adapter.createIssue(params);

      const calledTitle =
        mockOctokit.rest.issues.create.mock.calls[0]![0].title;
      expect(calledTitle).toHaveLength(256);
      expect(calledTitle).toBe(title);
    });
  });

  // -------------------------------------------------------------------------
  // AC2: Duplicate issue detection
  // -------------------------------------------------------------------------
  describe("AC2: Duplicate issue detection", () => {
    it("finds an existing open issue by exact title match", async () => {
      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [
          {
            title: "Security: SQL injection in src/db.py",
            html_url: "https://github.com/test-owner/test-repo/issues/10",
            number: 10,
            pull_request: undefined,
          },
        ],
      });

      const result = await adapter.findExistingIssue(
        "Security: SQL injection in src/db.py",
      );

      expect(result).toEqual({
        url: "https://github.com/test-owner/test-repo/issues/10",
        number: 10,
      });
    });

    it("returns null when no matching issue exists", async () => {
      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [
          {
            title: "Unrelated issue",
            html_url: "https://github.com/test-owner/test-repo/issues/5",
            number: 5,
            pull_request: undefined,
          },
        ],
      });

      const result = await adapter.findExistingIssue("Non-existent title");
      expect(result).toBeNull();
    });

    it("skips pull requests in the issues list", async () => {
      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [
          {
            title: "PR with same title",
            html_url: "https://github.com/test-owner/test-repo/pull/3",
            number: 3,
            pull_request: { url: "https://api.github.com/..." },
          },
        ],
      });

      const result = await adapter.findExistingIssue("PR with same title");
      expect(result).toBeNull();
    });

    it("paginates through all open issues to find a match", async () => {
      // First page: no match, 100 results (indicates more pages)
      const page1 = Array.from({ length: 100 }, (_, i) => ({
        title: `Issue ${i}`,
        html_url: `https://github.com/test-owner/test-repo/issues/${i}`,
        number: i,
        pull_request: undefined,
      }));

      // Second page: has the match
      const page2 = [
        {
          title: "Target issue",
          html_url: "https://github.com/test-owner/test-repo/issues/101",
          number: 101,
          pull_request: undefined,
        },
      ];

      mockOctokit.rest.issues.listForRepo
        .mockResolvedValueOnce({ data: page1 })
        .mockResolvedValueOnce({ data: page2 });

      const result = await adapter.findExistingIssue("Target issue");

      expect(result).toEqual({
        url: "https://github.com/test-owner/test-repo/issues/101",
        number: 101,
      });
      expect(mockOctokit.rest.issues.listForRepo).toHaveBeenCalledTimes(2);
    });

    it("title matching is case-insensitive", async () => {
      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [
          {
            title: "Security: SQL Injection in src/db.py",
            html_url: "https://github.com/test-owner/test-repo/issues/7",
            number: 7,
            pull_request: undefined,
          },
        ],
      });

      const result = await adapter.findExistingIssue(
        "security: sql injection in src/db.py",
      );
      expect(result).toEqual({
        url: "https://github.com/test-owner/test-repo/issues/7",
        number: 7,
      });
    });
  });

  // -------------------------------------------------------------------------
  // AC2b: List open issues
  // -------------------------------------------------------------------------
  describe("List open issues", () => {
    it("lists open issues without label filter", async () => {
      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [
          {
            title: "Issue 1",
            html_url: "https://github.com/test-owner/test-repo/issues/1",
            number: 1,
            pull_request: undefined,
          },
          {
            title: "Issue 2",
            html_url: "https://github.com/test-owner/test-repo/issues/2",
            number: 2,
            pull_request: undefined,
          },
        ],
      });

      const result = await adapter.listOpenIssues();
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        url: "https://github.com/test-owner/test-repo/issues/1",
        number: 1,
      });
    });

    it("filters issues by labels", async () => {
      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [
          {
            title: "Labeled issue",
            html_url: "https://github.com/test-owner/test-repo/issues/5",
            number: 5,
            pull_request: undefined,
          },
        ],
      });

      await adapter.listOpenIssues(["security", "critical"]);

      expect(mockOctokit.rest.issues.listForRepo).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: "security,critical",
        }),
      );
    });

    it("excludes pull requests from issue listing", async () => {
      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [
          {
            title: "Real issue",
            html_url: "https://github.com/test-owner/test-repo/issues/1",
            number: 1,
            pull_request: undefined,
          },
          {
            title: "A PR",
            html_url: "https://github.com/test-owner/test-repo/pull/2",
            number: 2,
            pull_request: { url: "https://api.github.com/..." },
          },
        ],
      });

      const result = await adapter.listOpenIssues();
      expect(result).toHaveLength(1);
      expect(result[0]!.number).toBe(1);
    });

    it("paginates through all pages of open issues", async () => {
      // First page: 100 results → indicates more pages
      const page1 = Array.from({ length: 100 }, (_, i) => ({
        title: `Issue ${i}`,
        html_url: `https://github.com/test-owner/test-repo/issues/${i}`,
        number: i,
        pull_request: undefined,
      }));

      // Second page: 2 results → last page
      const page2 = [
        {
          title: "Issue 100",
          html_url: "https://github.com/test-owner/test-repo/issues/100",
          number: 100,
          pull_request: undefined,
        },
        {
          title: "Issue 101",
          html_url: "https://github.com/test-owner/test-repo/issues/101",
          number: 101,
          pull_request: undefined,
        },
      ];

      mockOctokit.rest.issues.listForRepo
        .mockResolvedValueOnce({ data: page1 })
        .mockResolvedValueOnce({ data: page2 });

      const result = await adapter.listOpenIssues();

      expect(result).toHaveLength(102);
      expect(result[0]!.number).toBe(0);
      expect(result[101]!.number).toBe(101);
      expect(mockOctokit.rest.issues.listForRepo).toHaveBeenCalledTimes(2);
    });

    it("stops paginating after MAX_PAGES (10) to prevent infinite loops", async () => {
      // Every page returns 100 results (always full → always requests next page)
      const fullPage = Array.from({ length: 100 }, (_, i) => ({
        title: `Issue ${i}`,
        html_url: `https://github.com/test-owner/test-repo/issues/${i}`,
        number: i,
        pull_request: undefined,
      }));

      mockOctokit.rest.issues.listForRepo.mockResolvedValue({ data: fullPage });

      const result = await adapter.listOpenIssues();

      // 10 pages × 100 issues = 1000 max
      expect(result).toHaveLength(1000);
      expect(mockOctokit.rest.issues.listForRepo).toHaveBeenCalledTimes(10);
    });
  });

  // -------------------------------------------------------------------------
  // AC3: Create draft PR
  // -------------------------------------------------------------------------
  describe("AC3: Create draft PR", () => {
    it("creates a draft pull request and returns url + number", async () => {
      const params: CreatePRParams = {
        title: "fix: linting issues",
        body: "Auto-fixed linting issues.",
        head: "craig/fix-linting-2025-07-11",
        base: "main",
        draft: true,
      };

      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: {
          html_url: "https://github.com/test-owner/test-repo/pull/15",
          number: 15,
        },
      });

      const result = await adapter.createDraftPR(params);

      expect(result).toEqual({
        url: "https://github.com/test-owner/test-repo/pull/15",
        number: 15,
      });

      expect(mockOctokit.rest.pulls.create).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        title: "fix: linting issues",
        body: "Auto-fixed linting issues.",
        head: "craig/fix-linting-2025-07-11",
        base: "main",
        draft: true,
      });
    });

    it("always forces draft: true even if not specified in type", async () => {
      const params: CreatePRParams = {
        title: "test",
        body: "test",
        head: "feature",
        base: "main",
        draft: true,
      };

      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: {
          html_url: "https://github.com/test-owner/test-repo/pull/1",
          number: 1,
        },
      });

      await adapter.createDraftPR(params);

      expect(mockOctokit.rest.pulls.create).toHaveBeenCalledWith(
        expect.objectContaining({ draft: true }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // AC4: Rate limit handling
  // -------------------------------------------------------------------------
  describe("AC4: Rate limit handling", () => {
    it("returns rate limit info with remaining count and reset date", async () => {
      const resetTimestamp = Math.floor(Date.now() / 1000) + 3600;

      mockOctokit.rest.rateLimit.get.mockResolvedValue({
        data: {
          rate: {
            remaining: 4500,
            reset: resetTimestamp,
          },
        },
      });

      const result = await adapter.getRateLimit();

      expect(result.remaining).toBe(4500);
      expect(result.reset).toBeInstanceOf(Date);
      expect(result.reset.getTime()).toBe(resetTimestamp * 1000);
    });

    it("maps errors through execute() wrapper (e.g. 401 → GitHubAuthError)", async () => {
      const error = new Error("Bad credentials") as Error & { status: number };
      error.status = 401;

      mockOctokit.rest.rateLimit.get.mockRejectedValue(error);

      await expect(adapter.getRateLimit()).rejects.toThrow(GitHubAuthError);
    });

    it("throws GitHubRateLimitError on 403 with rate limit message", async () => {
      const resetTimestamp = Math.floor(Date.now() / 1000) + 3600;
      const error = new Error("API rate limit exceeded") as Error & {
        status: number;
        response: { headers: Record<string, string> };
      };
      error.status = 403;
      error.response = {
        headers: { "x-ratelimit-reset": String(resetTimestamp) },
      };

      mockOctokit.rest.issues.create.mockRejectedValue(error);

      await expect(
        adapter.createIssue({ title: "t", body: "b", labels: [] }),
      ).rejects.toThrow(GitHubRateLimitError);
    });
  });

  // -------------------------------------------------------------------------
  // AC5: Get merge commits
  // -------------------------------------------------------------------------
  describe("AC5: Get merge commits", () => {
    it("returns merge commits since a given SHA", async () => {
      mockOctokit.rest.repos.listCommits.mockResolvedValue({
        data: [
          {
            sha: "abc123",
            commit: {
              message: "Merge pull request #10",
              author: {
                name: "Alice",
                date: "2025-07-11T10:00:00Z",
              },
            },
            parents: [{ sha: "p1" }, { sha: "p2" }],
          },
          {
            sha: "def456",
            commit: {
              message: "Merge branch 'feature/x'",
              author: {
                name: "Bob",
                date: "2025-07-11T11:00:00Z",
              },
            },
            parents: [{ sha: "p3" }, { sha: "p4" }],
          },
          {
            sha: "ghi789",
            commit: {
              message: "Regular commit (not a merge)",
              author: {
                name: "Charlie",
                date: "2025-07-11T12:00:00Z",
              },
            },
            parents: [{ sha: "p5" }],
          },
        ],
      });

      const result = await adapter.getMergeCommits("old-sha");

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        sha: "abc123",
        message: "Merge pull request #10",
        author: "Alice",
        timestamp: "2025-07-11T10:00:00Z",
      });
      expect(result[1]).toEqual({
        sha: "def456",
        message: "Merge branch 'feature/x'",
        author: "Bob",
        timestamp: "2025-07-11T11:00:00Z",
      });
    });

    it("returns empty array when no merge commits exist", async () => {
      mockOctokit.rest.repos.listCommits.mockResolvedValue({
        data: [
          {
            sha: "abc",
            commit: {
              message: "Regular commit",
              author: { name: "Alice", date: "2025-07-11T10:00:00Z" },
            },
            parents: [{ sha: "p1" }],
          },
        ],
      });

      const result = await adapter.getMergeCommits("old-sha");
      expect(result).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // AC6: Post commit comment
  // -------------------------------------------------------------------------
  describe("AC6: Post commit comment", () => {
    it("creates a commit comment and returns the URL", async () => {
      mockOctokit.rest.repos.createCommitComment.mockResolvedValue({
        data: {
          html_url:
            "https://github.com/test-owner/test-repo/commit/abc123#comment-1",
        },
      });

      const result = await adapter.createCommitComment(
        "abc123",
        "## Craig Review\nNo issues found.",
      );

      expect(result).toEqual({
        url: "https://github.com/test-owner/test-repo/commit/abc123#comment-1",
      });

      expect(mockOctokit.rest.repos.createCommitComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        commit_sha: "abc123",
        body: "## Craig Review\nNo issues found.",
      });
    });
  });

  // -------------------------------------------------------------------------
  // Repository: getLatestCommits
  // -------------------------------------------------------------------------
  describe("getLatestCommits", () => {
    it("returns commits since a given ISO date", async () => {
      mockOctokit.rest.repos.listCommits.mockResolvedValue({
        data: [
          {
            sha: "aaa",
            commit: {
              message: "feat: add auth",
              author: { name: "Alice", date: "2025-07-11T10:00:00Z" },
            },
            parents: [{ sha: "p1" }],
          },
        ],
      });

      const result = await adapter.getLatestCommits("2025-07-10T00:00:00Z");

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        sha: "aaa",
        message: "feat: add auth",
        author: "Alice",
        timestamp: "2025-07-11T10:00:00Z",
      });

      expect(mockOctokit.rest.repos.listCommits).toHaveBeenCalledWith(
        expect.objectContaining({
          since: "2025-07-10T00:00:00Z",
        }),
      );
    });

    it("filters by branch when specified", async () => {
      mockOctokit.rest.repos.listCommits.mockResolvedValue({ data: [] });

      await adapter.getLatestCommits("2025-07-10T00:00:00Z", "develop");

      expect(mockOctokit.rest.repos.listCommits).toHaveBeenCalledWith(
        expect.objectContaining({
          sha: "develop",
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Repository: getCommitDiff
  // -------------------------------------------------------------------------
  describe("getCommitDiff", () => {
    it("returns file changes for a commit", async () => {
      mockOctokit.rest.repos.getCommit.mockResolvedValue({
        data: {
          sha: "abc123",
          files: [
            {
              filename: "src/app.ts",
              status: "modified",
              additions: 10,
              deletions: 3,
              patch: "@@ -1,5 +1,12 @@\n+new line",
            },
            {
              filename: "src/util.ts",
              status: "added",
              additions: 50,
              deletions: 0,
              patch: undefined,
            },
          ],
        },
      });

      const result = await adapter.getCommitDiff("abc123");

      expect(result.sha).toBe("abc123");
      expect(result.files).toHaveLength(2);
      expect(result.files[0]).toEqual({
        filename: "src/app.ts",
        status: "modified",
        additions: 10,
        deletions: 3,
        patch: "@@ -1,5 +1,12 @@\n+new line",
      });
      expect(result.files[1]).toEqual({
        filename: "src/util.ts",
        status: "added",
        additions: 50,
        deletions: 0,
        patch: undefined,
      });
    });

    it("handles commits with no files", async () => {
      mockOctokit.rest.repos.getCommit.mockResolvedValue({
        data: { sha: "empty-sha", files: [] },
      });

      const result = await adapter.getCommitDiff("empty-sha");

      expect(result.sha).toBe("empty-sha");
      expect(result.files).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------
  describe("Error handling", () => {
    it("maps 401 to GitHubAuthError", async () => {
      const error = new Error("Bad credentials") as Error & { status: number };
      error.status = 401;

      mockOctokit.rest.issues.create.mockRejectedValue(error);

      await expect(
        adapter.createIssue({ title: "t", body: "b", labels: [] }),
      ).rejects.toThrow(GitHubAuthError);
    });

    it("maps 404 to GitHubNotFoundError", async () => {
      const error = new Error("Not Found") as Error & { status: number };
      error.status = 404;

      mockOctokit.rest.repos.getCommit.mockRejectedValue(error);

      await expect(adapter.getCommitDiff("missing-sha")).rejects.toThrow(
        GitHubNotFoundError,
      );
    });

    it("maps 403 without rate limit message to GitHubAuthError", async () => {
      const error = new Error("Resource not accessible") as Error & {
        status: number;
      };
      error.status = 403;

      mockOctokit.rest.issues.create.mockRejectedValue(error);

      await expect(
        adapter.createIssue({ title: "t", body: "b", labels: [] }),
      ).rejects.toThrow(GitHubAuthError);
    });

    it("retries once on 500 error then throws GitHubAPIError", async () => {
      const error = new Error("Internal Server Error") as Error & {
        status: number;
      };
      error.status = 500;

      mockOctokit.rest.issues.create.mockRejectedValue(error);

      await expect(
        adapter.createIssue({ title: "t", body: "b", labels: [] }),
      ).rejects.toThrow(GitHubAPIError);

      // Should have retried once (2 calls total)
      expect(mockOctokit.rest.issues.create).toHaveBeenCalledTimes(2);
    });

    it("succeeds on retry after initial 500", async () => {
      const error = new Error("Internal Server Error") as Error & {
        status: number;
      };
      error.status = 500;

      mockOctokit.rest.issues.create
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({
          data: {
            html_url: "https://github.com/test-owner/test-repo/issues/1",
            number: 1,
          },
        });

      const result = await adapter.createIssue({
        title: "t",
        body: "b",
        labels: [],
      });

      expect(result.number).toBe(1);
      expect(mockOctokit.rest.issues.create).toHaveBeenCalledTimes(2);
    });

    it("does not retry on 4xx errors (except 403 rate limit)", async () => {
      const error = new Error("Validation Failed") as Error & {
        status: number;
      };
      error.status = 422;

      mockOctokit.rest.issues.create.mockRejectedValue(error);

      await expect(
        adapter.createIssue({ title: "t", body: "b", labels: [] }),
      ).rejects.toThrow(GitHubAPIError);

      expect(mockOctokit.rest.issues.create).toHaveBeenCalledTimes(1);
    });

    it("retries once on 502 error", async () => {
      const error = new Error("Bad Gateway") as Error & { status: number };
      error.status = 502;

      mockOctokit.rest.issues.create.mockRejectedValue(error);

      await expect(
        adapter.createIssue({ title: "t", body: "b", labels: [] }),
      ).rejects.toThrow(GitHubAPIError);

      expect(mockOctokit.rest.issues.create).toHaveBeenCalledTimes(2);
    });

    it("throws GitHubAPIError for unknown errors with status", async () => {
      const error = new Error("Teapot") as Error & { status: number };
      error.status = 418;

      mockOctokit.rest.issues.create.mockRejectedValue(error);

      await expect(
        adapter.createIssue({ title: "t", body: "b", labels: [] }),
      ).rejects.toThrow(GitHubAPIError);
    });

    it("re-throws non-HTTP errors without wrapping", async () => {
      const error = new TypeError("Network failure");
      mockOctokit.rest.issues.create.mockRejectedValue(error);

      await expect(
        adapter.createIssue({ title: "t", body: "b", labels: [] }),
      ).rejects.toThrow(TypeError);
    });
  });

  // -------------------------------------------------------------------------
  // Factory function
  // -------------------------------------------------------------------------
  describe("createGitHubAdapter factory", () => {
    it("throws GitHubAuthError when GITHUB_TOKEN is not set", () => {
      // Import dynamically to test the factory
      expect(() =>
        GitHubAdapter.create({
          owner: "test",
          repo: "test",
          token: "",
        }),
      ).toThrow(GitHubAuthError);
    });

    it("creates an adapter when token is provided", () => {
      const adapter = GitHubAdapter.create({
        owner: "test",
        repo: "test",
        token: "ghp_test123456",
      });

      expect(adapter).toBeInstanceOf(GitHubAdapter);
    });
  });
});
