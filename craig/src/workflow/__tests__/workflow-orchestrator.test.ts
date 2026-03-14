/**
 * Workflow Orchestrator — Unit Tests
 *
 * Tests derived from Issue #59 acceptance criteria:
 * - AC1: Chains finding → dev fix → review → PR pipeline
 * - AC2: Only CRITICAL/HIGH findings trigger the loop (severity gate)
 * - AC3: Runs QA + Security + Code Review in parallel after dev fix
 * - AC4: Iterates on blocking findings (max 3 passes)
 * - AC5: Uses consultation model on 3rd pass
 * - AC6: Creates draft PR when all reviews pass
 * - AC7: Disabled by default (autonomous_workflow: false)
 * - AC8: Requires draft PRs enabled
 * - Edge: Dev fix fails → returns dev_fix_failed verdict
 * - Edge: No changes produced → returns no_changes_produced verdict
 * - Edge: Max passes exceeded → returns max_passes_exceeded verdict
 * - Edge: No qualifying findings → clean skip
 *
 * [TDD] Written BEFORE implementation — Red phase.
 *
 * @module workflow/__tests__
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createWorkflowOrchestrator } from "../workflow-orchestrator.js";
import type { AnalyzerPort } from "../../analyzers/analyzer.port.js";
import type { AnalyzerContext } from "../../analyzers/analyzer.types.js";
import type { CopilotPort, InvokeResult } from "../../copilot/index.js";
import type { GitPort } from "../../git-port/index.js";
import type { StatePort, Finding } from "../../state/index.js";
import type { ConfigPort } from "../../config/index.js";
import type { CraigConfig } from "../../config/config.schema.js";
import type { GitOpsPort } from "../../analyzers/auto-fix/auto-fix.ports.js";
import type { ResultParserPort, ParsedReport, GuardianType } from "../../result-parser/types.js";
import type { WorkflowOrchestratorDeps } from "../workflow.port.js";

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockCopilot(): CopilotPort {
  return {
    invoke: vi.fn<CopilotPort["invoke"]>().mockResolvedValue({
      success: true,
      output: "## Developer Guardian — Implementation Complete\n\nFixed the issue.",
      duration_ms: 3000,
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
    createIssueComment: vi.fn<GitPort["createIssueComment"]>().mockResolvedValue({
      url: "https://github.com/owner/repo/issues/1#comment-1",
    }),
    findExistingIssue: vi.fn<GitPort["findExistingIssue"]>().mockResolvedValue(null),
    listOpenIssues: vi.fn<GitPort["listOpenIssues"]>().mockResolvedValue([]),
    createDraftPR: vi.fn<GitPort["createDraftPR"]>().mockResolvedValue({
      url: "https://github.com/owner/repo/pull/42",
      number: 42,
    }),
    listOpenPRs: vi.fn<GitPort["listOpenPRs"]>().mockResolvedValue([]),
    getPRDiff: vi.fn<GitPort["getPRDiff"]>().mockResolvedValue(""),
    postPRReview: vi.fn<GitPort["postPRReview"]>().mockResolvedValue({
      id: 1,
      url: "https://github.com/owner/repo/pull/42#pullrequestreview-1",
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
  };
}

function createMockState(findings: Finding[] = []): StatePort {
  return {
    load: vi.fn<StatePort["load"]>().mockResolvedValue(undefined),
    save: vi.fn<StatePort["save"]>().mockResolvedValue(undefined),
    get: vi.fn<StatePort["get"]>().mockReturnValue([]),
    set: vi.fn<StatePort["set"]>(),
    addFinding: vi.fn<StatePort["addFinding"]>(),
    getFindings: vi.fn<StatePort["getFindings"]>().mockReturnValue(findings),
  };
}

function createMockConfig(overrides: Partial<CraigConfig> = {}): ConfigPort {
  const defaultConfig: CraigConfig = {
    repo: "owner/repo",
    branch: "main",
    provider: "github",
    schedule: {},
    capabilities: {
      merge_review: true,
      coverage_gaps: true,
      bug_detection: true,
      pattern_enforcement: true,
      po_audit: true,
      auto_fix: true,
      dependency_updates: true,
      pr_monitor: false,
      auto_develop: false,
      platform_audit: false,
      autonomous_workflow: true,
    },
    models: { default: "claude-sonnet-4.5" },
    autonomy: {
      create_issues: true,
      create_draft_prs: true,
      auto_merge: false as const,
    },
    guardians: { path: "~/.copilot/" },
    ...overrides,
  };

  return {
    load: vi.fn<ConfigPort["load"]>().mockResolvedValue(defaultConfig),
    get: vi.fn<ConfigPort["get"]>().mockReturnValue(defaultConfig),
    update: vi.fn<ConfigPort["update"]>().mockResolvedValue(defaultConfig),
    validate: vi.fn<ConfigPort["validate"]>().mockReturnValue(defaultConfig),
  };
}

function createMockGitOps(): GitOpsPort {
  return {
    createBranch: vi.fn<GitOpsPort["createBranch"]>().mockResolvedValue(undefined),
    hasChanges: vi.fn<GitOpsPort["hasChanges"]>().mockResolvedValue(true),
    getChangedFiles: vi.fn<GitOpsPort["getChangedFiles"]>().mockResolvedValue(["src/db.py"]),
    commitAll: vi.fn<GitOpsPort["commitAll"]>().mockResolvedValue("abc123"),
    push: vi.fn<GitOpsPort["push"]>().mockResolvedValue(undefined),
    cleanup: vi.fn<GitOpsPort["cleanup"]>().mockResolvedValue(undefined),
  };
}

function createMockResultParser(blockingCount = 0): ResultParserPort {
  return {
    parse: vi.fn<ResultParserPort["parse"]>().mockImplementation(
      (_markdown: string, guardianType: GuardianType): ParsedReport => ({
        guardian: guardianType,
        summary: "Review complete",
        findings: Array.from({ length: blockingCount }, (_, i) => ({
          number: i + 1,
          severity: "critical" as const,
          category: "security",
          file_line: "src/db.py:42",
          issue: `Blocking issue ${i + 1}`,
          source_justification: "OWASP-A01",
          suggested_fix: "Fix it",
        })),
        recommended_actions: [],
        raw: "",
      }),
    ),
  };
}

/** Helper: create a Finding for testing. */
function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "finding-001",
    severity: "critical",
    category: "security",
    file: "src/db.py:42",
    issue: "SQL injection vulnerability",
    source: "security-guardian",
    detected_at: new Date().toISOString(),
    task: "security_scan",
    ...overrides,
  };
}

const CONTEXT: AnalyzerContext = {
  task: "autonomous_workflow",
  taskId: "test-workflow-001",
  timestamp: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("WorkflowOrchestrator", () => {
  let copilot: CopilotPort;
  let git: GitPort;
  let state: StatePort;
  let config: ConfigPort;
  let gitOps: GitOpsPort;
  let resultParser: ResultParserPort;
  let analyzer: AnalyzerPort;

  function buildAnalyzer(deps?: Partial<WorkflowOrchestratorDeps>): AnalyzerPort {
    return createWorkflowOrchestrator({
      copilot,
      git,
      state,
      config,
      gitOps,
      resultParser,
      ...deps,
    });
  }

  beforeEach(() => {
    copilot = createMockCopilot();
    git = createMockGit();
    state = createMockState([makeFinding()]);
    config = createMockConfig();
    gitOps = createMockGitOps();
    resultParser = createMockResultParser(0); // No blocking findings = pass
    analyzer = buildAnalyzer();
  });

  // -----------------------------------------------------------------------
  // Analyzer identity
  // -----------------------------------------------------------------------

  it("has the correct name", () => {
    expect(analyzer.name).toBe("autonomous_workflow");
  });

  // -----------------------------------------------------------------------
  // AC7: Disabled by config → skip
  // -----------------------------------------------------------------------

  describe("when autonomous_workflow capability is disabled", () => {
    beforeEach(() => {
      config = createMockConfig({
        capabilities: {
          merge_review: true,
          coverage_gaps: true,
          bug_detection: true,
          pattern_enforcement: true,
          po_audit: true,
          auto_fix: true,
          dependency_updates: true,
          pr_monitor: false,
          auto_develop: false,
          platform_audit: false,
          autonomous_workflow: false,
        },
      });
      analyzer = buildAnalyzer();
    });

    it("returns success with skip message", async () => {
      const result = await analyzer.execute(CONTEXT);

      expect(result.success).toBe(true);
      expect(result.summary).toContain("disabled");
      expect(result.findings).toHaveLength(0);
      expect(result.actions).toHaveLength(0);
    });

    it("does not invoke any Guardian", async () => {
      await analyzer.execute(CONTEXT);
      expect(copilot.invoke).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // AC8: Draft PRs disabled → skip
  // -----------------------------------------------------------------------

  describe("when draft PRs are disabled", () => {
    beforeEach(() => {
      config = createMockConfig({
        autonomy: {
          create_issues: true,
          create_draft_prs: false,
          auto_merge: false as const,
        },
      });
      analyzer = buildAnalyzer();
    });

    it("returns success with skip message", async () => {
      const result = await analyzer.execute(CONTEXT);

      expect(result.success).toBe(true);
      expect(result.summary).toContain("draft PRs disabled");
      expect(copilot.invoke).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // AC2: Severity gate — only CRITICAL/HIGH
  // -----------------------------------------------------------------------

  describe("severity gate", () => {
    it("processes critical findings", async () => {
      state = createMockState([makeFinding({ severity: "critical" })]);
      analyzer = buildAnalyzer();

      const result = await analyzer.execute(CONTEXT);

      expect(result.success).toBe(true);
      expect(copilot.invoke).toHaveBeenCalled();
    });

    it("processes high findings", async () => {
      state = createMockState([makeFinding({ severity: "high", id: "finding-high" })]);
      analyzer = buildAnalyzer();

      const result = await analyzer.execute(CONTEXT);

      expect(result.success).toBe(true);
      expect(copilot.invoke).toHaveBeenCalled();
    });

    it("skips medium findings", async () => {
      state = createMockState([makeFinding({ severity: "medium", id: "finding-med" })]);
      analyzer = buildAnalyzer();

      const result = await analyzer.execute(CONTEXT);

      expect(result.summary).toContain("no qualifying findings");
      expect(copilot.invoke).not.toHaveBeenCalled();
    });

    it("skips low findings", async () => {
      state = createMockState([makeFinding({ severity: "low", id: "finding-low" })]);
      analyzer = buildAnalyzer();

      const result = await analyzer.execute(CONTEXT);

      expect(copilot.invoke).not.toHaveBeenCalled();
    });

    it("skips info findings", async () => {
      state = createMockState([makeFinding({ severity: "info", id: "finding-info" })]);
      analyzer = buildAnalyzer();

      const result = await analyzer.execute(CONTEXT);

      expect(copilot.invoke).not.toHaveBeenCalled();
    });

    it("only selects critical/high from mixed-severity findings", async () => {
      state = createMockState([
        makeFinding({ severity: "critical", id: "f-crit" }),
        makeFinding({ severity: "medium", id: "f-med" }),
        makeFinding({ severity: "low", id: "f-low" }),
      ]);
      analyzer = buildAnalyzer();

      await analyzer.execute(CONTEXT);

      // Only the critical finding should trigger dev guardian
      // (1 dev-guardian call + 3 review calls = 4 total for 1 finding)
      const devCalls = vi.mocked(copilot.invoke).mock.calls.filter(
        (call) => call[0].agent === "dev-guardian",
      );
      expect(devCalls).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // AC1: Full pipeline — finding → dev fix → review → PR
  // -----------------------------------------------------------------------

  describe("full pipeline (happy path)", () => {
    it("invokes Developer Guardian first", async () => {
      await analyzer.execute(CONTEXT);

      const firstCall = vi.mocked(copilot.invoke).mock.calls[0];
      expect(firstCall?.[0].agent).toBe("dev-guardian");
    });

    it("creates a branch before invoking Developer Guardian", async () => {
      await analyzer.execute(CONTEXT);

      expect(gitOps.createBranch).toHaveBeenCalledTimes(1);
      const branchName = vi.mocked(gitOps.createBranch).mock.calls[0]?.[0];
      expect(branchName).toMatch(/^craig\/workflow-/);
    });

    it("AC3: invokes QA, Security, and Code Review after dev fix", async () => {
      await analyzer.execute(CONTEXT);

      const agents = vi.mocked(copilot.invoke).mock.calls.map((c) => c[0].agent);
      expect(agents).toContain("dev-guardian");
      expect(agents).toContain("qa-guardian");
      expect(agents).toContain("security-guardian");
      expect(agents).toContain("code-review-guardian");
    });

    it("AC6: creates a draft PR when all reviews pass", async () => {
      await analyzer.execute(CONTEXT);

      expect(git.createDraftPR).toHaveBeenCalledTimes(1);
      const prParams = vi.mocked(git.createDraftPR).mock.calls[0]?.[0];
      expect(prParams?.draft).toBe(true);
    });

    it("commits and pushes before creating PR", async () => {
      await analyzer.execute(CONTEXT);

      expect(gitOps.commitAll).toHaveBeenCalled();
      expect(gitOps.push).toHaveBeenCalled();
    });

    it("returns pr_opened action on success", async () => {
      const result = await analyzer.execute(CONTEXT);

      expect(result.success).toBe(true);
      expect(result.actions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "pr_opened",
            url: "https://github.com/owner/repo/pull/42",
          }),
        ]),
      );
    });

    it("includes workflow summary in result", async () => {
      const result = await analyzer.execute(CONTEXT);

      expect(result.summary).toContain("1");
      expect(result.summary).toMatch(/pass|complete|PR/i);
    });
  });

  // -----------------------------------------------------------------------
  // AC4: Iteration on blocking findings (max 3 passes)
  // -----------------------------------------------------------------------

  describe("iteration loop", () => {
    it("re-invokes Developer Guardian when reviews find blocking issues", async () => {
      // First review round: blocking findings; second round: clean
      let callCount = 0;
      resultParser = {
        parse: vi.fn().mockImplementation((_md: string, gt: GuardianType) => ({
          guardian: gt,
          summary: "Review",
          findings: callCount++ < 3 // First 3 parse calls (1 per review agent) have findings
            ? [{ number: 1, severity: "high", category: "sec", file_line: "", issue: "Issue", source_justification: "", suggested_fix: "" }]
            : [],
          recommended_actions: [],
          raw: "",
        })),
      };
      analyzer = buildAnalyzer();

      await analyzer.execute(CONTEXT);

      const devCalls = vi.mocked(copilot.invoke).mock.calls.filter(
        (c) => c[0].agent === "dev-guardian",
      );
      // At least 2 dev calls (initial + 1 iteration)
      expect(devCalls.length).toBeGreaterThanOrEqual(2);
    });

    it("stops after MAX_PASSES (3) even if blocking findings remain", async () => {
      // All reviews always return blocking findings
      resultParser = createMockResultParser(2);
      analyzer = buildAnalyzer();

      const result = await analyzer.execute(CONTEXT);

      const devCalls = vi.mocked(copilot.invoke).mock.calls.filter(
        (c) => c[0].agent === "dev-guardian",
      );
      // Exactly 3 dev calls (passes 1, 2, 3)
      expect(devCalls).toHaveLength(3);
      expect(result.summary).toContain("max");
    });

    it("does not create PR when max passes exceeded", async () => {
      resultParser = createMockResultParser(2);
      analyzer = buildAnalyzer();

      await analyzer.execute(CONTEXT);

      expect(git.createDraftPR).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // AC5: Consultation pattern — different model on 3rd pass
  // -----------------------------------------------------------------------

  describe("consultation pattern (3rd pass)", () => {
    it("uses a different model on the 3rd pass", async () => {
      // Reviews always return blocking findings → forces 3 passes
      resultParser = createMockResultParser(1);
      analyzer = buildAnalyzer();

      await analyzer.execute(CONTEXT);

      const devCalls = vi.mocked(copilot.invoke).mock.calls.filter(
        (c) => c[0].agent === "dev-guardian",
      );
      expect(devCalls).toHaveLength(3);

      // 3rd dev call should use a different model than the first 2
      const thirdCallModel = devCalls[2]?.[0].model;
      const firstCallModel = devCalls[0]?.[0].model;
      expect(thirdCallModel).toBeDefined();
      expect(thirdCallModel).not.toBe(firstCallModel);
    });
  });

  // -----------------------------------------------------------------------
  // Edge: Developer Guardian fails
  // -----------------------------------------------------------------------

  describe("when Developer Guardian fails", () => {
    beforeEach(() => {
      copilot = {
        invoke: vi.fn<CopilotPort["invoke"]>().mockResolvedValue({
          success: false,
          output: "",
          duration_ms: 1000,
          model_used: "claude-sonnet-4.5",
          error: "Agent invocation failed",
        }),
        isAvailable: vi.fn<CopilotPort["isAvailable"]>().mockResolvedValue(true),
      };
      analyzer = buildAnalyzer();
    });

    it("returns success with dev_fix_failed info", async () => {
      const result = await analyzer.execute(CONTEXT);

      expect(result.success).toBe(true);
      expect(result.summary).toContain("failed");
    });

    it("does not invoke review Guardians", async () => {
      await analyzer.execute(CONTEXT);

      const reviewCalls = vi.mocked(copilot.invoke).mock.calls.filter(
        (c) => c[0].agent !== "dev-guardian",
      );
      expect(reviewCalls).toHaveLength(0);
    });

    it("cleans up the branch", async () => {
      await analyzer.execute(CONTEXT);

      expect(gitOps.cleanup).toHaveBeenCalled();
    });

    it("does not create a PR", async () => {
      await analyzer.execute(CONTEXT);

      expect(git.createDraftPR).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Edge: No changes produced
  // -----------------------------------------------------------------------

  describe("when Developer Guardian produces no changes", () => {
    beforeEach(() => {
      gitOps = createMockGitOps();
      vi.mocked(gitOps.hasChanges).mockResolvedValue(false);
      analyzer = buildAnalyzer();
    });

    it("returns success with no_changes info", async () => {
      const result = await analyzer.execute(CONTEXT);

      expect(result.success).toBe(true);
      expect(result.summary).toContain("no changes");
    });

    it("cleans up the branch", async () => {
      await analyzer.execute(CONTEXT);

      expect(gitOps.cleanup).toHaveBeenCalled();
    });

    it("does not invoke review Guardians", async () => {
      await analyzer.execute(CONTEXT);

      const reviewCalls = vi.mocked(copilot.invoke).mock.calls.filter(
        (c) => c[0].agent !== "dev-guardian",
      );
      expect(reviewCalls).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Edge: No qualifying findings
  // -----------------------------------------------------------------------

  describe("when there are no qualifying findings", () => {
    beforeEach(() => {
      state = createMockState([]);
      analyzer = buildAnalyzer();
    });

    it("returns success with skip message", async () => {
      const result = await analyzer.execute(CONTEXT);

      expect(result.success).toBe(true);
      expect(result.summary).toContain("no qualifying findings");
      expect(result.actions).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Edge: Multiple qualifying findings processed independently
  // -----------------------------------------------------------------------

  describe("multiple qualifying findings", () => {
    it("processes each finding independently", async () => {
      state = createMockState([
        makeFinding({ id: "f-1", severity: "critical" }),
        makeFinding({ id: "f-2", severity: "high" }),
      ]);
      analyzer = buildAnalyzer();

      const result = await analyzer.execute(CONTEXT);

      expect(result.success).toBe(true);
      // 2 findings × (1 dev + 3 review) = 8 invocations minimum
      expect(vi.mocked(copilot.invoke).mock.calls.length).toBeGreaterThanOrEqual(8);
      // 2 PRs created
      expect(git.createDraftPR).toHaveBeenCalledTimes(2);
    });

    it("continues processing if one finding fails", async () => {
      state = createMockState([
        makeFinding({ id: "f-1", severity: "critical" }),
        makeFinding({ id: "f-2", severity: "high" }),
      ]);

      // First dev-guardian call fails, second succeeds
      let devCallIndex = 0;
      copilot = {
        invoke: vi.fn<CopilotPort["invoke"]>().mockImplementation(async (params) => {
          if (params.agent === "dev-guardian") {
            devCallIndex++;
            if (devCallIndex === 1) {
              return {
                success: false,
                output: "",
                duration_ms: 1000,
                model_used: "claude-sonnet-4.5",
                error: "Failed",
              };
            }
          }
          return {
            success: true,
            output: "## Done\nFixed it.",
            duration_ms: 2000,
            model_used: "claude-sonnet-4.5",
          };
        }),
        isAvailable: vi.fn().mockResolvedValue(true),
      };
      analyzer = buildAnalyzer();

      const result = await analyzer.execute(CONTEXT);

      // At least 1 PR should be created (from the second finding)
      expect(git.createDraftPR).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // PR body and title
  // -----------------------------------------------------------------------

  describe("PR creation details", () => {
    it("includes finding context in PR body", async () => {
      await analyzer.execute(CONTEXT);

      const prParams = vi.mocked(git.createDraftPR).mock.calls[0]?.[0];
      expect(prParams?.body).toContain("SQL injection");
      expect(prParams?.body).toContain("SDLC");
    });

    it("uses the correct base branch from config", async () => {
      await analyzer.execute(CONTEXT);

      const prParams = vi.mocked(git.createDraftPR).mock.calls[0]?.[0];
      expect(prParams?.base).toBe("main");
    });

    it("always creates draft PRs (never non-draft)", async () => {
      await analyzer.execute(CONTEXT);

      const prParams = vi.mocked(git.createDraftPR).mock.calls[0]?.[0];
      expect(prParams?.draft).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Error handling — never throws
  // -----------------------------------------------------------------------

  describe("error handling", () => {
    it("never throws — returns success: false on unexpected errors", async () => {
      // Force an unexpected error
      vi.mocked(state.getFindings).mockImplementation(() => {
        throw new Error("State corrupted");
      });
      analyzer = buildAnalyzer();

      const result = await analyzer.execute(CONTEXT);

      expect(result.success).toBe(false);
      expect(result.summary).toContain("State corrupted");
    });

    it("saves state after processing", async () => {
      await analyzer.execute(CONTEXT);

      expect(state.save).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Review Guardian prompt context
  // -----------------------------------------------------------------------

  describe("review Guardian invocations", () => {
    it("passes the dev fix output as context to review Guardians", async () => {
      await analyzer.execute(CONTEXT);

      const reviewCalls = vi.mocked(copilot.invoke).mock.calls.filter(
        (c) => c[0].agent !== "dev-guardian",
      );

      for (const call of reviewCalls) {
        // Review Guardians should receive context about what was changed
        expect(call[0].prompt).toBeTruthy();
      }
    });
  });
});
