/**
 * Security Scan Analyzer — Unit Tests
 *
 * Tests derived from Issue #10 acceptance criteria:
 * - AC1: Full repo security scan invokes Security Guardian
 * - AC2: Issue creation for critical/high findings
 * - AC3: Issue body contains Guardian output
 * - AC4: Skip duplicate findings
 * - Edge: Zero findings → clean scan, no issues
 * - Edge: Guardian timeout → record failure, incident on 3 consecutive
 *
 * [TDD] Written BEFORE implementation — Red phase.
 *
 * @module analyzers/security-scan/__tests__
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSecurityScanAnalyzer } from "../security-scan.analyzer.js";
import type { Analyzer, AnalyzerContext } from "../../analyzer.types.js";
import type { CopilotPort, InvokeResult } from "../../../copilot/index.js";
import type { GitHubPort, IssueReference } from "../../../github/index.js";
import type { StatePort } from "../../../state/index.js";
import type { ResultParserPort, ParsedFinding } from "../../../result-parser/index.js";

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockCopilot(): CopilotPort {
  return {
    invoke: vi.fn<CopilotPort["invoke"]>().mockResolvedValue({
      success: true,
      output: "## Security Guardian Report\n\nNo issues found.",
      duration_ms: 2000,
      model_used: "claude-sonnet-4.5",
    }),
    isAvailable: vi.fn<CopilotPort["isAvailable"]>().mockResolvedValue(true),
  };
}

function createMockGitHub(): GitHubPort {
  return {
    createIssue: vi.fn<GitHubPort["createIssue"]>().mockResolvedValue({
      url: "https://github.com/owner/repo/issues/1",
      number: 1,
    }),
    findExistingIssue: vi.fn<GitHubPort["findExistingIssue"]>().mockResolvedValue(null),
    listOpenIssues: vi.fn<GitHubPort["listOpenIssues"]>().mockResolvedValue([]),
    createDraftPR: vi.fn<GitHubPort["createDraftPR"]>().mockResolvedValue({
      url: "https://github.com/owner/repo/pull/1",
      number: 1,
    }),
    createCommitComment: vi.fn<GitHubPort["createCommitComment"]>().mockResolvedValue({
      url: "https://github.com/owner/repo/commit/abc123#comment-1",
    }),
    getLatestCommits: vi.fn<GitHubPort["getLatestCommits"]>().mockResolvedValue([]),
    getCommitDiff: vi.fn<GitHubPort["getCommitDiff"]>().mockResolvedValue({
      sha: "abc123",
      files: [],
    }),
    getMergeCommits: vi.fn<GitHubPort["getMergeCommits"]>().mockResolvedValue([]),
    getRateLimit: vi.fn<GitHubPort["getRateLimit"]>().mockResolvedValue({
      remaining: 5000,
      reset: new Date(),
    }),
  };
}

function createMockState(): StatePort {
  return {
    load: vi.fn<StatePort["load"]>().mockResolvedValue(undefined),
    save: vi.fn<StatePort["save"]>().mockResolvedValue(undefined),
    get: vi.fn<StatePort["get"]>().mockReturnValue([]),
    set: vi.fn<StatePort["set"]>(),
    addFinding: vi.fn<StatePort["addFinding"]>(),
    getFindings: vi.fn<StatePort["getFindings"]>().mockReturnValue([]),
  };
}

function createMockParser(): ResultParserPort {
  return {
    parse: vi.fn<ResultParserPort["parse"]>().mockReturnValue({
      guardian: "security",
      summary: "No issues found.",
      findings: [],
      recommended_actions: [],
      raw: "",
    }),
  };
}

/** Helper: create a ParsedFinding for testing. */
function makeFinding(overrides: Partial<ParsedFinding> = {}): ParsedFinding {
  return {
    number: 1,
    severity: "critical",
    category: "[OWASP-A03]",
    file_line: "src/db.py:42",
    issue: "SQL injection vulnerability",
    source_justification: "User input concatenated into SQL query",
    suggested_fix: "Use parameterized queries",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("SecurityScanAnalyzer", () => {
  let copilot: CopilotPort;
  let github: GitHubPort;
  let state: StatePort;
  let parser: ResultParserPort;
  let analyzer: Analyzer;

  const scheduleContext: AnalyzerContext = { trigger: "schedule" };
  const manualContext: AnalyzerContext = { trigger: "manual" };

  beforeEach(() => {
    copilot = createMockCopilot();
    github = createMockGitHub();
    state = createMockState();
    parser = createMockParser();
    analyzer = createSecurityScanAnalyzer({ copilot, github, state, parser });
  });

  // -----------------------------------------------------------------------
  // Basic contract
  // -----------------------------------------------------------------------

  describe("Analyzer contract", () => {
    it("has name 'security-scan'", () => {
      expect(analyzer.name).toBe("security-scan");
    });

    it("implements Analyzer interface (execute returns AnalyzerResult)", async () => {
      const result = await analyzer.execute(scheduleContext);

      expect(result).toHaveProperty("task", "security_scan");
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("findings");
      expect(result).toHaveProperty("actions_taken");
      expect(result).toHaveProperty("duration_ms");
      expect(typeof result.duration_ms).toBe("number");
    });
  });

  // -----------------------------------------------------------------------
  // AC1: Full repo security scan
  // -----------------------------------------------------------------------

  describe("AC1: Full repo security scan", () => {
    it("invokes Security Guardian with full-repo scan prompt on schedule trigger", async () => {
      await analyzer.execute(scheduleContext);

      expect(copilot.invoke).toHaveBeenCalledTimes(1);
      expect(copilot.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          agent: "security-guardian",
          prompt: expect.stringContaining("full security review"),
        }),
      );
    });

    it("invokes Security Guardian with the expected tools in the prompt", async () => {
      await analyzer.execute(scheduleContext);

      const invokeCall = vi.mocked(copilot.invoke).mock.calls[0]![0];
      expect(invokeCall.prompt).toContain("Semgrep");
      expect(invokeCall.prompt).toContain("Gitleaks");
      expect(invokeCall.prompt).toContain("Trivy");
      expect(invokeCall.prompt).toContain("dependency audit");
    });

    it("works with manual trigger", async () => {
      await analyzer.execute(manualContext);

      expect(copilot.invoke).toHaveBeenCalledTimes(1);
      expect(copilot.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          agent: "security-guardian",
        }),
      );
    });

    it("parses the Guardian output with result parser", async () => {
      const guardianOutput = "## Security Guardian Report\n\n| # | Severity |";
      vi.mocked(copilot.invoke).mockResolvedValue({
        success: true,
        output: guardianOutput,
        duration_ms: 3000,
        model_used: "claude-sonnet-4.5",
      });

      await analyzer.execute(scheduleContext);

      expect(parser.parse).toHaveBeenCalledWith(guardianOutput, "security");
    });

    it("stores findings in state", async () => {
      const finding = makeFinding();
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "1 critical finding",
        findings: [finding],
        recommended_actions: [],
        raw: "",
      });
      // No duplicate exists
      vi.mocked(github.findExistingIssue).mockResolvedValue(null);

      await analyzer.execute(scheduleContext);

      expect(state.addFinding).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "critical",
          category: "[OWASP-A03]",
          issue: "SQL injection vulnerability",
          source: "security-guardian",
          task: "security_scan",
        }),
      );
    });

    it("saves state after execution", async () => {
      await analyzer.execute(scheduleContext);

      expect(state.save).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // AC2: Issue creation for critical/high
  // -----------------------------------------------------------------------

  describe("AC2: Issue creation for critical/high findings", () => {
    it("creates GitHub issues for CRITICAL findings with correct labels", async () => {
      const criticalFinding = makeFinding({
        severity: "critical",
        issue: "SQL injection in src/db.py:42",
      });

      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "1 critical finding",
        findings: [criticalFinding],
        recommended_actions: [],
        raw: "",
      });
      vi.mocked(github.findExistingIssue).mockResolvedValue(null);

      await analyzer.execute(scheduleContext);

      expect(github.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: expect.arrayContaining(["craig", "security", "critical"]),
        }),
      );
    });

    it("creates GitHub issues for HIGH findings with correct labels", async () => {
      const highFinding = makeFinding({
        severity: "high",
        issue: "XSS vulnerability in template",
      });

      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "1 high finding",
        findings: [highFinding],
        recommended_actions: [],
        raw: "",
      });
      vi.mocked(github.findExistingIssue).mockResolvedValue(null);

      await analyzer.execute(scheduleContext);

      expect(github.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: expect.arrayContaining(["craig", "security", "high"]),
        }),
      );
    });

    it("creates issues for all critical and high findings", async () => {
      const findings: ParsedFinding[] = [
        makeFinding({ number: 1, severity: "critical", issue: "SQL injection" }),
        makeFinding({ number: 2, severity: "critical", issue: "RCE vulnerability" }),
        makeFinding({ number: 3, severity: "high", issue: "XSS vulnerability" }),
        makeFinding({ number: 4, severity: "medium", issue: "Missing CSRF token" }),
        makeFinding({ number: 5, severity: "low", issue: "Verbose error messages" }),
      ];

      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "5 findings",
        findings,
        recommended_actions: [],
        raw: "",
      });
      vi.mocked(github.findExistingIssue).mockResolvedValue(null);
      // Return unique URLs for each issue
      let issueCounter = 1;
      vi.mocked(github.createIssue).mockImplementation(async () => ({
        url: `https://github.com/owner/repo/issues/${issueCounter}`,
        number: issueCounter++,
      }));

      const result = await analyzer.execute(scheduleContext);

      // 3 issues: 2 critical + 1 high (not medium or low)
      expect(github.createIssue).toHaveBeenCalledTimes(3);
      expect(result.actions_taken).toHaveLength(3);
      expect(result.actions_taken.every((a) => a.type === "issue_created")).toBe(true);
    });

    it("does NOT create issues for medium/low/info findings", async () => {
      const findings: ParsedFinding[] = [
        makeFinding({ number: 1, severity: "medium", issue: "Missing CSRF" }),
        makeFinding({ number: 2, severity: "low", issue: "Verbose errors" }),
        makeFinding({ number: 3, severity: "info", issue: "Code style note" }),
      ];

      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "3 findings",
        findings,
        recommended_actions: [],
        raw: "",
      });

      const result = await analyzer.execute(scheduleContext);

      expect(github.createIssue).not.toHaveBeenCalled();
      expect(result.actions_taken).toHaveLength(0);
    });

    it("records actions_taken with issue URLs", async () => {
      const finding = makeFinding({ severity: "critical", issue: "SQL injection" });
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "1 finding",
        findings: [finding],
        recommended_actions: [],
        raw: "",
      });
      vi.mocked(github.findExistingIssue).mockResolvedValue(null);
      vi.mocked(github.createIssue).mockResolvedValue({
        url: "https://github.com/owner/repo/issues/42",
        number: 42,
      });

      const result = await analyzer.execute(scheduleContext);

      expect(result.actions_taken).toEqual([
        expect.objectContaining({
          type: "issue_created",
          url: "https://github.com/owner/repo/issues/42",
          description: expect.stringContaining("SQL injection"),
        }),
      ]);
    });
  });

  // -----------------------------------------------------------------------
  // AC3: Issue body contains Guardian output
  // -----------------------------------------------------------------------

  describe("AC3: Issue body contains Guardian output", () => {
    it("includes severity in the issue body", async () => {
      const finding = makeFinding({
        severity: "critical",
        issue: "SQL injection in src/db.py:42",
        category: "[OWASP-A03]",
        file_line: "src/db.py:42",
        source_justification: "User input concatenated into SQL query",
        suggested_fix: "Use parameterized queries",
      });

      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "1 critical",
        findings: [finding],
        recommended_actions: [],
        raw: "",
      });
      vi.mocked(github.findExistingIssue).mockResolvedValue(null);

      await analyzer.execute(scheduleContext);

      const issueBody = vi.mocked(github.createIssue).mock.calls[0]![0].body;
      expect(issueBody.toLowerCase()).toContain("critical");
    });

    it("includes OWASP category in the issue body", async () => {
      const finding = makeFinding({ category: "[OWASP-A03]" });
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "1 finding",
        findings: [finding],
        recommended_actions: [],
        raw: "",
      });
      vi.mocked(github.findExistingIssue).mockResolvedValue(null);

      await analyzer.execute(scheduleContext);

      const issueBody = vi.mocked(github.createIssue).mock.calls[0]![0].body;
      expect(issueBody).toContain("[OWASP-A03]");
    });

    it("includes file/line in the issue body", async () => {
      const finding = makeFinding({ file_line: "src/db.py:42" });
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "1 finding",
        findings: [finding],
        recommended_actions: [],
        raw: "",
      });
      vi.mocked(github.findExistingIssue).mockResolvedValue(null);

      await analyzer.execute(scheduleContext);

      const issueBody = vi.mocked(github.createIssue).mock.calls[0]![0].body;
      expect(issueBody).toContain("src/db.py:42");
    });

    it("includes description (issue text) in the issue body", async () => {
      const finding = makeFinding({ issue: "SQL injection vulnerability" });
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "1 finding",
        findings: [finding],
        recommended_actions: [],
        raw: "",
      });
      vi.mocked(github.findExistingIssue).mockResolvedValue(null);

      await analyzer.execute(scheduleContext);

      const issueBody = vi.mocked(github.createIssue).mock.calls[0]![0].body;
      expect(issueBody).toContain("SQL injection vulnerability");
    });

    it("includes justification in the issue body", async () => {
      const finding = makeFinding({
        source_justification: "User input concatenated into SQL query",
      });
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "1 finding",
        findings: [finding],
        recommended_actions: [],
        raw: "",
      });
      vi.mocked(github.findExistingIssue).mockResolvedValue(null);

      await analyzer.execute(scheduleContext);

      const issueBody = vi.mocked(github.createIssue).mock.calls[0]![0].body;
      expect(issueBody).toContain("User input concatenated into SQL query");
    });

    it("includes suggested fix in the issue body", async () => {
      const finding = makeFinding({
        suggested_fix: "Use parameterized queries",
      });
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "1 finding",
        findings: [finding],
        recommended_actions: [],
        raw: "",
      });
      vi.mocked(github.findExistingIssue).mockResolvedValue(null);

      await analyzer.execute(scheduleContext);

      const issueBody = vi.mocked(github.createIssue).mock.calls[0]![0].body;
      expect(issueBody).toContain("Use parameterized queries");
    });

    it("issue title contains severity emoji and finding description", async () => {
      const finding = makeFinding({
        severity: "critical",
        issue: "SQL injection in src/db.py",
      });
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "1 critical",
        findings: [finding],
        recommended_actions: [],
        raw: "",
      });
      vi.mocked(github.findExistingIssue).mockResolvedValue(null);

      await analyzer.execute(scheduleContext);

      const issueTitle = vi.mocked(github.createIssue).mock.calls[0]![0].title;
      expect(issueTitle).toContain("🔴");
      expect(issueTitle).toContain("Security");
      expect(issueTitle).toContain("SQL injection in src/db.py");
    });

    it("high finding title uses orange emoji", async () => {
      const finding = makeFinding({
        severity: "high",
        issue: "XSS vulnerability",
      });
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "1 high",
        findings: [finding],
        recommended_actions: [],
        raw: "",
      });
      vi.mocked(github.findExistingIssue).mockResolvedValue(null);

      await analyzer.execute(scheduleContext);

      const issueTitle = vi.mocked(github.createIssue).mock.calls[0]![0].title;
      expect(issueTitle).toContain("🟠");
    });
  });

  // -----------------------------------------------------------------------
  // AC4: Skip duplicate findings
  // -----------------------------------------------------------------------

  describe("AC4: Skip duplicate findings", () => {
    it("does not create a duplicate issue when one already exists with matching title", async () => {
      const finding = makeFinding({
        severity: "critical",
        issue: "SQL injection in src/db.py",
      });

      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "1 critical",
        findings: [finding],
        recommended_actions: [],
        raw: "",
      });

      // Simulate existing open issue with matching title
      vi.mocked(github.findExistingIssue).mockResolvedValue({
        url: "https://github.com/owner/repo/issues/5",
        number: 5,
      });

      const result = await analyzer.execute(scheduleContext);

      expect(github.createIssue).not.toHaveBeenCalled();
      expect(result.actions_taken).toHaveLength(0);
    });

    it("creates issue for new finding but skips duplicate", async () => {
      const findings: ParsedFinding[] = [
        makeFinding({ number: 1, severity: "critical", issue: "SQL injection" }),
        makeFinding({ number: 2, severity: "critical", issue: "RCE vulnerability" }),
      ];

      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "2 critical",
        findings,
        recommended_actions: [],
        raw: "",
      });

      // First finding already has an issue; second does not
      vi.mocked(github.findExistingIssue)
        .mockResolvedValueOnce({
          url: "https://github.com/owner/repo/issues/5",
          number: 5,
        })
        .mockResolvedValueOnce(null);

      vi.mocked(github.createIssue).mockResolvedValue({
        url: "https://github.com/owner/repo/issues/10",
        number: 10,
      });

      const result = await analyzer.execute(scheduleContext);

      // Only 1 issue created (the non-duplicate)
      expect(github.createIssue).toHaveBeenCalledTimes(1);
      expect(result.actions_taken).toHaveLength(1);
    });

    it("still stores finding in state even when issue is a duplicate", async () => {
      const finding = makeFinding({
        severity: "critical",
        issue: "SQL injection in src/db.py",
      });

      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "1 critical",
        findings: [finding],
        recommended_actions: [],
        raw: "",
      });

      vi.mocked(github.findExistingIssue).mockResolvedValue({
        url: "https://github.com/owner/repo/issues/5",
        number: 5,
      });

      await analyzer.execute(scheduleContext);

      // Finding still recorded in state even if duplicate
      expect(state.addFinding).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Edge: Zero findings
  // -----------------------------------------------------------------------

  describe("Edge: Zero findings — clean scan", () => {
    it("returns success with empty findings and no actions", async () => {
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "No issues found.",
        findings: [],
        recommended_actions: [],
        raw: "",
      });

      const result = await analyzer.execute(scheduleContext);

      expect(result.success).toBe(true);
      expect(result.findings).toEqual([]);
      expect(result.actions_taken).toEqual([]);
    });

    it("does not create any GitHub issues", async () => {
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "No issues found.",
        findings: [],
        recommended_actions: [],
        raw: "",
      });

      await analyzer.execute(scheduleContext);

      expect(github.createIssue).not.toHaveBeenCalled();
    });

    it("still saves state on clean scan", async () => {
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "Clean.",
        findings: [],
        recommended_actions: [],
        raw: "",
      });

      await analyzer.execute(scheduleContext);

      expect(state.save).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Edge: Guardian timeout / failure
  // -----------------------------------------------------------------------

  describe("Edge: Guardian timeout / failure", () => {
    it("returns success=false with error message on Guardian failure", async () => {
      vi.mocked(copilot.invoke).mockResolvedValue({
        success: false,
        output: "",
        duration_ms: 300000,
        model_used: "claude-sonnet-4.5",
        error: "Timeout after 300000ms",
      });

      const result = await analyzer.execute(scheduleContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Timeout");
      expect(result.findings).toEqual([]);
      expect(result.actions_taken).toEqual([]);
    });

    it("records failure in state", async () => {
      vi.mocked(copilot.invoke).mockResolvedValue({
        success: false,
        output: "",
        duration_ms: 300000,
        model_used: "claude-sonnet-4.5",
        error: "Timeout after 300000ms",
      });

      await analyzer.execute(scheduleContext);

      expect(state.save).toHaveBeenCalled();
    });

    it("creates incident issue after 3 consecutive failures", async () => {
      // Simulate 2 prior consecutive failures in state
      vi.mocked(state.get).mockImplementation((<K extends string>(key: K) => {
        if (key === "last_runs") {
          return { security_scan: new Date().toISOString() };
        }
        return [];
      }) as StatePort["get"]);
      vi.mocked(state.getFindings).mockReturnValue([]);

      vi.mocked(copilot.invoke).mockResolvedValue({
        success: false,
        output: "",
        duration_ms: 300000,
        model_used: "claude-sonnet-4.5",
        error: "Timeout after 300000ms",
      });

      // Track consecutive failures — the analyzer uses an internal counter
      // We need to create a fresh analyzer that tracks this
      const analyzerWithFailures = createSecurityScanAnalyzer({
        copilot,
        github,
        state,
        parser,
        consecutiveFailures: 2, // 2 prior failures
      });

      vi.mocked(github.findExistingIssue).mockResolvedValue(null);

      const result = await analyzerWithFailures.execute(scheduleContext);

      expect(result.success).toBe(false);
      // Should create an incident issue on 3rd consecutive failure
      expect(github.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining("Craig Security Scan"),
          labels: expect.arrayContaining(["craig", "incident"]),
        }),
      );
    });

    it("does not create incident issue on first or second failure", async () => {
      vi.mocked(copilot.invoke).mockResolvedValue({
        success: false,
        output: "",
        duration_ms: 300000,
        model_used: "claude-sonnet-4.5",
        error: "Timeout",
      });

      const analyzerFirstFail = createSecurityScanAnalyzer({
        copilot,
        github,
        state,
        parser,
        consecutiveFailures: 0,
      });

      await analyzerFirstFail.execute(scheduleContext);
      expect(github.createIssue).not.toHaveBeenCalled();
    });

    it("never throws — returns error result instead", async () => {
      vi.mocked(copilot.invoke).mockRejectedValue(
        new Error("Network failure"),
      );

      const result = await analyzer.execute(scheduleContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Network failure");
    });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  describe("Error handling", () => {
    it("handles GitHub issue creation failure gracefully", async () => {
      const finding = makeFinding({ severity: "critical", issue: "SQL injection" });
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "1 critical",
        findings: [finding],
        recommended_actions: [],
        raw: "",
      });
      vi.mocked(github.findExistingIssue).mockResolvedValue(null);
      vi.mocked(github.createIssue).mockRejectedValue(
        new Error("GitHub API rate limited"),
      );

      const result = await analyzer.execute(scheduleContext);

      // Should still succeed (scan worked), but note the issue creation failure
      expect(result.success).toBe(true);
      expect(result.findings).toHaveLength(1);
      // No actions_taken since issue creation failed
      expect(result.actions_taken).toHaveLength(0);
    });

    it("handles parser errors gracefully", async () => {
      vi.mocked(copilot.invoke).mockResolvedValue({
        success: true,
        output: "Some malformed output",
        duration_ms: 1000,
        model_used: "claude-sonnet-4.5",
      });
      vi.mocked(parser.parse).mockImplementation(() => {
        throw new Error("Parse failed");
      });

      const result = await analyzer.execute(scheduleContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Parse failed");
    });

    it("returns all findings in result including medium/low", async () => {
      const findings: ParsedFinding[] = [
        makeFinding({ number: 1, severity: "critical", issue: "Critical issue" }),
        makeFinding({ number: 2, severity: "medium", issue: "Medium issue" }),
        makeFinding({ number: 3, severity: "low", issue: "Low issue" }),
      ];

      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "3 findings",
        findings,
        recommended_actions: [],
        raw: "",
      });
      vi.mocked(github.findExistingIssue).mockResolvedValue(null);

      const result = await analyzer.execute(scheduleContext);

      // All findings returned in result
      expect(result.findings).toHaveLength(3);
      // Only critical issues create GitHub issues
      expect(github.createIssue).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // Finding storage
  // -----------------------------------------------------------------------

  describe("Finding storage in state", () => {
    it("stores all findings in state regardless of severity", async () => {
      const findings: ParsedFinding[] = [
        makeFinding({ number: 1, severity: "critical", issue: "Critical" }),
        makeFinding({ number: 2, severity: "medium", issue: "Medium" }),
        makeFinding({ number: 3, severity: "low", issue: "Low" }),
      ];

      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "3 findings",
        findings,
        recommended_actions: [],
        raw: "",
      });
      vi.mocked(github.findExistingIssue).mockResolvedValue(null);

      await analyzer.execute(scheduleContext);

      // All 3 findings stored in state
      expect(state.addFinding).toHaveBeenCalledTimes(3);
    });

    it("stores finding with github_issue_url when issue is created", async () => {
      const finding = makeFinding({ severity: "critical", issue: "SQL injection" });
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "1 critical",
        findings: [finding],
        recommended_actions: [],
        raw: "",
      });
      vi.mocked(github.findExistingIssue).mockResolvedValue(null);
      vi.mocked(github.createIssue).mockResolvedValue({
        url: "https://github.com/owner/repo/issues/42",
        number: 42,
      });

      await analyzer.execute(scheduleContext);

      expect(state.addFinding).toHaveBeenCalledWith(
        expect.objectContaining({
          github_issue_url: "https://github.com/owner/repo/issues/42",
        }),
      );
    });
  });
});
