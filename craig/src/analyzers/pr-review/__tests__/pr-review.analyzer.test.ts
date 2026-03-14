/**
 * PrReviewAnalyzer — Unit Tests
 *
 * Tests the full PR review orchestration flow:
 * AC1: Full PR review flow (diff → invoke → parse → review → state)
 * AC2: Create issues for critical/high findings
 * AC3: No findings → clean comment
 * AC4: Guardian timeout handling
 * AC5: Missing context validation
 * Edge: Large diff truncation, state update
 *
 * [TDD] Written BEFORE implementation. All deps are mocked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPrReviewAnalyzer } from "../pr-review.analyzer.js";
import type { CopilotPort } from "../../../copilot/index.js";
import type { GitHubPort } from "../../../github/index.js";
import type { StatePort } from "../../../state/index.js";
import type { ResultParserPort, ParsedReport } from "../../../result-parser/index.js";
import type { PrReviewContext } from "../pr-review.analyzer.js";
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
      files: [],
    }),
    getMergeCommits: vi.fn().mockResolvedValue([]),
    getRateLimit: vi.fn().mockResolvedValue({
      remaining: 5000,
      reset: new Date(),
    }),
    listOpenPRs: vi.fn().mockResolvedValue([]),
    getPRDiff: vi.fn().mockResolvedValue("diff --git a/file.ts b/file.ts\n+new code"),
    postPRReview: vi.fn().mockResolvedValue({
      id: 1,
      url: "https://github.com/owner/repo/pull/10#pullrequestreview-1",
    }),
    createIssueComment: vi.fn(),
  };
}

function createMockState(): StatePort {
  let reviewedPRs: Record<string, string> = {};
  return {
    load: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockImplementation((key: string) => {
      if (key === "last_reviewed_prs") return reviewedPRs;
      return [];
    }),
    set: vi.fn().mockImplementation((key: string, value: unknown) => {
      if (key === "last_reviewed_prs")
        reviewedPRs = value as Record<string, string>;
    }),
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

function createContext(
  overrides: Partial<PrReviewContext> = {},
): PrReviewContext {
  return {
    task: "pr_review",
    taskId: "test-task-id",
    timestamp: new Date().toISOString(),
    pr_number: 10,
    head_sha: "abc1234567890",
    pr_title: "Add new feature",
    pr_author: "test-user",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PrReviewAnalyzer", () => {
  // ─── AC1: Full PR review flow ──────────────────────────────────

  describe("AC1: Full PR review flow", () => {
    it("should invoke Security + Code Review Guardians in parallel on PR diff", async () => {
      const copilot = createMockCopilot();
      const github = createMockGitHub();
      const state = createMockState();
      const parser = createMockParser();

      const analyzer = createPrReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });

      await analyzer.execute(createContext());

      expect(copilot.invoke).toHaveBeenCalledTimes(2);
      expect(copilot.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          agent: "security-guardian",
        }),
      );
      expect(copilot.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          agent: "code-review-guardian",
        }),
      );
    });

    it("should fetch diff from GitHub when not provided in context", async () => {
      const copilot = createMockCopilot();
      const github = createMockGitHub();
      const state = createMockState();
      const parser = createMockParser();

      const analyzer = createPrReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });

      await analyzer.execute(createContext());

      expect(github.getPRDiff).toHaveBeenCalledWith(10);
    });

    it("should use pre-fetched diff when provided in context", async () => {
      const copilot = createMockCopilot();
      const github = createMockGitHub();
      const state = createMockState();
      const parser = createMockParser();

      const analyzer = createPrReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });

      await analyzer.execute(
        createContext({ diff: "pre-fetched diff content" }),
      );

      expect(github.getPRDiff).not.toHaveBeenCalled();
    });

    it("should post a PR review comment via postPRReview", async () => {
      const copilot = createMockCopilot();
      const github = createMockGitHub();
      const state = createMockState();
      const parser = createMockParser();

      const analyzer = createPrReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });

      await analyzer.execute(createContext());

      expect(github.postPRReview).toHaveBeenCalledWith(
        expect.objectContaining({
          pull_number: 10,
          event: "COMMENT",
        }),
      );
    });

    it("should return success with summary including PR number", async () => {
      const copilot = createMockCopilot();
      const github = createMockGitHub();
      const state = createMockState();
      const parser = createMockParser();

      const analyzer = createPrReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });

      const result = await analyzer.execute(createContext());

      expect(result.success).toBe(true);
      expect(result.summary).toContain("#10");
    });

    it("should update last_reviewed_prs state after successful review", async () => {
      const copilot = createMockCopilot();
      const github = createMockGitHub();
      const state = createMockState();
      const parser = createMockParser();

      const analyzer = createPrReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });

      await analyzer.execute(createContext({
        pr_number: 10,
        head_sha: "abc1234567890",
      }));

      expect(state.set).toHaveBeenCalledWith(
        "last_reviewed_prs",
        expect.objectContaining({ "10": "abc1234567890" }),
      );
      expect(state.save).toHaveBeenCalled();
    });
  });

  // ─── AC2: Create issues for critical/high findings ────────────

  describe("AC2: Create issues for severe findings", () => {
    it("should create GitHub issues for critical findings", async () => {
      const copilot = createMockCopilot();
      const github = createMockGitHub();
      const state = createMockState();
      const parser = createMockParser();

      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "1 critical found",
        findings: [
          {
            number: 1,
            severity: "critical",
            category: "[OWASP-A01]",
            file_line: "src/auth.ts:42",
            issue: "SQL injection vulnerability",
            source_justification: "Direct string concatenation in query",
            suggested_fix: "Use parameterized queries",
          },
        ],
        recommended_actions: [],
        raw: "",
      });

      const analyzer = createPrReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });

      const result = await analyzer.execute(createContext());

      expect(github.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining("CRITICAL"),
          labels: expect.arrayContaining(["craig", "pr-review"]),
        }),
      );
      expect(result.actions).toContainEqual(
        expect.objectContaining({ type: "issue_created" }),
      );
    });

    it("should not create issues for medium/low findings", async () => {
      const copilot = createMockCopilot();
      const github = createMockGitHub();
      const state = createMockState();
      const parser = createMockParser();

      vi.mocked(parser.parse).mockReturnValue({
        guardian: "code-review",
        summary: "1 medium found",
        findings: [
          {
            number: 1,
            severity: "medium",
            category: "Design",
            file_line: "src/utils.ts:10",
            issue: "Function too long",
            source_justification: "Exceeds 30 lines",
            suggested_fix: "Extract helper function",
          },
        ],
        recommended_actions: [],
        raw: "",
      });

      const analyzer = createPrReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });

      await analyzer.execute(createContext());

      expect(github.createIssue).not.toHaveBeenCalled();
    });

    it("should skip issue creation if duplicate exists", async () => {
      const copilot = createMockCopilot();
      const github = createMockGitHub();
      const state = createMockState();
      const parser = createMockParser();

      vi.mocked(github.findExistingIssue).mockResolvedValue({
        url: "https://github.com/owner/repo/issues/99",
        number: 99,
      });

      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "1 critical found",
        findings: [
          {
            number: 1,
            severity: "critical",
            category: "[OWASP-A01]",
            file_line: "src/auth.ts:42",
            issue: "SQL injection",
            source_justification: "String concat",
            suggested_fix: "Parameterize",
          },
        ],
        recommended_actions: [],
        raw: "",
      });

      const analyzer = createPrReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });

      await analyzer.execute(createContext());

      expect(github.createIssue).not.toHaveBeenCalled();
    });
  });

  // ─── AC3: No findings → clean comment ─────────────────────────

  describe("AC3: No findings", () => {
    it("should post clean review when no findings are discovered", async () => {
      const copilot = createMockCopilot();
      const github = createMockGitHub();
      const state = createMockState();
      const parser = createMockParser();

      const analyzer = createPrReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });

      const result = await analyzer.execute(createContext());

      expect(result.success).toBe(true);
      expect(result.findings).toHaveLength(0);
      expect(github.postPRReview).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining("No issues found"),
        }),
      );
    });
  });

  // ─── AC4: Guardian timeout handling ────────────────────────────

  describe("AC4: Guardian timeout", () => {
    it("should handle security guardian timeout gracefully", async () => {
      const copilot = createMockCopilot();
      const github = createMockGitHub();
      const state = createMockState();
      const parser = createMockParser();

      vi.mocked(copilot.invoke).mockResolvedValueOnce({
        success: false,
        output: "",
        duration_ms: 300000,
        model_used: "claude-sonnet-4.5",
        error: "Timeout after 300000ms",
      });

      const analyzer = createPrReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });

      const result = await analyzer.execute(createContext());

      expect(result.success).toBe(true);
      expect(github.postPRReview).toHaveBeenCalled();
    });

    it("should handle both guardians timing out", async () => {
      const copilot = createMockCopilot();
      const github = createMockGitHub();
      const state = createMockState();
      const parser = createMockParser();

      vi.mocked(copilot.invoke).mockResolvedValue({
        success: false,
        output: "",
        duration_ms: 300000,
        model_used: "claude-sonnet-4.5",
        error: "Timeout",
      });

      const analyzer = createPrReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });

      const result = await analyzer.execute(createContext());

      expect(result.success).toBe(true);
      expect(result.findings).toHaveLength(0);
    });
  });

  // ─── AC5: Missing context validation ───────────────────────────

  describe("AC5: Missing context validation", () => {
    it("should return failure when pr_number is missing", async () => {
      const copilot = createMockCopilot();
      const github = createMockGitHub();
      const state = createMockState();
      const parser = createMockParser();

      const analyzer = createPrReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });

      const result = await analyzer.execute({
        task: "pr_review",
        taskId: "test",
        timestamp: new Date().toISOString(),
      });

      expect(result.success).toBe(false);
      expect(result.summary).toContain("Missing");
    });
  });

  // ─── Edge: Findings stored in state ────────────────────────────

  describe("Edge: State management", () => {
    it("should store findings in state via addFinding", async () => {
      const copilot = createMockCopilot();
      const github = createMockGitHub();
      const state = createMockState();
      const parser = createMockParser();

      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "1 finding",
        findings: [
          {
            number: 1,
            severity: "medium",
            category: "Quality",
            file_line: "src/app.ts:5",
            issue: "Missing error handling",
            source_justification: "Clean Code",
            suggested_fix: "Add try-catch",
          },
        ],
        recommended_actions: [],
        raw: "",
      });

      const analyzer = createPrReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });

      await analyzer.execute(createContext());

      // Called twice — once after recording findings, once after updating last_reviewed_prs
      expect(state.addFinding).toHaveBeenCalled();
      expect(state.save).toHaveBeenCalled();
    });
  });

  // ─── Edge: Error handling ──────────────────────────────────────

  describe("Edge: Error handling", () => {
    it("should return failure result when GitHub API throws", async () => {
      const copilot = createMockCopilot();
      const github = createMockGitHub();
      const state = createMockState();
      const parser = createMockParser();

      vi.mocked(github.getPRDiff).mockRejectedValue(new Error("API Error"));

      const analyzer = createPrReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });

      const result = await analyzer.execute(createContext());

      expect(result.success).toBe(false);
      expect(result.summary).toContain("failed");
      expect(result.summary).toContain("API Error");
    });

    it("should never throw — always returns AnalyzerResult", async () => {
      const copilot = createMockCopilot();
      const github = createMockGitHub();
      const state = createMockState();
      const parser = createMockParser();

      vi.mocked(github.getPRDiff).mockRejectedValue(new Error("Unexpected"));

      const analyzer = createPrReviewAnalyzer({
        copilot,
        github,
        state,
        parser,
      });

      // Should not throw
      const result = await analyzer.execute(createContext());
      expect(result).toBeDefined();
      expect(typeof result.success).toBe("boolean");
    });
  });

  // ─── Analyzer name ────────────────────────────────────────────

  describe("Analyzer identity", () => {
    it("should have name 'pr_review'", () => {
      const analyzer = createPrReviewAnalyzer({
        copilot: createMockCopilot(),
        github: createMockGitHub(),
        state: createMockState(),
        parser: createMockParser(),
      });

      expect(analyzer.name).toBe("pr_review");
    });
  });
});
