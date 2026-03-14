/**
 * ProjectContext — Unit Tests
 *
 * Tests the project context gathering and finding classification logic.
 *
 * [TDD] Written BEFORE implementation.
 *
 * AC: gatherProjectContext fetches README + languages
 * AC: Classification parsing (IN_SCOPE, QUESTIONABLE, OUT_OF_SCOPE)
 * AC: Caching — subsequent calls return cached result
 * AC: Error resilience — missing README/languages don't crash
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  gatherProjectContext,
  clearProjectContextCache,
  parseClassification,
  buildClassificationPrompt,
  type ProjectContext,
  type FindingClassification,
} from "../project-context.js";
import type { GitPort } from "../../../git-port/git.port.js";

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockGitPort(overrides: Partial<GitPort> = {}): GitPort {
  return {
    createIssue: vi.fn(),
    createIssueComment: vi.fn(),
    findExistingIssue: vi.fn(),
    listOpenIssues: vi.fn(),
    createDraftPR: vi.fn(),
    listOpenPRs: vi.fn(),
    getPRDiff: vi.fn(),
    postPRReview: vi.fn(),
    createCommitComment: vi.fn(),
    getLatestCommits: vi.fn(),
    getCommitDiff: vi.fn(),
    getMergeCommits: vi.fn(),
    getRateLimit: vi.fn(),
    getFileContents: vi.fn().mockResolvedValue("# My Project\nA TypeScript web app."),
    getLanguages: vi.fn().mockResolvedValue({ TypeScript: 8000, JavaScript: 2000 }),
    ...overrides,
  } as GitPort;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("gatherProjectContext", () => {
  beforeEach(() => {
    clearProjectContextCache();
  });

  it("fetches README.md and languages from GitPort", async () => {
    const git = createMockGitPort();
    const ctx = await gatherProjectContext(git);

    expect(git.getFileContents).toHaveBeenCalledWith("README.md");
    expect(git.getLanguages).toHaveBeenCalled();
    expect(ctx.readme).toContain("My Project");
    expect(ctx.languages).toEqual({ TypeScript: 8000, JavaScript: 2000 });
  });

  it("identifies the primary language by byte count", async () => {
    const git = createMockGitPort({
      getLanguages: vi.fn().mockResolvedValue({
        Python: 5000,
        C: 12000,
        Shell: 500,
      }),
    });

    const ctx = await gatherProjectContext(git);
    expect(ctx.primaryLanguage).toBe("C");
  });

  it("truncates README to ~2000 chars", async () => {
    const longReadme = "x".repeat(5000);
    const git = createMockGitPort({
      getFileContents: vi.fn().mockResolvedValue(longReadme),
    });

    const ctx = await gatherProjectContext(git);
    expect(ctx.readme.length).toBeLessThanOrEqual(2020); // 2000 + truncation marker
    expect(ctx.readme).toContain("(truncated)");
  });

  it("returns empty defaults when getFileContents fails", async () => {
    const git = createMockGitPort({
      getFileContents: vi.fn().mockRejectedValue(new Error("404 Not Found")),
    });

    const ctx = await gatherProjectContext(git);
    expect(ctx.readme).toBe("");
    expect(ctx.languages).toEqual({ TypeScript: 8000, JavaScript: 2000 });
  });

  it("returns empty defaults when getLanguages fails", async () => {
    const git = createMockGitPort({
      getLanguages: vi.fn().mockRejectedValue(new Error("API error")),
    });

    const ctx = await gatherProjectContext(git);
    expect(ctx.readme).toContain("My Project");
    expect(ctx.languages).toEqual({});
    expect(ctx.primaryLanguage).toBe("unknown");
  });

  it("returns empty defaults when both methods fail", async () => {
    const git = createMockGitPort({
      getFileContents: vi.fn().mockRejectedValue(new Error("fail")),
      getLanguages: vi.fn().mockRejectedValue(new Error("fail")),
    });

    const ctx = await gatherProjectContext(git);
    expect(ctx.readme).toBe("");
    expect(ctx.languages).toEqual({});
    expect(ctx.primaryLanguage).toBe("unknown");
  });

  it("caches result — does not call GitPort on second invocation", async () => {
    const git = createMockGitPort();

    const ctx1 = await gatherProjectContext(git);
    const ctx2 = await gatherProjectContext(git);

    expect(git.getFileContents).toHaveBeenCalledTimes(1);
    expect(git.getLanguages).toHaveBeenCalledTimes(1);
    expect(ctx1).toBe(ctx2); // Same reference
  });

  it("primaryLanguage defaults to 'unknown' when languages are empty", async () => {
    const git = createMockGitPort({
      getLanguages: vi.fn().mockResolvedValue({}),
    });

    const ctx = await gatherProjectContext(git);
    expect(ctx.primaryLanguage).toBe("unknown");
  });
});

describe("parseClassification", () => {
  it("returns IN_SCOPE when output contains 'IN_SCOPE'", () => {
    const output = "Classification: **IN_SCOPE**\nThis finding is relevant.";
    expect(parseClassification(output)).toBe("IN_SCOPE");
  });

  it("returns QUESTIONABLE when output contains 'QUESTIONABLE'", () => {
    const output = "Classification: QUESTIONABLE\nThis file seems unrelated.";
    expect(parseClassification(output)).toBe("QUESTIONABLE");
  });

  it("returns OUT_OF_SCOPE when output contains 'OUT_OF_SCOPE'", () => {
    const output = "This finding is clearly OUT_OF_SCOPE for a C++ project.";
    expect(parseClassification(output)).toBe("OUT_OF_SCOPE");
  });

  it("defaults to IN_SCOPE when no classification keyword found", () => {
    const output = "## Report\nNo issues.";
    expect(parseClassification(output)).toBe("IN_SCOPE");
  });

  it("is case-insensitive", () => {
    expect(parseClassification("this is out_of_scope")).toBe("OUT_OF_SCOPE");
    expect(parseClassification("QUESTIONABLE finding")).toBe("QUESTIONABLE");
    expect(parseClassification("in_scope")).toBe("IN_SCOPE");
  });

  it("prefers OUT_OF_SCOPE over QUESTIONABLE when both present", () => {
    const output = "Considered QUESTIONABLE at first, but ultimately OUT_OF_SCOPE.";
    expect(parseClassification(output)).toBe("OUT_OF_SCOPE");
  });

  it("prefers OUT_OF_SCOPE over IN_SCOPE when both present", () => {
    const output = "While the code is IN_SCOPE, the file itself is OUT_OF_SCOPE.";
    expect(parseClassification(output)).toBe("OUT_OF_SCOPE");
  });
});

describe("buildClassificationPrompt", () => {
  const mockContext: ProjectContext = {
    readme: "# My App\nA Node.js API server.",
    languages: { TypeScript: 8000, JavaScript: 2000 },
    primaryLanguage: "TypeScript",
  };

  it("includes project context in the prompt", () => {
    const prompt = buildClassificationPrompt(
      {
        number: 1,
        severity: "critical",
        category: "[OWASP-A05]",
        file_line: "src/db.py:42",
        issue: "SQL injection in Python file",
        source_justification: "OWASP A05",
        suggested_fix: "Use parameterized query",
      },
      mockContext,
    );

    expect(prompt).toContain("TypeScript");
    expect(prompt).toContain("My App");
    expect(prompt).toContain("SQL injection");
    expect(prompt).toContain("IN_SCOPE");
    expect(prompt).toContain("QUESTIONABLE");
    expect(prompt).toContain("OUT_OF_SCOPE");
  });

  it("includes finding details", () => {
    const prompt = buildClassificationPrompt(
      {
        number: 1,
        severity: "high",
        category: "[CWE-798]",
        file_line: "config.py:8",
        issue: "Hardcoded API key",
        source_justification: "CWE-798",
        suggested_fix: "Use env var",
      },
      mockContext,
    );

    expect(prompt).toContain("Hardcoded API key");
    expect(prompt).toContain("config.py:8");
    expect(prompt).toContain("HIGH");
  });
});
