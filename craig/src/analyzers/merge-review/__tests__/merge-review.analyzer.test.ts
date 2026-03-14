/**
 * MergeReviewAnalyzer — Unit Tests
 *
 * Tests the full merge review orchestration flow:
 * AC1: Full merge review flow (diff → invoke → parse → comment → state)
 * AC2: Review comment format (delegated to comment-formatter tests)
 * AC3: Create issues for critical/high findings
 * AC4: No findings → clean comment
 * AC5: Guardian timeout handling
 * Edge: Large diff truncation, both guardians fail
 *
 * [TDD] Written BEFORE implementation. All deps are mocked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMergeReviewAnalyzer } from "../merge-review.analyzer.js";
import type { CopilotPort } from "../../../copilot/index.js";
import type { GitHubPort } from "../../../github/index.js";
import type { StatePort } from "../../../state/index.js";
import type { ResultParserPort, ParsedReport } from "../../../result-parser/index.js";
import type { MergeReviewContext } from "../merge-review.analyzer.js";
import type { InvokeResult } from "../../../copilot/index.js";

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockCopilot(): CopilotPort {
  return {
    invoke: vi.fn().mockResolvedValue({
      success: true,
      output: "## Report\nNo issues.",
      duration_ms: 1500,
      model_used: "claude-sonnet-4.5",
    } satisfies InvokeResult),
    isAvailable: vi.fn().mockResolvedValue(true),
  };
}

function createMockGitHub(): GitHubPort {
  return {
    createIssue: vi.fn().mockResolvedValue({
      url: "https://github.com/owner/repo/issues/42",
      number: 42,
    }),
    findExistingIssue: vi.fn().mockResolvedValue(null),
    listOpenIssues: vi.fn().mockResolvedValue([]),
    createDraftPR: vi.fn().mockResolvedValue({
      url: "https://github.com/owner/repo/pull/1",
      number: 1,
    }),
    createCommitComment: vi.fn().mockResolvedValue({
      url: "https://github.com/owner/repo/commit/abc1234#comment",
    }),
    getLatestCommits: vi.fn().mockResolvedValue([]),
    getCommitDiff: vi.fn().mockResolvedValue({
      sha: "abc1234",
      files: [
        {
          filename: "src/app.ts",
          status: "modified",
          additions: 10,
          deletions: 5,
          patch: "@@ -1,5 +1,10 @@\n+new code",
        },
      ],
    }),
    getMergeCommits: vi.fn().mockResolvedValue([]),
    getRateLimit: vi.fn().mockResolvedValue({
      remaining: 5000,
      reset: new Date(),
    }),
  };
}

function createMockState(): StatePort {
  return {
    load: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockReturnValue([]),
    set: vi.fn(),
    addFinding: vi.fn(),
    getFindings: vi.fn().mockReturnValue([]),
  };
}

function createMockParser(): ResultParserPort {
  return {
    parse: vi.fn().mockReturnValue({
      guardian: "security",
      summary: "No issues found.",
      findings: [],
      recommended_actions: [],
      raw: "## Report\nNo issues.",
    } satisfies ParsedReport),
  };
}

function createContext(overrides: Partial<MergeReviewContext> = {}): MergeReviewContext {
  return {
    task: "merge_review", taskId: "test-id-1", timestamp: new Date().toISOString(),
    sha: "abc1234567890",
    diff: "diff --git a/src/app.ts\n+new code\n-old code",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MergeReviewAnalyzer", () => {
  let copilot: CopilotPort;
  let github: GitHubPort;
  let state: StatePort;
  let parser: ResultParserPort;

  beforeEach(() => {
    copilot = createMockCopilot();
    github = createMockGitHub();
    state = createMockState();
    parser = createMockParser();
  });

  describe("name", () => {
    it("returns 'merge_review'", () => {
      const analyzer = createMergeReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });

      expect(analyzer.name).toBe("merge_review");
    });
  });

  // AC1: Full merge review flow
  describe("AC1: full merge review flow", () => {
    it("gets diff via GitHub when context has no diff", async () => {
      const analyzer = createMergeReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });
      const context = createContext({ diff: undefined });

      await analyzer.execute(context);

      expect(github.getCommitDiff).toHaveBeenCalledWith("abc1234567890");
    });

    it("uses context diff when provided", async () => {
      const analyzer = createMergeReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });
      const context = createContext({ diff: "some diff content" });

      await analyzer.execute(context);

      expect(github.getCommitDiff).not.toHaveBeenCalled();
    });

    it("invokes Security Guardian with the diff", async () => {
      const analyzer = createMergeReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });

      await analyzer.execute(createContext());

      expect(copilot.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          agent: "security-guardian",
          prompt: expect.stringContaining("review"),
        }),
      );
    });

    it("invokes Code Review Guardian with the diff", async () => {
      const analyzer = createMergeReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });

      await analyzer.execute(createContext());

      expect(copilot.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          agent: "code-review-guardian",
          prompt: expect.stringContaining("review"),
        }),
      );
    });

    it("invokes both guardians (2 invoke calls)", async () => {
      const analyzer = createMergeReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });

      await analyzer.execute(createContext());

      expect(copilot.invoke).toHaveBeenCalledTimes(2);
    });

    it("parses both guardian reports via ResultParser", async () => {
      vi.mocked(copilot.invoke)
        .mockResolvedValueOnce({
          success: true,
          output: "## Security Report",
          duration_ms: 1000,
          model_used: "claude-sonnet-4.5",
        })
        .mockResolvedValueOnce({
          success: true,
          output: "## Code Review Report",
          duration_ms: 1200,
          model_used: "claude-sonnet-4.5",
        });

      const analyzer = createMergeReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });

      await analyzer.execute(createContext());

      expect(parser.parse).toHaveBeenCalledWith(
        "## Security Report",
        "security",
      );
      expect(parser.parse).toHaveBeenCalledWith(
        "## Code Review Report",
        "code-review",
      );
    });

    it("posts combined review comment on the merge commit", async () => {
      const analyzer = createMergeReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });

      await analyzer.execute(createContext());

      expect(github.createCommitComment).toHaveBeenCalledWith(
        "abc1234567890",
        expect.stringContaining("🤖 Craig — Merge Review"),
      );
    });

    it("returns success with actions_taken including comment", async () => {
      vi.mocked(github.createCommitComment).mockResolvedValue({
        url: "https://github.com/owner/repo/commit/abc1234567890#comment-1",
      });

      const analyzer = createMergeReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });
      const result = await analyzer.execute(createContext());

      expect(result.success).toBe(true);
      expect(result.actions).toContainEqual(
        expect.objectContaining({
          type: "comment_added",
          url: "https://github.com/owner/repo/commit/abc1234567890#comment-1",
        }),
      );
    });

    it("records duration_ms", async () => {
      const analyzer = createMergeReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });
      const result = await analyzer.execute(createContext());

      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    });
  });

  // AC3: Create issues for critical/high findings
  describe("AC3: create issues for critical/high findings", () => {
    it("creates GitHub issues for critical findings", async () => {
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "Found critical issue",
        findings: [
          {
            number: 1,
            severity: "critical",
            category: "[OWASP-A05]",
            file_line: "src/db.py:42",
            issue: "SQL injection",
            source_justification: "OWASP A05",
            suggested_fix: "Use parameterized query",
          },
        ],
        recommended_actions: [],
        raw: "",
      });

      const analyzer = createMergeReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });

      const result = await analyzer.execute(createContext());

      expect(github.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining("SQL injection"),
          labels: expect.arrayContaining(["craig", "security"]),
        }),
      );
      expect(result.actions).toContainEqual(
        expect.objectContaining({ type: "issue_created" }),
      );
    });

    it("creates GitHub issues for high findings", async () => {
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "Found high issue",
        findings: [
          {
            number: 1,
            severity: "high",
            category: "[OWASP-A04]",
            file_line: "config.py:8",
            issue: "Hardcoded API key",
            source_justification: "OWASP A04",
            suggested_fix: "Move to env var",
          },
        ],
        recommended_actions: [],
        raw: "",
      });

      const analyzer = createMergeReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });

      await analyzer.execute(createContext());

      expect(github.createIssue).toHaveBeenCalled();
    });

    it("does NOT create issues for medium/low findings", async () => {
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "Found medium issue",
        findings: [
          {
            number: 1,
            severity: "medium",
            category: "[OWASP-A03]",
            file_line: "src/app.ts:10",
            issue: "Minor config issue",
            source_justification: "OWASP A03",
            suggested_fix: "Fix config",
          },
        ],
        recommended_actions: [],
        raw: "",
      });

      const analyzer = createMergeReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });

      await analyzer.execute(createContext());

      expect(github.createIssue).not.toHaveBeenCalled();
    });

    it("checks for duplicate issues before creating", async () => {
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "Found critical issue",
        findings: [
          {
            number: 1,
            severity: "critical",
            category: "[OWASP-A05]",
            file_line: "src/db.py:42",
            issue: "SQL injection",
            source_justification: "OWASP A05",
            suggested_fix: "Use parameterized query",
          },
        ],
        recommended_actions: [],
        raw: "",
      });
      vi.mocked(github.findExistingIssue).mockResolvedValue({
        url: "https://github.com/owner/repo/issues/99",
        number: 99,
      });

      const analyzer = createMergeReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });

      await analyzer.execute(createContext());

      expect(github.findExistingIssue).toHaveBeenCalled();
      expect(github.createIssue).not.toHaveBeenCalled();
    });
  });

  // AC4: No findings — clean comment
  describe("AC4: no findings", () => {
    it("posts clean comment when both guardians find nothing", async () => {
      const analyzer = createMergeReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });

      await analyzer.execute(createContext());

      expect(github.createCommitComment).toHaveBeenCalledWith(
        "abc1234567890",
        expect.stringContaining("✅ No issues found."),
      );
    });
  });

  // AC5: Guardian timeout
  describe("AC5: guardian timeout", () => {
    it("handles security guardian timeout gracefully", async () => {
      vi.mocked(copilot.invoke)
        .mockResolvedValueOnce({
          success: false,
          output: "",
          duration_ms: 300_000,
          model_used: "claude-sonnet-4.5",
          error: "Timeout",
        })
        .mockResolvedValueOnce({
          success: true,
          output: "## Code Review Report",
          duration_ms: 1200,
          model_used: "claude-sonnet-4.5",
        });

      const analyzer = createMergeReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });
      const result = await analyzer.execute(createContext());

      expect(result.success).toBe(true);
      expect(github.createCommitComment).toHaveBeenCalledWith(
        "abc1234567890",
        expect.stringContaining("Security Guardian timed out"),
      );
    });

    it("handles code review guardian timeout gracefully", async () => {
      vi.mocked(copilot.invoke)
        .mockResolvedValueOnce({
          success: true,
          output: "## Security Report",
          duration_ms: 1000,
          model_used: "claude-sonnet-4.5",
        })
        .mockResolvedValueOnce({
          success: false,
          output: "",
          duration_ms: 300_000,
          model_used: "claude-sonnet-4.5",
          error: "Timeout",
        });

      const analyzer = createMergeReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });
      const result = await analyzer.execute(createContext());

      expect(result.success).toBe(true);
      expect(github.createCommitComment).toHaveBeenCalledWith(
        "abc1234567890",
        expect.stringContaining("Code Review Guardian timed out"),
      );
    });
  });

  // Edge case: both guardians fail
  describe("edge: both guardians fail", () => {
    it("posts error comment and returns success=true", async () => {
      vi.mocked(copilot.invoke).mockResolvedValue({
        success: false,
        output: "",
        duration_ms: 300_000,
        model_used: "claude-sonnet-4.5",
        error: "Timeout",
      });

      const analyzer = createMergeReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });
      const result = await analyzer.execute(createContext());

      expect(result.success).toBe(true);
      expect(github.createCommitComment).toHaveBeenCalledWith(
        "abc1234567890",
        expect.stringContaining("timed out"),
      );
    });
  });

  // Edge case: large diff truncation
  describe("edge: large diff truncation", () => {
    it("truncates diff over 5000 lines", async () => {
      const largeDiff = Array.from({ length: 10_001 }, (_, i) => `line ${i}`)
        .join("\n");

      const analyzer = createMergeReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });

      await analyzer.execute(createContext({ diff: largeDiff }));

      // Verify copilot was called with truncated diff
      const invokeCall = vi.mocked(copilot.invoke).mock.calls[0];
      expect(invokeCall).toBeDefined();
      const contextArg = invokeCall![0].context;
      expect(contextArg).toBeDefined();
      const lineCount = contextArg!.split("\n").length;
      expect(lineCount).toBeLessThanOrEqual(5_001); // 5000 lines + potential join artifact
    });

    it("notes truncation in the review comment", async () => {
      const largeDiff = Array.from({ length: 10_001 }, (_, i) => `line ${i}`)
        .join("\n");

      const analyzer = createMergeReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });

      await analyzer.execute(createContext({ diff: largeDiff }));

      expect(github.createCommitComment).toHaveBeenCalledWith(
        "abc1234567890",
        expect.stringContaining("truncated"),
      );
    });
  });

  // State recording
  describe("state recording", () => {
    it("stores findings via StatePort.addFinding", async () => {
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "Found issue",
        findings: [
          {
            number: 1,
            severity: "high",
            category: "[OWASP-A04]",
            file_line: "config.py:8",
            issue: "Hardcoded API key",
            source_justification: "OWASP A04",
            suggested_fix: "Move to env var",
          },
        ],
        recommended_actions: [],
        raw: "",
      });

      const analyzer = createMergeReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });

      await analyzer.execute(createContext());

      expect(state.addFinding).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "high",
          issue: "Hardcoded API key",
          task: "merge_review",
        }),
      );
    });

    it("persists state after recording findings", async () => {
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "Found issue",
        findings: [
          {
            number: 1,
            severity: "critical",
            category: "[OWASP-A05]",
            file_line: "src/db.py:42",
            issue: "SQL injection",
            source_justification: "OWASP A05",
            suggested_fix: "Use parameterized query",
          },
        ],
        recommended_actions: [],
        raw: "",
      });

      const analyzer = createMergeReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });

      await analyzer.execute(createContext());

      expect(state.save).toHaveBeenCalled();
    });
  });

  // Error handling — never throws
  describe("error handling", () => {
    it("never throws — returns success=false on unexpected error", async () => {
      vi.mocked(copilot.invoke).mockRejectedValue(
        new Error("Network failure"),
      );

      const analyzer = createMergeReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });
      const result = await analyzer.execute(createContext());

      expect(result.success).toBe(false);
      expect(result.summary).toContain("Network failure");
    });

    it("returns success=false when SHA is missing", async () => {
      const analyzer = createMergeReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });
      const result = await analyzer.execute(
        createContext({ sha: undefined }),
      );

      expect(result.success).toBe(false);
      expect(result.summary).toContain("failed");
    });

    it("returns success=false when getCommitDiff fails and no diff in context", async () => {
      vi.mocked(github.getCommitDiff).mockRejectedValue(
        new Error("API error"),
      );

      const analyzer = createMergeReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });
      const result = await analyzer.execute(
        createContext({ diff: undefined }),
      );

      expect(result.success).toBe(false);
      expect(result.summary).toContain("API error");
    });
  });

  // Diff reconstruction from CommitDiff
  describe("diff reconstruction", () => {
    it("builds diff text from CommitDiff files when context.diff is not provided", async () => {
      vi.mocked(github.getCommitDiff).mockResolvedValue({
        sha: "abc1234567890",
        files: [
          {
            filename: "src/app.ts",
            status: "modified",
            additions: 10,
            deletions: 5,
            patch: "@@ -1,5 +1,10 @@\n+added line",
          },
          {
            filename: "src/utils.ts",
            status: "added",
            additions: 20,
            deletions: 0,
            patch: "@@ -0,0 +1,20 @@\n+new file",
          },
        ],
      });

      const analyzer = createMergeReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });

      await analyzer.execute(createContext({ diff: undefined }));

      const invokeCall = vi.mocked(copilot.invoke).mock.calls[0];
      expect(invokeCall).toBeDefined();
      const contextArg = invokeCall![0].context;
      expect(contextArg).toContain("src/app.ts");
      expect(contextArg).toContain("src/utils.ts");
    });
  });
});
