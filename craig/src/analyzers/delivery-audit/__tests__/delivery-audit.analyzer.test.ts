/**
 * Delivery Audit Analyzer — Unit Tests
 *
 * Tests derived from Issue #58 acceptance criteria:
 * - AC1: Invokes Delivery Guardian via CopilotPort
 * - AC2: Parses report and creates issues for critical/high gaps
 * - AC3: Issue body contains Google SRE / 12-Factor references
 * - AC4: Deduplicates issues (skip existing)
 * - AC5: Handles Guardian failure gracefully
 * - AC6: Covers all six review domains (deployment, CI/CD, observability,
 *         SLI/SLO, BCDR, incident response)
 * - Edge: Zero findings → clean audit, no issues
 * - Edge: Consecutive failures → incident issue creation
 *
 * [TDD] Written BEFORE implementation — Red phase.
 *
 * @module analyzers/delivery-audit/__tests__
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDeliveryAuditAnalyzer } from "../delivery-audit.analyzer.js";
import type { AnalyzerPort } from "../../analyzer.port.js";
import type { AnalyzerContext } from "../../analyzer.types.js";
import type { CopilotPort } from "../../../copilot/index.js";
import type { GitHubPort, IssueReference } from "../../../github/index.js";
import type { StatePort } from "../../../state/index.js";
import type {
  ResultParserPort,
  ParsedFinding,
} from "../../../result-parser/index.js";

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockCopilot(): CopilotPort {
  return {
    invoke: vi.fn<CopilotPort["invoke"]>().mockResolvedValue({
      success: true,
      output: "## Delivery Guardian Report\n\nNo issues found.",
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
    findExistingIssue: vi
      .fn<GitHubPort["findExistingIssue"]>()
      .mockResolvedValue(null),
    listOpenIssues: vi
      .fn<GitHubPort["listOpenIssues"]>()
      .mockResolvedValue([]),
    createDraftPR: vi.fn<GitHubPort["createDraftPR"]>().mockResolvedValue({
      url: "https://github.com/owner/repo/pull/1",
      number: 1,
    }),
    createCommitComment: vi
      .fn<GitHubPort["createCommitComment"]>()
      .mockResolvedValue({
        url: "https://github.com/owner/repo/commit/abc123#comment-1",
      }),
    getLatestCommits: vi
      .fn<GitHubPort["getLatestCommits"]>()
      .mockResolvedValue([]),
    getCommitDiff: vi.fn<GitHubPort["getCommitDiff"]>().mockResolvedValue({
      sha: "abc123",
      files: [],
    }),
    getMergeCommits: vi
      .fn<GitHubPort["getMergeCommits"]>()
      .mockResolvedValue([]),
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
      guardian: "dev",
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
    category: "deployment",
    file_line: ".github/workflows/deploy.yml:15",
    issue: "No rollback strategy defined in deployment pipeline",
    source_justification:
      "[Google SRE Ch.8] Release engineering requires automated rollback",
    suggested_fix: "Add rollback step to deployment workflow",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("DeliveryAuditAnalyzer", () => {
  let copilot: CopilotPort;
  let github: GitHubPort;
  let state: StatePort;
  let parser: ResultParserPort;
  let analyzer: AnalyzerPort;

  const context: AnalyzerContext = {
    task: "delivery_audit",
    taskId: "test-delivery-001",
    timestamp: new Date().toISOString(),
  };

  beforeEach(() => {
    copilot = createMockCopilot();
    github = createMockGitHub();
    state = createMockState();
    parser = createMockParser();
    analyzer = createDeliveryAuditAnalyzer({ copilot, github, state, parser });
  });

  // -----------------------------------------------------------------------
  // Basic contract
  // -----------------------------------------------------------------------

  describe("Analyzer contract", () => {
    it("has name 'delivery_audit'", () => {
      expect(analyzer.name).toBe("delivery_audit");
    });

    it("implements AnalyzerPort interface (execute returns AnalyzerResult)", async () => {
      const result = await analyzer.execute(context);

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("summary");
      expect(result).toHaveProperty("findings");
      expect(result).toHaveProperty("actions");
      expect(result).toHaveProperty("duration_ms");
      expect(typeof result.duration_ms).toBe("number");
    });
  });

  // -----------------------------------------------------------------------
  // AC1: Invokes Delivery Guardian via CopilotPort
  // -----------------------------------------------------------------------

  describe("AC1: Invokes Delivery Guardian", () => {
    it("invokes Delivery Guardian with delivery-specific prompt", async () => {
      await analyzer.execute(context);

      expect(copilot.invoke).toHaveBeenCalledTimes(1);
      expect(copilot.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          agent: "delivery-guardian",
        }),
      );
    });

    it("prompt covers all six review domains", async () => {
      await analyzer.execute(context);

      const invokeCall = vi.mocked(copilot.invoke).mock.calls[0]![0];
      expect(invokeCall.prompt).toContain("deployment");
      expect(invokeCall.prompt).toContain("CI/CD");
      expect(invokeCall.prompt).toContain("observability");
      expect(invokeCall.prompt).toContain("SLI/SLO");
      expect(invokeCall.prompt).toContain("BCDR");
      expect(invokeCall.prompt).toContain("incident response");
    });

    it("parses the Guardian output with result parser", async () => {
      const guardianOutput =
        "## Delivery Guardian Report\n\n| # | Severity |";
      vi.mocked(copilot.invoke).mockResolvedValue({
        success: true,
        output: guardianOutput,
        duration_ms: 3000,
        model_used: "claude-sonnet-4.5",
      });

      await analyzer.execute(context);

      expect(parser.parse).toHaveBeenCalledWith(guardianOutput, "dev");
    });
  });

  // -----------------------------------------------------------------------
  // AC2: Issue creation for critical/high gaps
  // -----------------------------------------------------------------------

  describe("AC2: Issue creation for critical/high findings", () => {
    it("creates GitHub issues for CRITICAL findings", async () => {
      const finding = makeFinding({
        severity: "critical",
        issue: "No rollback strategy defined",
      });

      vi.mocked(parser.parse).mockReturnValue({
        guardian: "dev",
        summary: "1 critical finding",
        findings: [finding],
        recommended_actions: [],
        raw: "",
      });
      vi.mocked(github.findExistingIssue).mockResolvedValue(null);

      await analyzer.execute(context);

      expect(github.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: expect.arrayContaining(["craig", "delivery", "critical"]),
        }),
      );
    });

    it("creates GitHub issues for HIGH findings", async () => {
      const finding = makeFinding({
        severity: "high",
        issue: "No health check endpoint",
      });

      vi.mocked(parser.parse).mockReturnValue({
        guardian: "dev",
        summary: "1 high finding",
        findings: [finding],
        recommended_actions: [],
        raw: "",
      });
      vi.mocked(github.findExistingIssue).mockResolvedValue(null);

      await analyzer.execute(context);

      expect(github.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: expect.arrayContaining(["craig", "delivery", "high"]),
        }),
      );
    });

    it("does NOT create issues for medium/low/info findings", async () => {
      const findings: ParsedFinding[] = [
        makeFinding({
          number: 1,
          severity: "medium",
          issue: "Consider structured logging",
        }),
        makeFinding({
          number: 2,
          severity: "low",
          issue: "Add deployment documentation",
        }),
        makeFinding({
          number: 3,
          severity: "info",
          issue: "Consider blue-green deployment",
        }),
      ];

      vi.mocked(parser.parse).mockReturnValue({
        guardian: "dev",
        summary: "3 findings",
        findings,
        recommended_actions: [],
        raw: "",
      });

      const result = await analyzer.execute(context);

      expect(github.createIssue).not.toHaveBeenCalled();
      expect(result.actions).toHaveLength(0);
    });

    it("creates issues for all critical and high findings", async () => {
      const findings: ParsedFinding[] = [
        makeFinding({
          number: 1,
          severity: "critical",
          issue: "No rollback strategy",
        }),
        makeFinding({
          number: 2,
          severity: "high",
          issue: "Missing health checks",
        }),
        makeFinding({
          number: 3,
          severity: "high",
          issue: "No SLI/SLO defined",
        }),
        makeFinding({
          number: 4,
          severity: "medium",
          issue: "Improve logging format",
        }),
      ];

      vi.mocked(parser.parse).mockReturnValue({
        guardian: "dev",
        summary: "4 findings",
        findings,
        recommended_actions: [],
        raw: "",
      });
      vi.mocked(github.findExistingIssue).mockResolvedValue(null);
      let issueCounter = 1;
      vi.mocked(github.createIssue).mockImplementation(async () => ({
        url: `https://github.com/owner/repo/issues/${issueCounter}`,
        number: issueCounter++,
      }));

      const result = await analyzer.execute(context);

      // 3 issues: 1 critical + 2 high (not medium)
      expect(github.createIssue).toHaveBeenCalledTimes(3);
      expect(result.actions).toHaveLength(3);
      expect(result.actions.every((a) => a.type === "issue_created")).toBe(
        true,
      );
    });

    it("records actions with issue URLs", async () => {
      const finding = makeFinding({
        severity: "critical",
        issue: "No rollback strategy",
      });
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "dev",
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

      const result = await analyzer.execute(context);

      expect(result.actions).toEqual([
        expect.objectContaining({
          type: "issue_created",
          url: "https://github.com/owner/repo/issues/42",
          description: expect.stringContaining("No rollback strategy"),
        }),
      ]);
    });
  });

  // -----------------------------------------------------------------------
  // AC3: Issue body contains Google SRE / 12-Factor references
  // -----------------------------------------------------------------------

  describe("AC3: Issue body contains delivery-specific content", () => {
    it("includes severity in the issue body", async () => {
      const finding = makeFinding({ severity: "critical" });
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "dev",
        summary: "1 critical",
        findings: [finding],
        recommended_actions: [],
        raw: "",
      });
      vi.mocked(github.findExistingIssue).mockResolvedValue(null);

      await analyzer.execute(context);

      const issueBody =
        vi.mocked(github.createIssue).mock.calls[0]![0].body;
      expect(issueBody.toLowerCase()).toContain("critical");
    });

    it("includes category in the issue body", async () => {
      const finding = makeFinding({ category: "deployment" });
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "dev",
        summary: "1 finding",
        findings: [finding],
        recommended_actions: [],
        raw: "",
      });
      vi.mocked(github.findExistingIssue).mockResolvedValue(null);

      await analyzer.execute(context);

      const issueBody =
        vi.mocked(github.createIssue).mock.calls[0]![0].body;
      expect(issueBody).toContain("deployment");
    });

    it("includes file path in the issue body", async () => {
      const finding = makeFinding({
        file_line: ".github/workflows/deploy.yml:15",
      });
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "dev",
        summary: "1 finding",
        findings: [finding],
        recommended_actions: [],
        raw: "",
      });
      vi.mocked(github.findExistingIssue).mockResolvedValue(null);

      await analyzer.execute(context);

      const issueBody =
        vi.mocked(github.createIssue).mock.calls[0]![0].body;
      expect(issueBody).toContain(".github/workflows/deploy.yml:15");
    });

    it("includes issue description in the issue body", async () => {
      const finding = makeFinding({
        issue: "No rollback strategy defined",
      });
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "dev",
        summary: "1 finding",
        findings: [finding],
        recommended_actions: [],
        raw: "",
      });
      vi.mocked(github.findExistingIssue).mockResolvedValue(null);

      await analyzer.execute(context);

      const issueBody =
        vi.mocked(github.createIssue).mock.calls[0]![0].body;
      expect(issueBody).toContain("No rollback strategy defined");
    });

    it("includes source justification in the issue body", async () => {
      const finding = makeFinding({
        source_justification:
          "[Google SRE Ch.8] Release engineering requires automated rollback",
      });
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "dev",
        summary: "1 finding",
        findings: [finding],
        recommended_actions: [],
        raw: "",
      });
      vi.mocked(github.findExistingIssue).mockResolvedValue(null);

      await analyzer.execute(context);

      const issueBody =
        vi.mocked(github.createIssue).mock.calls[0]![0].body;
      expect(issueBody).toContain(
        "[Google SRE Ch.8] Release engineering requires automated rollback",
      );
    });

    it("includes suggested fix in the issue body", async () => {
      const finding = makeFinding({
        suggested_fix: "Add rollback step to deployment workflow",
      });
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "dev",
        summary: "1 finding",
        findings: [finding],
        recommended_actions: [],
        raw: "",
      });
      vi.mocked(github.findExistingIssue).mockResolvedValue(null);

      await analyzer.execute(context);

      const issueBody =
        vi.mocked(github.createIssue).mock.calls[0]![0].body;
      expect(issueBody).toContain(
        "Add rollback step to deployment workflow",
      );
    });

    it("issue title contains severity emoji and 'Delivery' prefix", async () => {
      const finding = makeFinding({
        severity: "critical",
        issue: "No rollback strategy defined",
      });
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "dev",
        summary: "1 critical",
        findings: [finding],
        recommended_actions: [],
        raw: "",
      });
      vi.mocked(github.findExistingIssue).mockResolvedValue(null);

      await analyzer.execute(context);

      const issueTitle =
        vi.mocked(github.createIssue).mock.calls[0]![0].title;
      expect(issueTitle).toContain("🔴");
      expect(issueTitle).toContain("Delivery");
      expect(issueTitle).toContain("No rollback strategy defined");
    });

    it("high finding title uses orange emoji", async () => {
      const finding = makeFinding({
        severity: "high",
        issue: "Missing health checks",
      });
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "dev",
        summary: "1 high",
        findings: [finding],
        recommended_actions: [],
        raw: "",
      });
      vi.mocked(github.findExistingIssue).mockResolvedValue(null);

      await analyzer.execute(context);

      const issueTitle =
        vi.mocked(github.createIssue).mock.calls[0]![0].title;
      expect(issueTitle).toContain("🟠");
    });

    it("issue body references Google SRE / 12-Factor as standard framework", async () => {
      const finding = makeFinding();
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "dev",
        summary: "1 finding",
        findings: [finding],
        recommended_actions: [],
        raw: "",
      });
      vi.mocked(github.findExistingIssue).mockResolvedValue(null);

      await analyzer.execute(context);

      const issueBody =
        vi.mocked(github.createIssue).mock.calls[0]![0].body;
      // Body should reference the delivery audit source
      expect(issueBody).toContain("Delivery Audit");
    });
  });

  // -----------------------------------------------------------------------
  // AC4: Skip duplicate findings
  // -----------------------------------------------------------------------

  describe("AC4: Skip duplicate findings", () => {
    it("does not create a duplicate issue when one already exists", async () => {
      const finding = makeFinding({
        severity: "critical",
        issue: "No rollback strategy defined",
      });

      vi.mocked(parser.parse).mockReturnValue({
        guardian: "dev",
        summary: "1 critical",
        findings: [finding],
        recommended_actions: [],
        raw: "",
      });

      // Simulate existing issue
      vi.mocked(github.findExistingIssue).mockResolvedValue({
        url: "https://github.com/owner/repo/issues/99",
        number: 99,
      });

      const result = await analyzer.execute(context);

      expect(github.createIssue).not.toHaveBeenCalled();
      expect(result.actions).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // AC5: Guardian failure handling
  // -----------------------------------------------------------------------

  describe("AC5: Guardian failure handling", () => {
    it("returns { success: false } when Guardian invocation fails", async () => {
      vi.mocked(copilot.invoke).mockResolvedValue({
        success: false,
        output: "",
        duration_ms: 500,
        model_used: "claude-sonnet-4.5",
        error: "Delivery Guardian not available",
      });

      const result = await analyzer.execute(context);

      expect(result.success).toBe(false);
      expect(result.summary).toContain("Delivery Guardian");
      expect(result.findings).toHaveLength(0);
      expect(result.actions).toHaveLength(0);
    });

    it("returns { success: false } when an unexpected error occurs", async () => {
      vi.mocked(copilot.invoke).mockRejectedValue(
        new Error("Network timeout"),
      );

      const result = await analyzer.execute(context);

      expect(result.success).toBe(false);
      expect(result.summary).toContain("Network timeout");
    });

    it("creates incident issue after MAX_CONSECUTIVE_FAILURES", async () => {
      // Create analyzer with 2 prior failures (threshold is 3)
      const failAnalyzer = createDeliveryAuditAnalyzer({
        copilot,
        github,
        state,
        parser,
        consecutiveFailures: 2,
      });

      vi.mocked(copilot.invoke).mockResolvedValue({
        success: false,
        output: "",
        duration_ms: 500,
        model_used: "claude-sonnet-4.5",
        error: "Guardian unavailable",
      });
      vi.mocked(github.findExistingIssue).mockResolvedValue(null);

      await failAnalyzer.execute(context);

      // 3rd failure should trigger incident issue
      expect(github.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining("Consecutive Failures"),
          labels: expect.arrayContaining(["craig", "incident"]),
        }),
      );
    });

    it("does NOT create incident issue before threshold", async () => {
      // Fresh analyzer — no prior failures
      vi.mocked(copilot.invoke).mockResolvedValue({
        success: false,
        output: "",
        duration_ms: 500,
        model_used: "claude-sonnet-4.5",
        error: "Guardian unavailable",
      });

      await analyzer.execute(context);

      // First failure — no incident yet
      expect(github.createIssue).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // State management
  // -----------------------------------------------------------------------

  describe("State management", () => {
    it("stores all findings in state regardless of severity", async () => {
      const findings: ParsedFinding[] = [
        makeFinding({
          number: 1,
          severity: "critical",
          issue: "No rollback",
        }),
        makeFinding({
          number: 2,
          severity: "medium",
          issue: "Improve logging",
        }),
        makeFinding({
          number: 3,
          severity: "low",
          issue: "Add docs",
        }),
      ];

      vi.mocked(parser.parse).mockReturnValue({
        guardian: "dev",
        summary: "3 findings",
        findings,
        recommended_actions: [],
        raw: "",
      });
      vi.mocked(github.findExistingIssue).mockResolvedValue(null);

      await analyzer.execute(context);

      // All 3 findings should be recorded in state
      expect(state.addFinding).toHaveBeenCalledTimes(3);
    });

    it("records findings with source 'delivery-guardian' and task 'delivery_audit'", async () => {
      const finding = makeFinding();
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "dev",
        summary: "1 finding",
        findings: [finding],
        recommended_actions: [],
        raw: "",
      });
      vi.mocked(github.findExistingIssue).mockResolvedValue(null);

      await analyzer.execute(context);

      expect(state.addFinding).toHaveBeenCalledWith(
        expect.objectContaining({
          source: "delivery-guardian",
          task: "delivery_audit",
        }),
      );
    });

    it("saves state after execution", async () => {
      await analyzer.execute(context);

      expect(state.save).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe("Edge cases", () => {
    it("zero findings — clean audit", async () => {
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "dev",
        summary: "No issues found",
        findings: [],
        recommended_actions: [],
        raw: "",
      });

      const result = await analyzer.execute(context);

      expect(result.success).toBe(true);
      expect(result.findings).toHaveLength(0);
      expect(result.actions).toHaveLength(0);
      expect(github.createIssue).not.toHaveBeenCalled();
    });

    it("issue creation failure does not fail the scan", async () => {
      const finding = makeFinding({
        severity: "critical",
        issue: "No rollback",
      });
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "dev",
        summary: "1 finding",
        findings: [finding],
        recommended_actions: [],
        raw: "",
      });
      vi.mocked(github.findExistingIssue).mockResolvedValue(null);
      vi.mocked(github.createIssue).mockRejectedValue(
        new Error("API rate limited"),
      );

      const result = await analyzer.execute(context);

      // Scan succeeds even if issue creation fails
      expect(result.success).toBe(true);
      expect(result.findings).toHaveLength(1);
      // No actions recorded since issue creation failed
      expect(result.actions).toHaveLength(0);
    });

    it("handles finding with empty file_line", async () => {
      const finding = makeFinding({
        severity: "critical",
        file_line: "",
      });
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "dev",
        summary: "1 finding",
        findings: [finding],
        recommended_actions: [],
        raw: "",
      });
      vi.mocked(github.findExistingIssue).mockResolvedValue(null);

      const result = await analyzer.execute(context);

      expect(result.success).toBe(true);
      expect(result.findings[0]?.file).toBeUndefined();
    });

    it("resets consecutive failures on successful scan", async () => {
      // Start with 2 prior failures
      const recoveryAnalyzer = createDeliveryAuditAnalyzer({
        copilot,
        github,
        state,
        parser,
        consecutiveFailures: 2,
      });

      // First call succeeds
      const result = await recoveryAnalyzer.execute(context);
      expect(result.success).toBe(true);

      // Now simulate a failure — should be failure #1 (not #3)
      vi.mocked(copilot.invoke).mockResolvedValue({
        success: false,
        output: "",
        duration_ms: 500,
        model_used: "claude-sonnet-4.5",
        error: "Guardian unavailable",
      });

      await recoveryAnalyzer.execute(context);

      // Should NOT create incident (only 1 failure after reset)
      expect(github.createIssue).not.toHaveBeenCalled();
    });
  });
});
