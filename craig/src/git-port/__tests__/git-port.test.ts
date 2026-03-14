/**
 * Unit tests for GitPort abstraction layer.
 *
 * Tests are organized by the acceptance criteria from issue #35:
 * 1. GitPort interface is structurally compatible with GitHubPort
 * 2. GitHubAdapter implements GitPort
 * 3. AdoAdapter implements GitPort (skeleton)
 * 4. Factory creates correct adapter based on provider config
 * 5. Config schema validates provider and ado fields
 * 6. Errors are provider-agnostic
 *
 * @see [TDD] — Tests written first, implementation second
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- GitPort types & errors ---
import type { GitPort } from "../git.port.js";
import type { GitProvider } from "../git.types.js";
import {
  GitRateLimitError,
  GitAuthError,
  GitNotFoundError,
  GitAPIError,
  GitProviderNotSupportedError,
} from "../git.errors.js";

// --- Factory ---
import { createGitAdapter } from "../git-port.factory.js";
import type { GitAdapterConfig } from "../git-port.factory.js";

// --- Adapters ---
import { AdoAdapter } from "../ado/ado.adapter.js";
import { GitHubAdapter } from "../../github/github.adapter.js";

// --- GitHub backward compat ---
import type { GitHubPort } from "../../github/github.port.js";

// --- Config ---
import { craigConfigSchema } from "../../config/config.schema.js";

// --- Error sanitizer ---
import { sanitizeError } from "../../core/error-sanitizer.js";

// =========================================================================
// 1. GitPort Interface Compatibility
// =========================================================================

describe("GitPort interface", () => {
  it("GitHubPort extends GitPort — any GitPort consumer accepts GitHubPort", () => {
    // Type-level test: if this compiles, GitHubPort is assignable to GitPort
    const assertAssignable = (_port: GitPort): void => {};
    const mockGitHubPort: GitHubPort = createFullMockGitPort();
    assertAssignable(mockGitHubPort);
  });

  it("defines all required method signatures", () => {
    // This test verifies the shape of the interface at runtime via a mock
    const port: GitPort = createFullMockGitPort();

    expect(typeof port.createIssue).toBe("function");
    expect(typeof port.createIssueComment).toBe("function");
    expect(typeof port.findExistingIssue).toBe("function");
    expect(typeof port.listOpenIssues).toBe("function");
    expect(typeof port.createDraftPR).toBe("function");
    expect(typeof port.listOpenPRs).toBe("function");
    expect(typeof port.getPRDiff).toBe("function");
    expect(typeof port.postPRReview).toBe("function");
    expect(typeof port.createCommitComment).toBe("function");
    expect(typeof port.getLatestCommits).toBe("function");
    expect(typeof port.getCommitDiff).toBe("function");
    expect(typeof port.getMergeCommits).toBe("function");
    expect(typeof port.getRateLimit).toBe("function");
  });
});

// =========================================================================
// 2. GitHubAdapter implements GitPort
// =========================================================================

describe("GitHubAdapter implements GitPort", () => {
  it("is assignable to GitPort", () => {
    const mockOctokit = createMockOctokit();
    const adapter: GitPort = new GitHubAdapter(mockOctokit as never, "owner", "repo");
    expect(adapter).toBeDefined();
  });

  it("is still assignable to GitHubPort (backward compat)", () => {
    const mockOctokit = createMockOctokit();
    const adapter: GitHubPort = new GitHubAdapter(mockOctokit as never, "owner", "repo");
    expect(adapter).toBeDefined();
  });
});

// =========================================================================
// 3. AdoAdapter — Skeleton
// =========================================================================

describe("AdoAdapter", () => {
  describe("create() factory", () => {
    it("creates an adapter with valid options", () => {
      const adapter = AdoAdapter.create({
        organization: "my-org",
        project: "my-project",
        token: "ado-test-token",
      });

      expect(adapter).toBeInstanceOf(AdoAdapter);
      expect(adapter.getBaseUrl()).toBe("https://dev.azure.com/my-org");
      expect(adapter.getProject()).toBe("my-project");
    });

    it("throws GitAuthError if token is empty", () => {
      expect(() =>
        AdoAdapter.create({
          organization: "my-org",
          project: "my-project",
          token: "",
        }),
      ).toThrow(GitAuthError);
    });

    it("throws GitAuthError if organization is empty", () => {
      expect(() =>
        AdoAdapter.create({
          organization: "",
          project: "my-project",
          token: "token",
        }),
      ).toThrow(GitAuthError);
    });

    it("throws GitAuthError if project is empty", () => {
      expect(() =>
        AdoAdapter.create({
          organization: "my-org",
          project: "",
          token: "token",
        }),
      ).toThrow(GitAuthError);
    });
  });

  describe("is assignable to GitPort", () => {
    it("implements the GitPort interface", () => {
      const adapter: GitPort = AdoAdapter.create({
        organization: "org",
        project: "proj",
        token: "tok",
      });
      expect(adapter).toBeDefined();
    });
  });

  describe("stub methods throw not-implemented errors", () => {
    let adapter: AdoAdapter;

    beforeEach(() => {
      adapter = AdoAdapter.create({
        organization: "org",
        project: "proj",
        token: "tok",
      });
    });

    it("createIssue throws not implemented", async () => {
      await expect(
        adapter.createIssue({ title: "t", body: "b", labels: [] }),
      ).rejects.toThrow("not yet implemented");
    });

    it("createIssueComment throws not implemented", async () => {
      await expect(
        adapter.createIssueComment(1, "body"),
      ).rejects.toThrow("not yet implemented");
    });

    it("findExistingIssue throws not implemented", async () => {
      await expect(
        adapter.findExistingIssue("title"),
      ).rejects.toThrow("not yet implemented");
    });

    it("listOpenIssues throws not implemented", async () => {
      await expect(adapter.listOpenIssues()).rejects.toThrow(
        "not yet implemented",
      );
    });

    it("createDraftPR throws not implemented", async () => {
      await expect(
        adapter.createDraftPR({ title: "t", body: "b", head: "h", base: "b", draft: true }),
      ).rejects.toThrow("not yet implemented");
    });

    it("listOpenPRs throws not implemented", async () => {
      await expect(adapter.listOpenPRs()).rejects.toThrow(
        "not yet implemented",
      );
    });

    it("getPRDiff throws not implemented", async () => {
      await expect(adapter.getPRDiff(1)).rejects.toThrow(
        "not yet implemented",
      );
    });

    it("postPRReview throws not implemented", async () => {
      await expect(
        adapter.postPRReview({ pull_number: 1, body: "b", event: "COMMENT" }),
      ).rejects.toThrow("not yet implemented");
    });

    it("createCommitComment throws not implemented", async () => {
      await expect(
        adapter.createCommitComment("sha", "body"),
      ).rejects.toThrow("not yet implemented");
    });

    it("getLatestCommits throws not implemented", async () => {
      await expect(
        adapter.getLatestCommits("2024-01-01"),
      ).rejects.toThrow("not yet implemented");
    });

    it("getCommitDiff throws not implemented", async () => {
      await expect(adapter.getCommitDiff("sha")).rejects.toThrow(
        "not yet implemented",
      );
    });

    it("getMergeCommits throws not implemented", async () => {
      await expect(
        adapter.getMergeCommits("2024-01-01"),
      ).rejects.toThrow("not yet implemented");
    });

    it("getRateLimit returns permissive defaults (ADO has no rate-limit API)", async () => {
      const result = await adapter.getRateLimit();
      expect(result.remaining).toBe(1000);
      expect(result.reset).toBeInstanceOf(Date);
      expect(result.reset.getTime()).toBeGreaterThan(Date.now());
    });

    it("buildAuthHeaders returns Basic auth with base64-encoded PAT", () => {
      const headers = adapter.buildAuthHeaders();
      expect(headers.Authorization).toMatch(/^Basic /);
      expect(headers["Content-Type"]).toBe("application/json");

      // Verify the token is encoded correctly (":tok" → base64)
      const decoded = Buffer.from(
        headers.Authorization.replace("Basic ", ""),
        "base64",
      ).toString();
      expect(decoded).toBe(":tok");
    });
  });
});

// =========================================================================
// 4. Factory — createGitAdapter()
// =========================================================================

describe("createGitAdapter()", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("creates GitHubAdapter when provider is 'github'", () => {
    process.env.GITHUB_TOKEN = "ghp_test123456789";

    const config: GitAdapterConfig = {
      provider: "github",
      repo: "owner/repo",
      branch: "main",
    };

    const adapter = createGitAdapter(config);
    expect(adapter).toBeInstanceOf(GitHubAdapter);
  });

  it("creates AdoAdapter when provider is 'ado'", () => {
    process.env.ADO_TOKEN = "ado-test-token";

    const config: GitAdapterConfig = {
      provider: "ado",
      repo: "my-repo",
      branch: "main",
      ado: {
        organization: "my-org",
        project: "my-project",
      },
    };

    const adapter = createGitAdapter(config);
    expect(adapter).toBeInstanceOf(AdoAdapter);
  });

  it("throws GitProviderNotSupportedError for unknown provider", () => {
    const config = {
      provider: "gitlab" as GitProvider,
      repo: "owner/repo",
      branch: "main",
    };

    expect(() => createGitAdapter(config)).toThrow(
      GitProviderNotSupportedError,
    );
  });

  it("throws GitAuthError when ado config is missing for ado provider", () => {
    process.env.ADO_TOKEN = "ado-test-token";

    const config: GitAdapterConfig = {
      provider: "ado",
      repo: "my-repo",
      branch: "main",
      // no ado config
    };

    expect(() => createGitAdapter(config)).toThrow(GitAuthError);
  });

  it("defaults to github when provider is 'github'", () => {
    process.env.GITHUB_TOKEN = "ghp_test123456789";

    const adapter = createGitAdapter({
      provider: "github",
      repo: "owner/repo",
      branch: "main",
    });

    expect(adapter).toBeInstanceOf(GitHubAdapter);
  });
});

// =========================================================================
// 5. Config Schema — provider & ado fields
// =========================================================================

describe("Config schema — provider & ado fields", () => {
  it("defaults provider to 'github' when not specified", () => {
    const result = craigConfigSchema.safeParse({
      repo: "owner/repo",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.provider).toBe("github");
    }
  });

  it("accepts provider: 'github' explicitly", () => {
    const result = craigConfigSchema.safeParse({
      repo: "owner/repo",
      provider: "github",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.provider).toBe("github");
    }
  });

  it("accepts provider: 'ado' with ado config", () => {
    const result = craigConfigSchema.safeParse({
      repo: "owner/my-repo",
      provider: "ado",
      ado: {
        organization: "my-org",
        project: "my-project",
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.provider).toBe("ado");
      expect(result.data.ado?.organization).toBe("my-org");
      expect(result.data.ado?.project).toBe("my-project");
      expect(result.data.ado?.auth).toBe("pat"); // default
    }
  });

  it("rejects provider: 'ado' without ado config", () => {
    const result = craigConfigSchema.safeParse({
      repo: "owner/my-repo",
      provider: "ado",
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid provider value", () => {
    const result = craigConfigSchema.safeParse({
      repo: "owner/repo",
      provider: "gitlab",
    });

    expect(result.success).toBe(false);
  });

  it("accepts ado.auth: 'managed-identity'", () => {
    const result = craigConfigSchema.safeParse({
      repo: "owner/my-repo",
      provider: "ado",
      ado: {
        organization: "my-org",
        project: "my-project",
        auth: "managed-identity",
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ado?.auth).toBe("managed-identity");
    }
  });

  it("existing GitHub config still validates (no breaking change)", () => {
    const existingConfig = {
      repo: "vbomfim/openasr",
      branch: "main",
      schedule: {
        merge_monitor: "on_push",
        coverage_scan: "0 8 * * *",
      },
      capabilities: {
        merge_review: true,
        coverage_gaps: true,
      },
      models: {
        default: "claude-sonnet-4.5",
      },
    };

    const result = craigConfigSchema.safeParse(existingConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.provider).toBe("github"); // default
    }
  });
});

// =========================================================================
// 6. Provider-agnostic errors
// =========================================================================

describe("Git provider-agnostic errors", () => {
  it("GitRateLimitError has reset date", () => {
    const reset = new Date("2024-01-01T00:00:00Z");
    const error = new GitRateLimitError(reset);
    expect(error.name).toBe("GitRateLimitError");
    expect(error.reset).toEqual(reset);
    expect(error.message).toContain("rate limit");
  });

  it("GitAuthError has message", () => {
    const error = new GitAuthError("bad token");
    expect(error.name).toBe("GitAuthError");
    expect(error.message).toBe("bad token");
  });

  it("GitNotFoundError has resource info", () => {
    const error = new GitNotFoundError("repo/not-here");
    expect(error.name).toBe("GitNotFoundError");
    expect(error.message).toContain("repo/not-here");
  });

  it("GitAPIError has status code", () => {
    const error = new GitAPIError(500, "server broke");
    expect(error.name).toBe("GitAPIError");
    expect(error.status).toBe(500);
    expect(error.message).toContain("500");
  });

  it("GitProviderNotSupportedError lists supported providers", () => {
    const error = new GitProviderNotSupportedError("gitlab");
    expect(error.name).toBe("GitProviderNotSupportedError");
    expect(error.message).toContain("gitlab");
    expect(error.message).toContain("github");
    expect(error.message).toContain("ado");
  });
});

// =========================================================================
// 7. Error sanitizer handles git-port errors
// =========================================================================

describe("Error sanitizer — git-port errors", () => {
  // Suppress stderr output during tests
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sanitizes GitRateLimitError", () => {
    const error = new GitRateLimitError(new Date());
    const result = sanitizeError(error);
    expect(result.code).toBe("RATE_LIMIT");
    expect(result.message).not.toContain("token");
  });

  it("sanitizes GitAuthError", () => {
    const error = new GitAuthError("secret-token-abc123");
    const result = sanitizeError(error);
    expect(result.code).toBe("AUTH_ERROR");
    expect(result.message).not.toContain("secret-token-abc123");
  });

  it("sanitizes GitNotFoundError", () => {
    const error = new GitNotFoundError("/internal/path");
    const result = sanitizeError(error);
    expect(result.code).toBe("NOT_FOUND");
    expect(result.message).not.toContain("/internal/path");
  });

  it("sanitizes GitAPIError", () => {
    const error = new GitAPIError(500, "internal server details");
    const result = sanitizeError(error);
    expect(result.code).toBe("GIT_ERROR");
    expect(result.message).not.toContain("internal server details");
  });

  it("sanitizes GitProviderNotSupportedError", () => {
    const error = new GitProviderNotSupportedError("foobar");
    const result = sanitizeError(error);
    expect(result.code).toBe("PROVIDER_ERROR");
    expect(result.message).not.toContain("foobar");
  });
});

// =========================================================================
// 8. Barrel exports
// =========================================================================

describe("git-port barrel exports", () => {
  it("exports all expected symbols", async () => {
    const barrel = await import("../index.js");

    // Types are compile-time only — check runtime exports
    expect(barrel.createGitAdapter).toBeDefined();
    expect(barrel.AdoAdapter).toBeDefined();
    expect(barrel.GitRateLimitError).toBeDefined();
    expect(barrel.GitAuthError).toBeDefined();
    expect(barrel.GitNotFoundError).toBeDefined();
    expect(barrel.GitAPIError).toBeDefined();
    expect(barrel.GitProviderNotSupportedError).toBeDefined();
  });
});

// =========================================================================
// Test Helpers
// =========================================================================

/** Create a full mock implementing GitPort for type-level tests. */
function createFullMockGitPort(): GitPort {
  return {
    createIssue: vi.fn().mockResolvedValue({ url: "u", number: 1 }),
    createIssueComment: vi.fn().mockResolvedValue({ url: "u" }),
    findExistingIssue: vi.fn().mockResolvedValue(null),
    listOpenIssues: vi.fn().mockResolvedValue([]),
    createDraftPR: vi.fn().mockResolvedValue({ url: "u", number: 1 }),
    listOpenPRs: vi.fn().mockResolvedValue([]),
    getPRDiff: vi.fn().mockResolvedValue("diff"),
    postPRReview: vi.fn().mockResolvedValue({ id: 1, url: "u" }),
    createCommitComment: vi.fn().mockResolvedValue({ url: "u" }),
    getLatestCommits: vi.fn().mockResolvedValue([]),
    getCommitDiff: vi.fn().mockResolvedValue({ sha: "abc", files: [] }),
    getMergeCommits: vi.fn().mockResolvedValue([]),
    getRateLimit: vi.fn().mockResolvedValue({ remaining: 100, reset: new Date() }),
  };
}

/** Minimal Octokit mock for GitHubAdapter instantiation. */
function createMockOctokit() {
  return {
    rest: {
      issues: { create: vi.fn(), listForRepo: vi.fn(), createComment: vi.fn() },
      pulls: { create: vi.fn(), list: vi.fn(), get: vi.fn(), createReview: vi.fn() },
      repos: { createCommitComment: vi.fn(), listCommits: vi.fn(), getCommit: vi.fn() },
      rateLimit: { get: vi.fn() },
    },
  };
}
