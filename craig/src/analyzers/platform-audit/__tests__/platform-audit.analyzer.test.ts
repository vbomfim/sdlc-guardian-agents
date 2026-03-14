/**
 * Platform Audit Analyzer — Unit Tests
 *
 * Tests derived from Issue #57 acceptance criteria:
 * - AC1: Invokes Platform Guardian via CopilotPort when K8s manifests change
 * - AC2: Creates issues for CRITICAL/HIGH findings with CIS Benchmark refs
 * - AC3: Issue body contains all finding details
 * - AC4: Deduplicates issues (no duplicate creation)
 * - AC5: Handles Guardian failure gracefully
 * - Edge: No K8s files → skip (no invocation)
 * - Edge: Zero findings → clean audit, no issues
 * - Edge: Consecutive failures → incident issue
 *
 * [TDD] Written BEFORE implementation — Red phase.
 *
 * @module analyzers/platform-audit/__tests__
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPlatformAuditAnalyzer } from "../platform-audit.analyzer.js";
import type { AnalyzerPort } from "../../analyzer.port.js";
import type { AnalyzerContext } from "../../analyzer.types.js";
import type { CopilotPort, InvokeResult } from "../../../copilot/index.js";
import type { GitPort } from "../../../git-port/git.port.js";
import type { StatePort } from "../../../state/index.js";
import type { ResultParserPort, ParsedFinding } from "../../../result-parser/index.js";
import type { PlatformAuditContext } from "../platform-audit.analyzer.js";

// ---------------------------------------------------------------------------
// Mock Factories [CLEAN-CODE] Reusable across all tests
// ---------------------------------------------------------------------------

function createMockCopilot(): CopilotPort {
  return {
    invoke: vi.fn<CopilotPort["invoke"]>().mockResolvedValue({
      success: true,
      output: "## Platform Guardian Report\n\nNo issues found.",
      duration_ms: 5000,
      model_used: "claude-sonnet-4.5",
    }),
    isAvailable: vi.fn<CopilotPort["isAvailable"]>().mockResolvedValue(true),
  };
}

function createMockGit(): GitPort {
  return {
    createIssue: vi.fn<GitPort["createIssue"]>().mockResolvedValue({
      url: "https://github.com/owner/repo/issues/1",
      number: 1,
    }),
    findExistingIssue: vi.fn<GitPort["findExistingIssue"]>().mockResolvedValue(null),
    listOpenIssues: vi.fn<GitPort["listOpenIssues"]>().mockResolvedValue([]),
    createIssueComment: vi.fn<GitPort["createIssueComment"]>().mockResolvedValue({
      url: "https://github.com/owner/repo/issues/1#comment-1",
    }),
    createDraftPR: vi.fn<GitPort["createDraftPR"]>().mockResolvedValue({
      url: "https://github.com/owner/repo/pull/1",
      number: 1,
    }),
    createCommitComment: vi.fn<GitPort["createCommitComment"]>().mockResolvedValue({
      url: "https://github.com/owner/repo/commit/abc123#comment-1",
    }),
    getLatestCommits: vi.fn<GitPort["getLatestCommits"]>().mockResolvedValue([]),
    getCommitDiff: vi.fn<GitPort["getCommitDiff"]>().mockResolvedValue({
      sha: "abc123",
      files: [],
    }),
    getMergeCommits: vi.fn<GitPort["getMergeCommits"]>().mockResolvedValue([]),
    getRateLimit: vi.fn<GitPort["getRateLimit"]>().mockResolvedValue({
      remaining: 5000,
      reset: new Date(),
    }),
    listOpenPRs: vi.fn<GitPort["listOpenPRs"]>().mockResolvedValue([]),
    getPRDiff: vi.fn<GitPort["getPRDiff"]>().mockResolvedValue(""),
    postPRReview: vi.fn<GitPort["postPRReview"]>().mockResolvedValue({
      id: 1,
      url: "https://github.com/owner/repo/pull/1#pullrequestreview-1",
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
    category: "[CIS-5.2.1]",
    file_line: "k8s/deployment.yaml:15",
    issue: "Container running as root",
    source_justification: "CIS Benchmark 5.2.1 — Minimize admission of root containers",
    suggested_fix: "Set securityContext.runAsNonRoot: true",
    ...overrides,
  };
}

/** Helper: build a platform audit context with K8s file changes. */
function makeContext(overrides: Partial<PlatformAuditContext> = {}): PlatformAuditContext {
  return {
    task: "platform_audit",
    taskId: "test-platform-001",
    timestamp: new Date().toISOString(),
    changedFiles: ["k8s/deployment.yaml", "k8s/service.yaml"],
    diff: "--- a/k8s/deployment.yaml\n+++ b/k8s/deployment.yaml\n@@ -1,3 +1,5 @@\n+apiVersion: apps/v1\n+kind: Deployment",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("PlatformAuditAnalyzer", () => {
  let copilot: CopilotPort;
  let git: GitPort;
  let state: StatePort;
  let parser: ResultParserPort;
  let analyzer: AnalyzerPort;

  beforeEach(() => {
    copilot = createMockCopilot();
    git = createMockGit();
    state = createMockState();
    parser = createMockParser();
    analyzer = createPlatformAuditAnalyzer({ copilot, git, state, parser });
  });

  // -----------------------------------------------------------------------
  // Basic contract
  // -----------------------------------------------------------------------

  describe("Analyzer contract", () => {
    it("has name 'platform-audit'", () => {
      expect(analyzer.name).toBe("platform-audit");
    });

    it("implements AnalyzerPort interface (execute returns AnalyzerResult)", async () => {
      const result = await analyzer.execute(makeContext());

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("summary");
      expect(result).toHaveProperty("findings");
      expect(result).toHaveProperty("actions");
      expect(result).toHaveProperty("duration_ms");
      expect(typeof result.duration_ms).toBe("number");
    });
  });

  // -----------------------------------------------------------------------
  // AC1: Invokes Platform Guardian when K8s manifests change
  // -----------------------------------------------------------------------

  describe("AC1: Invokes Platform Guardian via CopilotPort", () => {
    it("invokes platform-guardian with K8s audit prompt", async () => {
      await analyzer.execute(makeContext());

      expect(copilot.invoke).toHaveBeenCalledTimes(1);
      expect(copilot.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          agent: "platform-guardian",
          prompt: expect.stringContaining("Kubernetes"),
        }),
      );
    });

    it("includes changed K8s files in the prompt", async () => {
      const ctx = makeContext({
        changedFiles: ["k8s/deployment.yaml", "helm/values.yaml"],
      });

      await analyzer.execute(ctx);

      const invokeCall = vi.mocked(copilot.invoke).mock.calls[0]![0];
      expect(invokeCall.prompt).toContain("k8s/deployment.yaml");
      expect(invokeCall.prompt).toContain("helm/values.yaml");
    });

    it("passes diff as context to the Guardian", async () => {
      const diff = "--- a/k8s/deployment.yaml\n+++ b/k8s/deployment.yaml\n@@ container running as root";
      const ctx = makeContext({ diff });

      await analyzer.execute(ctx);

      const invokeCall = vi.mocked(copilot.invoke).mock.calls[0]![0];
      expect(invokeCall.context).toContain(diff);
    });

    it("mentions CIS Benchmark and security tools in the prompt", async () => {
      await analyzer.execute(makeContext());

      const invokeCall = vi.mocked(copilot.invoke).mock.calls[0]![0];
      expect(invokeCall.prompt).toContain("CIS");
      expect(invokeCall.prompt).toMatch(/kube-bench|kube-score|polaris|kubeaudit|trivy/i);
    });

    it("parses Guardian output with result parser as 'security' type", async () => {
      const guardianOutput = "## Platform Guardian Report\n\n| # | Severity |";
      vi.mocked(copilot.invoke).mockResolvedValue({
        success: true,
        output: guardianOutput,
        duration_ms: 5000,
        model_used: "claude-sonnet-4.5",
      });

      await analyzer.execute(makeContext());

      expect(parser.parse).toHaveBeenCalledWith(guardianOutput, "security");
    });

    it("stores all findings in state", async () => {
      const finding = makeFinding();
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "1 critical finding",
        findings: [finding],
        recommended_actions: [],
        raw: "",
      });

      await analyzer.execute(makeContext());

      expect(state.addFinding).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "critical",
          category: "[CIS-5.2.1]",
          issue: "Container running as root",
          source: "platform-guardian",
          task: "platform_audit",
        }),
      );
    });

    it("saves state after execution", async () => {
      await analyzer.execute(makeContext());
      expect(state.save).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // AC2: Issue creation for CRITICAL/HIGH with CIS Benchmark refs
  // -----------------------------------------------------------------------

  describe("AC2: Issue creation for CRITICAL/HIGH findings", () => {
    it("creates GitHub issues for CRITICAL findings", async () => {
      const finding = makeFinding({ severity: "critical" });
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "1 critical finding",
        findings: [finding],
        recommended_actions: [],
        raw: "",
      });

      await analyzer.execute(makeContext());

      expect(git.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: expect.arrayContaining(["craig", "platform-audit", "critical"]),
        }),
      );
    });

    it("creates GitHub issues for HIGH findings", async () => {
      const finding = makeFinding({ severity: "high" });
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "1 high finding",
        findings: [finding],
        recommended_actions: [],
        raw: "",
      });

      await analyzer.execute(makeContext());

      expect(git.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: expect.arrayContaining(["craig", "platform-audit", "high"]),
        }),
      );
    });

    it("does NOT create issues for medium/low/info findings", async () => {
      const findings: ParsedFinding[] = [
        makeFinding({ number: 1, severity: "medium" }),
        makeFinding({ number: 2, severity: "low" }),
        makeFinding({ number: 3, severity: "info" }),
      ];
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "3 findings",
        findings,
        recommended_actions: [],
        raw: "",
      });

      const result = await analyzer.execute(makeContext());

      expect(git.createIssue).not.toHaveBeenCalled();
      expect(result.actions).toHaveLength(0);
    });

    it("creates issues for all CRITICAL/HIGH findings, skips others", async () => {
      const findings: ParsedFinding[] = [
        makeFinding({ number: 1, severity: "critical", issue: "Root container" }),
        makeFinding({ number: 2, severity: "high", issue: "No resource limits" }),
        makeFinding({ number: 3, severity: "medium", issue: "Missing labels" }),
        makeFinding({ number: 4, severity: "critical", issue: "Privileged container" }),
      ];
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "4 findings",
        findings,
        recommended_actions: [],
        raw: "",
      });
      let issueCounter = 1;
      vi.mocked(git.createIssue).mockImplementation(async () => ({
        url: `https://github.com/owner/repo/issues/${issueCounter}`,
        number: issueCounter++,
      }));

      const result = await analyzer.execute(makeContext());

      // 3 issues: 2 critical + 1 high
      expect(git.createIssue).toHaveBeenCalledTimes(3);
      expect(result.actions).toHaveLength(3);
      expect(result.actions.every((a) => a.type === "issue_created")).toBe(true);
    });

    it("records actions with issue URLs", async () => {
      const finding = makeFinding({ severity: "critical" });
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "1 finding",
        findings: [finding],
        recommended_actions: [],
        raw: "",
      });
      vi.mocked(git.createIssue).mockResolvedValue({
        url: "https://github.com/owner/repo/issues/42",
        number: 42,
      });

      const result = await analyzer.execute(makeContext());

      expect(result.actions).toEqual([
        expect.objectContaining({
          type: "issue_created",
          url: "https://github.com/owner/repo/issues/42",
          description: expect.stringContaining("Container running as root"),
        }),
      ]);
    });
  });

  // -----------------------------------------------------------------------
  // AC3: Issue body contains CIS Benchmark references & finding details
  // -----------------------------------------------------------------------

  describe("AC3: Issue body contains all finding details", () => {
    const finding = makeFinding({
      severity: "critical",
      category: "[CIS-5.2.1]",
      file_line: "k8s/deployment.yaml:15",
      issue: "Container running as root",
      source_justification: "CIS Benchmark 5.2.1 — Minimize admission of root containers",
      suggested_fix: "Set securityContext.runAsNonRoot: true",
    });

    beforeEach(() => {
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "1 critical",
        findings: [finding],
        recommended_actions: [],
        raw: "",
      });
    });

    it("includes severity in the issue body", async () => {
      await analyzer.execute(makeContext());
      const body = vi.mocked(git.createIssue).mock.calls[0]![0].body;
      expect(body.toLowerCase()).toContain("critical");
    });

    it("includes CIS category reference in the issue body", async () => {
      await analyzer.execute(makeContext());
      const body = vi.mocked(git.createIssue).mock.calls[0]![0].body;
      expect(body).toContain("[CIS-5.2.1]");
    });

    it("includes file/line in the issue body", async () => {
      await analyzer.execute(makeContext());
      const body = vi.mocked(git.createIssue).mock.calls[0]![0].body;
      expect(body).toContain("k8s/deployment.yaml:15");
    });

    it("includes description (issue text) in the issue body", async () => {
      await analyzer.execute(makeContext());
      const body = vi.mocked(git.createIssue).mock.calls[0]![0].body;
      expect(body).toContain("Container running as root");
    });

    it("includes CIS Benchmark justification in the issue body", async () => {
      await analyzer.execute(makeContext());
      const body = vi.mocked(git.createIssue).mock.calls[0]![0].body;
      expect(body).toContain("CIS Benchmark 5.2.1");
    });

    it("includes suggested fix in the issue body", async () => {
      await analyzer.execute(makeContext());
      const body = vi.mocked(git.createIssue).mock.calls[0]![0].body;
      expect(body).toContain("securityContext.runAsNonRoot: true");
    });

    it("issue title contains severity emoji and finding description", async () => {
      await analyzer.execute(makeContext());
      const title = vi.mocked(git.createIssue).mock.calls[0]![0].title;
      expect(title).toContain("🔴");
      expect(title).toContain("Platform");
      expect(title).toContain("Container running as root");
    });
  });

  // -----------------------------------------------------------------------
  // AC4: Deduplication
  // -----------------------------------------------------------------------

  describe("AC4: Deduplication — skip existing issues", () => {
    it("skips issue creation when an identical issue already exists", async () => {
      const finding = makeFinding({ severity: "critical", issue: "Root container" });
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "1 finding",
        findings: [finding],
        recommended_actions: [],
        raw: "",
      });
      vi.mocked(git.findExistingIssue).mockResolvedValue({
        url: "https://github.com/owner/repo/issues/99",
        number: 99,
      });

      const result = await analyzer.execute(makeContext());

      expect(git.createIssue).not.toHaveBeenCalled();
      expect(result.actions).toHaveLength(0);
    });

    it("creates issue for new finding while skipping duplicate", async () => {
      const findings: ParsedFinding[] = [
        makeFinding({ number: 1, severity: "critical", issue: "Root container" }),
        makeFinding({ number: 2, severity: "critical", issue: "Privileged mode" }),
      ];
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "2 findings",
        findings,
        recommended_actions: [],
        raw: "",
      });
      // First finding already exists, second does not
      vi.mocked(git.findExistingIssue)
        .mockResolvedValueOnce({
          url: "https://github.com/owner/repo/issues/99",
          number: 99,
        })
        .mockResolvedValueOnce(null);

      const result = await analyzer.execute(makeContext());

      expect(git.createIssue).toHaveBeenCalledTimes(1);
      expect(result.actions).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // Edge: No K8s files → skip
  // -----------------------------------------------------------------------

  describe("Edge: No K8s files in changed files", () => {
    it("skips invocation when changedFiles has no K8s files", async () => {
      const ctx = makeContext({
        changedFiles: ["src/app.ts", "package.json", "README.md"],
      });

      const result = await analyzer.execute(ctx);

      expect(copilot.invoke).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.summary).toContain("No Kubernetes");
      expect(result.findings).toHaveLength(0);
      expect(result.actions).toHaveLength(0);
    });

    it("skips invocation when changedFiles is empty", async () => {
      const ctx = makeContext({ changedFiles: [] });

      const result = await analyzer.execute(ctx);

      expect(copilot.invoke).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it("skips invocation when no changedFiles provided (falls back to basic context)", async () => {
      const ctx: AnalyzerContext = {
        task: "platform_audit",
        taskId: "test-no-files",
        timestamp: new Date().toISOString(),
      };

      const result = await analyzer.execute(ctx);

      expect(copilot.invoke).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Edge: Zero findings → clean audit
  // -----------------------------------------------------------------------

  describe("Edge: Zero findings — clean audit", () => {
    it("returns success with zero findings when Guardian finds nothing", async () => {
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "Clean scan",
        findings: [],
        recommended_actions: [],
        raw: "",
      });

      const result = await analyzer.execute(makeContext());

      expect(result.success).toBe(true);
      expect(result.findings).toHaveLength(0);
      expect(result.actions).toHaveLength(0);
      expect(git.createIssue).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Edge: Guardian failure
  // -----------------------------------------------------------------------

  describe("Edge: Guardian failure handling", () => {
    it("returns failure when Guardian invocation fails", async () => {
      vi.mocked(copilot.invoke).mockResolvedValue({
        success: false,
        output: "",
        duration_ms: 1000,
        model_used: "claude-sonnet-4.5",
        error: "Platform Guardian unavailable",
      } as InvokeResult);

      const result = await analyzer.execute(makeContext());

      expect(result.success).toBe(false);
      expect(result.summary).toContain("Platform Guardian");
      expect(result.findings).toHaveLength(0);
    });

    it("creates incident issue after 3 consecutive failures", async () => {
      const failAnalyzer = createPlatformAuditAnalyzer({
        copilot,
        git,
        state,
        parser,
        consecutiveFailures: 2, // Already 2, this will be 3rd
      });

      vi.mocked(copilot.invoke).mockResolvedValue({
        success: false,
        output: "",
        duration_ms: 1000,
        model_used: "claude-sonnet-4.5",
        error: "timeout",
      } as InvokeResult);
      vi.mocked(git.findExistingIssue).mockResolvedValue(null);

      await failAnalyzer.execute(makeContext());

      expect(git.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining("Consecutive Failures"),
          labels: expect.arrayContaining(["craig", "incident"]),
        }),
      );
    });

    it("does NOT create duplicate incident issue", async () => {
      const failAnalyzer = createPlatformAuditAnalyzer({
        copilot,
        git,
        state,
        parser,
        consecutiveFailures: 2,
      });

      vi.mocked(copilot.invoke).mockResolvedValue({
        success: false,
        output: "",
        duration_ms: 1000,
        model_used: "claude-sonnet-4.5",
        error: "timeout",
      } as InvokeResult);
      // Incident issue already exists
      vi.mocked(git.findExistingIssue).mockResolvedValue({
        url: "https://github.com/owner/repo/issues/100",
        number: 100,
      });

      await failAnalyzer.execute(makeContext());

      expect(git.createIssue).not.toHaveBeenCalled();
    });

    it("never throws — returns error result instead", async () => {
      vi.mocked(copilot.invoke).mockRejectedValue(new Error("Network error"));

      const result = await analyzer.execute(makeContext());

      expect(result.success).toBe(false);
      expect(result.summary).toContain("Network error");
    });

    it("resets consecutive failures on successful scan", async () => {
      const failAnalyzer = createPlatformAuditAnalyzer({
        copilot,
        git,
        state,
        parser,
        consecutiveFailures: 2,
      });

      // First call succeeds
      await failAnalyzer.execute(makeContext());

      // Second call fails — but counter should have reset to 0, so this is failure #1
      vi.mocked(copilot.invoke).mockResolvedValue({
        success: false,
        output: "",
        duration_ms: 1000,
        model_used: "claude-sonnet-4.5",
        error: "timeout",
      } as InvokeResult);

      await failAnalyzer.execute(makeContext());

      // Should NOT create incident (only 1 failure, not 3)
      expect(git.createIssue).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Edge: Issue creation failure doesn't fail the scan
  // -----------------------------------------------------------------------

  describe("Edge: Issue creation error tolerance", () => {
    it("continues processing even if issue creation fails", async () => {
      const findings: ParsedFinding[] = [
        makeFinding({ number: 1, severity: "critical", issue: "Root container" }),
        makeFinding({ number: 2, severity: "critical", issue: "Privileged mode" }),
      ];
      vi.mocked(parser.parse).mockReturnValue({
        guardian: "security",
        summary: "2 findings",
        findings,
        recommended_actions: [],
        raw: "",
      });
      // First issue creation fails, second succeeds
      vi.mocked(git.createIssue)
        .mockRejectedValueOnce(new Error("Rate limit"))
        .mockResolvedValueOnce({
          url: "https://github.com/owner/repo/issues/2",
          number: 2,
        });

      const result = await analyzer.execute(makeContext());

      expect(result.success).toBe(true);
      // Only 1 action (the successful one)
      expect(result.actions).toHaveLength(1);
      // Both findings still recorded
      expect(result.findings).toHaveLength(2);
    });
  });
});
