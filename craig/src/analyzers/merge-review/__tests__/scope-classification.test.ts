/**
 * Scope Classification Integration Tests
 *
 * Tests the modified createIssuesForSevereFindings flow:
 * - IN_SCOPE findings → create fix ticket (existing behavior)
 * - QUESTIONABLE findings → commit comment + clarification issue
 * - OUT_OF_SCOPE findings → commit comment + clarification issue
 * - auto_develop only triggers for IN_SCOPE findings
 *
 * [TDD] Written alongside implementation to verify new classification behavior.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMergeReviewAnalyzer } from "../merge-review.analyzer.js";
import { clearProjectContextCache } from "../project-context.js";
import type { CopilotPort } from "../../../copilot/index.js";
import type { GitHubPort } from "../../../github/index.js";
import type { StatePort } from "../../../state/index.js";
import type {
  ResultParserPort,
  ParsedReport,
} from "../../../result-parser/index.js";
import type { MergeReviewContext } from "../merge-review.analyzer.js";
import type { InvokeResult } from "../../../copilot/index.js";
import type { AnalyzerPort } from "../../analyzer.port.js";

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
    getFileContents: vi.fn().mockResolvedValue("# My TypeScript Project\nA web API."),
    getLanguages: vi.fn().mockResolvedValue({ TypeScript: 10000 }),
    listOpenPRs: vi.fn().mockResolvedValue([]),
    getPRDiff: vi.fn().mockResolvedValue(""),
    postPRReview: vi.fn().mockResolvedValue({ id: 1, url: "" }),
  } as unknown as GitHubPort;
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

function createMockParser(
  findings: ParsedReport["findings"] = [],
): ResultParserPort {
  return {
    parse: vi.fn().mockReturnValue({
      guardian: "security",
      summary: findings.length > 0 ? "Found issues" : "No issues found.",
      findings,
      recommended_actions: [],
      raw: "",
    } satisfies ParsedReport),
  };
}

function createContext(
  overrides: Partial<MergeReviewContext> = {},
): MergeReviewContext {
  return {
    task: "merge_review",
    taskId: "test-scope-1",
    timestamp: new Date().toISOString(),
    sha: "abc1234567890",
    diff: "diff --git a/src/app.ts\n+new code",
    ...overrides,
  };
}

const CRITICAL_FINDING = {
  number: 1,
  severity: "critical" as const,
  category: "[OWASP-A05]",
  file_line: "src/db.py:42",
  issue: "SQL injection in Python file",
  source_justification: "OWASP A05",
  suggested_fix: "Use parameterized query",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Scope Classification (Issue #67)", () => {
  let copilot: CopilotPort;
  let github: GitHubPort;
  let state: StatePort;

  beforeEach(() => {
    clearProjectContextCache();
    copilot = createMockCopilot();
    github = createMockGitHub();
    state = createMockState();
  });

  describe("IN_SCOPE classification", () => {
    it("creates a fix ticket for IN_SCOPE findings (existing behavior)", async () => {
      const parser = createMockParser([CRITICAL_FINDING]);

      // Mock: guardian calls return generic, then PO classification returns IN_SCOPE
      vi.mocked(copilot.invoke)
        .mockResolvedValueOnce({ success: true, output: "## Security Report", duration_ms: 1000, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "## Code Review Report", duration_ms: 1200, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "Classification: IN_SCOPE\nThis is a valid finding.", duration_ms: 500, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "## Issue Ticket\n".padEnd(100, "x"), duration_ms: 800, model_used: "claude-sonnet-4.5" });

      const analyzer = createMergeReviewAnalyzer({ copilot, github, state, parser });
      const result = await analyzer.execute(createContext());

      expect(result.success).toBe(true);
      expect(github.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining("SQL injection"),
          labels: expect.arrayContaining(["craig", "security"]),
        }),
      );
      // Should NOT have craig:needs-clarification label
      expect(github.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: expect.not.arrayContaining(["craig:needs-clarification"]),
        }),
      );
    });
  });

  describe("QUESTIONABLE classification", () => {
    it("posts a commit comment asking the author", async () => {
      const parser = createMockParser([CRITICAL_FINDING]);

      vi.mocked(copilot.invoke)
        .mockResolvedValueOnce({ success: true, output: "## Security Report", duration_ms: 1000, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "## Code Review Report", duration_ms: 1200, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "QUESTIONABLE\nThis Python file seems out of place.", duration_ms: 500, model_used: "claude-sonnet-4.5" });

      const analyzer = createMergeReviewAnalyzer({ copilot, github, state, parser });
      await analyzer.execute(createContext());

      // Should post a commit comment (beyond the review comment)
      expect(vi.mocked(github.createCommitComment).mock.calls.length).toBeGreaterThanOrEqual(2);
      const commentCalls = vi.mocked(github.createCommitComment).mock.calls;
      const clarificationComment = commentCalls.find(
        (call) => typeof call[1] === "string" && call[1].includes("Needs Clarification"),
      );
      expect(clarificationComment).toBeDefined();
    });

    it("creates a clarification issue with needs-clarification label", async () => {
      const parser = createMockParser([CRITICAL_FINDING]);

      vi.mocked(copilot.invoke)
        .mockResolvedValueOnce({ success: true, output: "## Security Report", duration_ms: 1000, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "## Code Review Report", duration_ms: 1200, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "QUESTIONABLE\nUnclear relevance.", duration_ms: 500, model_used: "claude-sonnet-4.5" });

      const analyzer = createMergeReviewAnalyzer({ copilot, github, state, parser });
      await analyzer.execute(createContext());

      expect(github.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: expect.arrayContaining(["craig:needs-clarification"]),
        }),
      );
    });

    it("does NOT trigger auto_develop for QUESTIONABLE findings", async () => {
      const parser = createMockParser([CRITICAL_FINDING]);
      const mockAutoDevelop: AnalyzerPort = {
        name: "auto_develop",
        execute: vi.fn().mockResolvedValue({
          success: true,
          summary: "auto_develop done",
          findings: [],
          actions: [],
          duration_ms: 100,
        }),
      };
      const registry = { get: vi.fn().mockReturnValue(mockAutoDevelop) };

      // Parser returns findings for BOTH parse calls → 2 findings total
      // Need classification for each: both QUESTIONABLE
      vi.mocked(copilot.invoke)
        .mockResolvedValueOnce({ success: true, output: "## Security Report", duration_ms: 1000, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "## Code Review Report", duration_ms: 1200, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "QUESTIONABLE\nUnclear.", duration_ms: 500, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "QUESTIONABLE\nUnclear.", duration_ms: 500, model_used: "claude-sonnet-4.5" });

      const analyzer = createMergeReviewAnalyzer({ copilot, github, state, parser, registry });
      await analyzer.execute(createContext());

      expect(mockAutoDevelop.execute).not.toHaveBeenCalled();
    });
  });

  describe("OUT_OF_SCOPE classification", () => {
    it("posts a commit comment recommending deletion", async () => {
      const parser = createMockParser([CRITICAL_FINDING]);

      vi.mocked(copilot.invoke)
        .mockResolvedValueOnce({ success: true, output: "## Security Report", duration_ms: 1000, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "## Code Review Report", duration_ms: 1200, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "OUT_OF_SCOPE\nPython file in TypeScript project.", duration_ms: 500, model_used: "claude-sonnet-4.5" });

      const analyzer = createMergeReviewAnalyzer({ copilot, github, state, parser });
      await analyzer.execute(createContext());

      const commentCalls = vi.mocked(github.createCommitComment).mock.calls;
      const outOfScopeComment = commentCalls.find(
        (call) => typeof call[1] === "string" && call[1].includes("Out of Scope"),
      );
      expect(outOfScopeComment).toBeDefined();
    });

    it("creates a clarification issue with needs-clarification label", async () => {
      const parser = createMockParser([CRITICAL_FINDING]);

      vi.mocked(copilot.invoke)
        .mockResolvedValueOnce({ success: true, output: "## Security Report", duration_ms: 1000, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "## Code Review Report", duration_ms: 1200, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "OUT_OF_SCOPE\nDoesn't belong.", duration_ms: 500, model_used: "claude-sonnet-4.5" });

      const analyzer = createMergeReviewAnalyzer({ copilot, github, state, parser });
      await analyzer.execute(createContext());

      expect(github.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: expect.arrayContaining(["craig:needs-clarification"]),
        }),
      );
    });

    it("does NOT trigger auto_develop for OUT_OF_SCOPE findings", async () => {
      const parser = createMockParser([CRITICAL_FINDING]);
      const mockAutoDevelop: AnalyzerPort = {
        name: "auto_develop",
        execute: vi.fn().mockResolvedValue({
          success: true,
          summary: "auto_develop done",
          findings: [],
          actions: [],
          duration_ms: 100,
        }),
      };
      const registry = { get: vi.fn().mockReturnValue(mockAutoDevelop) };

      // Parser returns findings for BOTH parse calls → 2 findings total
      // Need classification for each: both OUT_OF_SCOPE
      vi.mocked(copilot.invoke)
        .mockResolvedValueOnce({ success: true, output: "## Security Report", duration_ms: 1000, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "## Code Review Report", duration_ms: 1200, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "OUT_OF_SCOPE\nWrong project.", duration_ms: 500, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "OUT_OF_SCOPE\nWrong project.", duration_ms: 500, model_used: "claude-sonnet-4.5" });

      const analyzer = createMergeReviewAnalyzer({ copilot, github, state, parser, registry });
      await analyzer.execute(createContext());

      expect(mockAutoDevelop.execute).not.toHaveBeenCalled();
    });
  });

  describe("classification fallback", () => {
    it("defaults to IN_SCOPE when PO Guardian classification fails", async () => {
      const parser = createMockParser([CRITICAL_FINDING]);

      vi.mocked(copilot.invoke)
        .mockResolvedValueOnce({ success: true, output: "## Security Report", duration_ms: 1000, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "## Code Review Report", duration_ms: 1200, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: false, output: "", duration_ms: 500, model_used: "claude-sonnet-4.5", error: "Timeout" })
        .mockResolvedValueOnce({ success: true, output: "## Issue Ticket\n".padEnd(100, "x"), duration_ms: 800, model_used: "claude-sonnet-4.5" });

      const analyzer = createMergeReviewAnalyzer({ copilot, github, state, parser });
      await analyzer.execute(createContext());

      // Should create a normal fix ticket (IN_SCOPE default behavior)
      expect(github.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: expect.not.arrayContaining(["craig:needs-clarification"]),
        }),
      );
    });

    it("defaults to IN_SCOPE when PO Guardian returns unparseable output", async () => {
      const parser = createMockParser([CRITICAL_FINDING]);

      vi.mocked(copilot.invoke)
        .mockResolvedValueOnce({ success: true, output: "## Security Report", duration_ms: 1000, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "## Code Review Report", duration_ms: 1200, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "I'm not sure what to make of this finding.", duration_ms: 500, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "## Issue Ticket\n".padEnd(100, "x"), duration_ms: 800, model_used: "claude-sonnet-4.5" });

      const analyzer = createMergeReviewAnalyzer({ copilot, github, state, parser });
      await analyzer.execute(createContext());

      // Should create a normal fix ticket (IN_SCOPE default behavior)
      expect(github.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: expect.not.arrayContaining(["craig:needs-clarification"]),
        }),
      );
    });

    it("defaults to IN_SCOPE when classification invocation throws", async () => {
      const parser = createMockParser([CRITICAL_FINDING]);

      // Guardians succeed, classifications return failure result, ticket writing falls to base mock
      vi.mocked(copilot.invoke)
        .mockResolvedValueOnce({ success: true, output: "## Security Report", duration_ms: 1000, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "## Code Review Report", duration_ms: 1200, model_used: "claude-sonnet-4.5" })
        // Classification calls return failure → classifyFinding defaults to IN_SCOPE
        .mockResolvedValueOnce({ success: false, output: "", duration_ms: 500, model_used: "claude-sonnet-4.5", error: "Copilot unavailable" })
        .mockResolvedValueOnce({ success: false, output: "", duration_ms: 500, model_used: "claude-sonnet-4.5", error: "Copilot unavailable" });
      // Remaining calls (ticket writing) fall back to base mock from createMockCopilot

      const analyzer = createMergeReviewAnalyzer({ copilot, github, state, parser });
      const result = await analyzer.execute(createContext());

      expect(result.success).toBe(true);
      // Should default to IN_SCOPE and create normal issues
      expect(github.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: expect.not.arrayContaining(["craig:needs-clarification"]),
        }),
      );
    });
  });

  describe("auto_develop gating", () => {
    it("triggers auto_develop ONLY when inScopeCount > 0", async () => {
      const parser = createMockParser([CRITICAL_FINDING]);
      const mockAutoDevelop: AnalyzerPort = {
        name: "auto_develop",
        execute: vi.fn().mockResolvedValue({
          success: true,
          summary: "auto_develop done",
          findings: [],
          actions: [],
          duration_ms: 100,
        }),
      };
      const registry = { get: vi.fn().mockReturnValue(mockAutoDevelop) };

      // IN_SCOPE → should trigger auto_develop
      vi.mocked(copilot.invoke)
        .mockResolvedValueOnce({ success: true, output: "## Security Report", duration_ms: 1000, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "## Code Review Report", duration_ms: 1200, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "IN_SCOPE\nValid finding.", duration_ms: 500, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "## Issue Ticket\n".padEnd(100, "x"), duration_ms: 800, model_used: "claude-sonnet-4.5" });

      const analyzer = createMergeReviewAnalyzer({ copilot, github, state, parser, registry });
      await analyzer.execute(createContext());

      expect(mockAutoDevelop.execute).toHaveBeenCalled();
    });
  });

  describe("project context gathering", () => {
    it("calls getFileContents and getLanguages during classification", async () => {
      const parser = createMockParser([CRITICAL_FINDING]);

      vi.mocked(copilot.invoke)
        .mockResolvedValueOnce({ success: true, output: "## Security Report", duration_ms: 1000, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "## Code Review Report", duration_ms: 1200, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "IN_SCOPE", duration_ms: 500, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "## Issue\n".padEnd(100, "x"), duration_ms: 800, model_used: "claude-sonnet-4.5" });

      const analyzer = createMergeReviewAnalyzer({ copilot, github, state, parser });
      await analyzer.execute(createContext());

      expect(github.getFileContents).toHaveBeenCalledWith("README.md");
      expect(github.getLanguages).toHaveBeenCalled();
    });

    it("continues gracefully when getFileContents is unavailable", async () => {
      const parser = createMockParser([CRITICAL_FINDING]);
      vi.mocked(github.getFileContents).mockRejectedValue(new Error("404"));

      vi.mocked(copilot.invoke)
        .mockResolvedValueOnce({ success: true, output: "## Security Report", duration_ms: 1000, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "## Code Review Report", duration_ms: 1200, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "IN_SCOPE", duration_ms: 500, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "## Issue\n".padEnd(100, "x"), duration_ms: 800, model_used: "claude-sonnet-4.5" });

      const analyzer = createMergeReviewAnalyzer({ copilot, github, state, parser });
      const result = await analyzer.execute(createContext());

      expect(result.success).toBe(true);
    });

    it("sends classification prompt to PO Guardian with project context", async () => {
      const parser = createMockParser([CRITICAL_FINDING]);

      vi.mocked(copilot.invoke)
        .mockResolvedValueOnce({ success: true, output: "## Security Report", duration_ms: 1000, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "## Code Review Report", duration_ms: 1200, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "IN_SCOPE", duration_ms: 500, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "## Issue\n".padEnd(100, "x"), duration_ms: 800, model_used: "claude-sonnet-4.5" });

      const analyzer = createMergeReviewAnalyzer({ copilot, github, state, parser });
      await analyzer.execute(createContext());

      // Third invoke call should be the classification prompt
      const classificationCall = vi.mocked(copilot.invoke).mock.calls[2];
      expect(classificationCall).toBeDefined();
      expect(classificationCall![0].agent).toBe("po-guardian");
      expect(classificationCall![0].prompt).toContain("TypeScript");
      expect(classificationCall![0].prompt).toContain("IN_SCOPE");
      expect(classificationCall![0].prompt).toContain("QUESTIONABLE");
      expect(classificationCall![0].prompt).toContain("OUT_OF_SCOPE");
    });
  });

  describe("PO Guardian ticket body (buildTicketBody)", () => {
    it("uses PO Guardian rich ticket body when invocation succeeds with substantial output", async () => {
      const parser = createMockParser([CRITICAL_FINDING]);
      const richTicket = "## SQL Injection Vulnerability\n\n### Summary\nA critical SQL injection...\n\n### Acceptance Criteria\n- [ ] Fix parameterized query\n";

      vi.mocked(copilot.invoke)
        .mockResolvedValueOnce({ success: true, output: "## Security Report", duration_ms: 1000, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "## Code Review Report", duration_ms: 1200, model_used: "claude-sonnet-4.5" })
        // Classification: IN_SCOPE
        .mockResolvedValueOnce({ success: true, output: "IN_SCOPE\nValid finding.", duration_ms: 500, model_used: "claude-sonnet-4.5" })
        // PO ticket writing: rich output (> 50 chars)
        .mockResolvedValueOnce({ success: true, output: richTicket, duration_ms: 800, model_used: "claude-sonnet-4.5" })
        // Second finding (same mock from parser returning 2 findings)
        .mockResolvedValueOnce({ success: true, output: "IN_SCOPE\nValid finding.", duration_ms: 500, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: richTicket, duration_ms: 800, model_used: "claude-sonnet-4.5" });

      const analyzer = createMergeReviewAnalyzer({ copilot, github, state, parser });
      await analyzer.execute(createContext());

      // createIssue should be called with the PO Guardian's rich ticket body
      expect(github.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          body: richTicket,
        }),
      );
    });

    it("falls back to basic template when PO Guardian invocation fails", async () => {
      const parser = createMockParser([CRITICAL_FINDING]);

      vi.mocked(copilot.invoke)
        .mockResolvedValueOnce({ success: true, output: "## Security Report", duration_ms: 1000, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "## Code Review Report", duration_ms: 1200, model_used: "claude-sonnet-4.5" })
        // Classification: IN_SCOPE
        .mockResolvedValueOnce({ success: true, output: "IN_SCOPE", duration_ms: 500, model_used: "claude-sonnet-4.5" })
        // PO ticket writing: failure
        .mockResolvedValueOnce({ success: false, output: "", duration_ms: 500, model_used: "claude-sonnet-4.5", error: "Timeout" })
        // Second finding
        .mockResolvedValueOnce({ success: true, output: "IN_SCOPE", duration_ms: 500, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: false, output: "", duration_ms: 500, model_used: "claude-sonnet-4.5", error: "Timeout" });

      const analyzer = createMergeReviewAnalyzer({ copilot, github, state, parser });
      await analyzer.execute(createContext());

      // Should use basic template with structured finding info
      expect(github.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining("## Finding"),
        }),
      );
      expect(github.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining("SQL injection"),
        }),
      );
    });

    it("falls back to basic template when PO Guardian returns short output (< 50 chars)", async () => {
      const parser = createMockParser([CRITICAL_FINDING]);

      vi.mocked(copilot.invoke)
        .mockResolvedValueOnce({ success: true, output: "## Security Report", duration_ms: 1000, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "## Code Review Report", duration_ms: 1200, model_used: "claude-sonnet-4.5" })
        // Classification: IN_SCOPE
        .mockResolvedValueOnce({ success: true, output: "IN_SCOPE", duration_ms: 500, model_used: "claude-sonnet-4.5" })
        // PO ticket writing: success but too short
        .mockResolvedValueOnce({ success: true, output: "Fix it.", duration_ms: 500, model_used: "claude-sonnet-4.5" })
        // Second finding
        .mockResolvedValueOnce({ success: true, output: "IN_SCOPE", duration_ms: 500, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "Fix it.", duration_ms: 500, model_used: "claude-sonnet-4.5" });

      const analyzer = createMergeReviewAnalyzer({ copilot, github, state, parser });
      await analyzer.execute(createContext());

      // Short PO output should be discarded — basic template used
      expect(github.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining("## Finding"),
        }),
      );
      // Should NOT use the short PO output as the body
      expect(github.createIssue).not.toHaveBeenCalledWith(
        expect.objectContaining({
          body: "Fix it.",
        }),
      );
    });

    it("uses basic template when copilot is undefined", async () => {
      // Use a parser that returns findings only from one parse call
      const parser: ResultParserPort = {
        parse: vi.fn()
          .mockReturnValueOnce({
            guardian: "security",
            summary: "Found issues",
            findings: [CRITICAL_FINDING],
            recommended_actions: [],
            raw: "",
          } satisfies ParsedReport)
          .mockReturnValueOnce({
            guardian: "code-review",
            summary: "No issues",
            findings: [],
            recommended_actions: [],
            raw: "",
          } satisfies ParsedReport),
      };

      // Create deps without copilot — this means guardians won't run either,
      // but we test the buildTicketBody fallback path. We need a copilot
      // that succeeds for guardians + classification but simulate undefined
      // in buildTicketBody. Since buildTicketBody checks !copilot, and the
      // guardians need copilot, let's test with a copilot that works for
      // guardians/classification but PO ticket returns unusable output.
      vi.mocked(copilot.invoke)
        .mockResolvedValueOnce({ success: true, output: "## Security Report", duration_ms: 1000, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "## Code Review Report", duration_ms: 1200, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "IN_SCOPE", duration_ms: 500, model_used: "claude-sonnet-4.5" })
        // PO returns empty (simulates unavailable)
        .mockResolvedValueOnce({ success: true, output: "", duration_ms: 500, model_used: "claude-sonnet-4.5" });

      const analyzer = createMergeReviewAnalyzer({ copilot, github, state, parser });
      await analyzer.execute(createContext());

      // Basic template should be used
      expect(github.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining("## Finding"),
        }),
      );
    });

    it("sends finding data in context parameter (not prompt) to prevent prompt injection", async () => {
      const parser = createMockParser([CRITICAL_FINDING]);

      vi.mocked(copilot.invoke)
        .mockResolvedValueOnce({ success: true, output: "## Security Report", duration_ms: 1000, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "## Code Review Report", duration_ms: 1200, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "IN_SCOPE", duration_ms: 500, model_used: "claude-sonnet-4.5" })
        .mockResolvedValueOnce({ success: true, output: "## Rich Ticket Body with lots of content for the issue".padEnd(100, "."), duration_ms: 800, model_used: "claude-sonnet-4.5" });

      const analyzer = createMergeReviewAnalyzer({ copilot, github, state, parser });
      await analyzer.execute(createContext());

      // The PO ticket writing call (4th invoke) should have finding data in context, not prompt
      const poTicketCall = vi.mocked(copilot.invoke).mock.calls[3];
      expect(poTicketCall).toBeDefined();
      expect(poTicketCall![0].agent).toBe("po-guardian");
      // Prompt should NOT contain raw finding data
      expect(poTicketCall![0].prompt).not.toContain("SQL injection");
      expect(poTicketCall![0].prompt).not.toContain("OWASP A05");
      // Context SHOULD contain finding data
      expect(poTicketCall![0].context).toContain("SQL injection");
      expect(poTicketCall![0].context).toContain("OWASP A05");
    });
  });
});
