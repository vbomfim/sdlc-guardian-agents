/**
 * Auto-Develop Analyzer — Unit Tests
 *
 * Tests derived from Issue #56 acceptance criteria:
 * - AC1: Reads CRITICAL/HIGH findings from state and invokes Developer Guardian
 * - AC2: Skips medium/low/info findings
 * - AC3: Creates draft PRs on craig/fix-{findingId} branches
 * - AC4: Skips when auto_develop capability is disabled (default)
 * - AC5: Skips when draft PRs are disabled
 * - Edge: No qualifying findings → clean result, no actions
 * - Edge: Developer Guardian invocation failure → graceful error result
 * - Edge: PR creation failure → logs error, continues with next finding
 * - Edge: Duplicate branch detection → skips finding already in progress
 *
 * [TDD] Written BEFORE implementation — Red phase.
 *
 * @module analyzers/auto-develop/__tests__
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAutoDevelopAnalyzer } from "../auto-develop.analyzer.js";
import type { AnalyzerPort } from "../../analyzer.port.js";
import type { AnalyzerContext } from "../../analyzer.types.js";
import type { CopilotPort, InvokeResult } from "../../../copilot/index.js";
import type { GitPort } from "../../../git-port/index.js";
import type { StatePort, Finding } from "../../../state/index.js";
import type { ConfigPort } from "../../../config/index.js";
import type { CraigConfig } from "../../../config/config.schema.js";
import type { AutoDevelopDeps } from "../auto-develop.analyzer.js";
import type { GitOpsPort } from "../../auto-fix/auto-fix.ports.js";

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockCopilot(): CopilotPort {
  return {
    invoke: vi.fn<CopilotPort["invoke"]>().mockResolvedValue({
      success: true,
      output: [
        "## Developer Guardian — Implementation Complete",
        "",
        "### What was implemented",
        "Fixed SQL injection in src/db.py",
        "",
        "### Files changed",
        "| File | Change |",
        "|------|--------|",
        "| src/db.py | Used parameterized queries |",
        "",
        "### Tests",
        "- [2] unit tests written (2 tests, all passing)",
      ].join("\n"),
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
      auto_develop: true,
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
  task: "auto_develop",
  taskId: "test-auto-develop-001",
  timestamp: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("AutoDevelopAnalyzer", () => {
  let copilot: CopilotPort;
  let git: GitPort;
  let state: StatePort;
  let config: ConfigPort;
  let gitOps: GitOpsPort;
  let analyzer: AnalyzerPort;

  beforeEach(() => {
    copilot = createMockCopilot();
    git = createMockGit();
    state = createMockState([]);
    config = createMockConfig();
    gitOps = createMockGitOps();

    analyzer = createAutoDevelopAnalyzer({ copilot, git, state, config, gitOps });
  });

  // -----------------------------------------------------------------------
  // Analyzer identity
  // -----------------------------------------------------------------------

  it("has the correct name", () => {
    expect(analyzer.name).toBe("auto_develop");
  });

  // -----------------------------------------------------------------------
  // AC4: Disabled by config → skip
  // -----------------------------------------------------------------------

  describe("when auto_develop capability is disabled", () => {
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
        },
      });
      analyzer = createAutoDevelopAnalyzer({ copilot, git, state, config, gitOps });
    });

    it("returns success with skip message", async () => {
      const result = await analyzer.execute(CONTEXT);

      expect(result.success).toBe(true);
      expect(result.summary).toContain("disabled");
      expect(result.findings).toHaveLength(0);
      expect(result.actions).toHaveLength(0);
    });

    it("does not invoke Developer Guardian", async () => {
      await analyzer.execute(CONTEXT);
      expect(copilot.invoke).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // AC5: Draft PRs disabled → skip
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
      analyzer = createAutoDevelopAnalyzer({ copilot, git, state, config, gitOps });
    });

    it("returns success with skip message", async () => {
      const result = await analyzer.execute(CONTEXT);

      expect(result.success).toBe(true);
      expect(result.summary).toContain("draft PRs disabled");
      expect(copilot.invoke).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Edge: No qualifying findings
  // -----------------------------------------------------------------------

  describe("when there are no critical/high findings", () => {
    beforeEach(() => {
      state = createMockState([]);
      analyzer = createAutoDevelopAnalyzer({ copilot, git, state, config, gitOps });
    });

    it("returns success with no actions", async () => {
      const result = await analyzer.execute(CONTEXT);

      expect(result.success).toBe(true);
      expect(result.summary).toContain("no qualifying findings");
      expect(result.actions).toHaveLength(0);
    });

    it("does not invoke Developer Guardian", async () => {
      await analyzer.execute(CONTEXT);
      expect(copilot.invoke).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // AC2: Only processes CRITICAL/HIGH findings
  // -----------------------------------------------------------------------

  describe("severity filtering", () => {
    it("processes critical findings", async () => {
      const criticalFinding = makeFinding({ severity: "critical" });
      state = createMockState([criticalFinding]);
      analyzer = createAutoDevelopAnalyzer({ copilot, git, state, config, gitOps });

      const result = await analyzer.execute(CONTEXT);

      expect(result.success).toBe(true);
      expect(copilot.invoke).toHaveBeenCalledTimes(1);
    });

    it("processes high findings", async () => {
      const highFinding = makeFinding({ severity: "high", id: "finding-high" });
      state = createMockState([highFinding]);
      analyzer = createAutoDevelopAnalyzer({ copilot, git, state, config, gitOps });

      const result = await analyzer.execute(CONTEXT);

      expect(result.success).toBe(true);
      expect(copilot.invoke).toHaveBeenCalledTimes(1);
    });

    it("skips medium findings", async () => {
      const mediumFinding = makeFinding({ severity: "medium", id: "finding-med" });
      state = createMockState([mediumFinding]);
      analyzer = createAutoDevelopAnalyzer({ copilot, git, state, config, gitOps });

      const result = await analyzer.execute(CONTEXT);

      expect(copilot.invoke).not.toHaveBeenCalled();
      expect(result.summary).toContain("no qualifying findings");
    });

    it("skips low findings", async () => {
      const lowFinding = makeFinding({ severity: "low", id: "finding-low" });
      state = createMockState([lowFinding]);
      analyzer = createAutoDevelopAnalyzer({ copilot, git, state, config, gitOps });

      const result = await analyzer.execute(CONTEXT);

      expect(copilot.invoke).not.toHaveBeenCalled();
    });

    it("skips info findings", async () => {
      const infoFinding = makeFinding({ severity: "info", id: "finding-info" });
      state = createMockState([infoFinding]);
      analyzer = createAutoDevelopAnalyzer({ copilot, git, state, config, gitOps });

      const result = await analyzer.execute(CONTEXT);

      expect(copilot.invoke).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // AC1: Invokes Developer Guardian with finding context
  // -----------------------------------------------------------------------

  describe("Developer Guardian invocation", () => {
    const criticalFinding = makeFinding({
      id: "finding-sql-001",
      severity: "critical",
      file: "src/db.py:42",
      issue: "SQL injection vulnerability",
      category: "security",
      source: "security-guardian",
    });

    beforeEach(() => {
      state = createMockState([criticalFinding]);
      analyzer = createAutoDevelopAnalyzer({ copilot, git, state, config, gitOps });
    });

    it("invokes dev-guardian agent", async () => {
      await analyzer.execute(CONTEXT);

      expect(copilot.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          agent: "dev-guardian",
        }),
      );
    });

    it("includes finding details in the prompt", async () => {
      await analyzer.execute(CONTEXT);

      const invokeCall = vi.mocked(copilot.invoke).mock.calls[0]![0];
      expect(invokeCall.prompt).toContain("SQL injection vulnerability");
      expect(invokeCall.prompt).toContain("src/db.py:42");
      expect(invokeCall.prompt).toContain("critical");
    });
  });

  // -----------------------------------------------------------------------
  // AC3: Creates draft PRs on craig/fix-{findingId} branches
  // -----------------------------------------------------------------------

  describe("draft PR creation", () => {
    const criticalFinding = makeFinding({
      id: "finding-sql-001",
      severity: "critical",
      file: "src/db.py:42",
      issue: "SQL injection vulnerability",
    });

    beforeEach(() => {
      state = createMockState([criticalFinding]);
      analyzer = createAutoDevelopAnalyzer({ copilot, git, state, config, gitOps });
    });

    it("creates a branch with the finding id", async () => {
      await analyzer.execute(CONTEXT);

      expect(gitOps.createBranch).toHaveBeenCalledWith(
        expect.stringContaining("craig/fix-"),
      );
    });

    it("commits the Guardian output", async () => {
      await analyzer.execute(CONTEXT);

      expect(gitOps.commitAll).toHaveBeenCalledWith(
        expect.stringContaining("fix:"),
      );
    });

    it("pushes the branch", async () => {
      await analyzer.execute(CONTEXT);

      expect(gitOps.push).toHaveBeenCalledWith(
        expect.stringContaining("craig/fix-"),
      );
    });

    it("creates a draft PR", async () => {
      await analyzer.execute(CONTEXT);

      expect(git.createDraftPR).toHaveBeenCalledWith(
        expect.objectContaining({
          draft: true,
          base: "main",
          head: expect.stringContaining("craig/fix-"),
        }),
      );
    });

    it("includes finding context in PR body", async () => {
      await analyzer.execute(CONTEXT);

      const prCall = vi.mocked(git.createDraftPR).mock.calls[0]![0];
      expect(prCall.body).toContain("SQL injection vulnerability");
      expect(prCall.body).toContain("Craig");
    });

    it("records pr_opened action in result", async () => {
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
  });

  // -----------------------------------------------------------------------
  // Multiple findings — processes each independently
  // -----------------------------------------------------------------------

  describe("multiple qualifying findings", () => {
    const findings = [
      makeFinding({ id: "finding-001", severity: "critical", issue: "SQL injection" }),
      makeFinding({ id: "finding-002", severity: "high", issue: "XSS vulnerability" }),
      makeFinding({ id: "finding-003", severity: "medium", issue: "Minor style issue" }),
    ];

    beforeEach(() => {
      state = createMockState(findings);
      analyzer = createAutoDevelopAnalyzer({ copilot, git, state, config, gitOps });
    });

    it("invokes Developer Guardian once per qualifying finding", async () => {
      await analyzer.execute(CONTEXT);

      // Only critical + high = 2 invocations
      expect(copilot.invoke).toHaveBeenCalledTimes(2);
    });

    it("creates a PR for each qualifying finding", async () => {
      await analyzer.execute(CONTEXT);

      expect(git.createDraftPR).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // Edge: Developer Guardian invocation failure
  // -----------------------------------------------------------------------

  describe("when Developer Guardian invocation fails", () => {
    const criticalFinding = makeFinding({ severity: "critical" });

    beforeEach(() => {
      state = createMockState([criticalFinding]);
      vi.mocked(copilot.invoke).mockResolvedValue({
        success: false,
        output: "",
        duration_ms: 1000,
        model_used: "claude-sonnet-4.5",
        error: "Agent timeout",
      });
      analyzer = createAutoDevelopAnalyzer({ copilot, git, state, config, gitOps });
    });

    it("does not throw", async () => {
      const result = await analyzer.execute(CONTEXT);

      expect(result.success).toBe(true);
      expect(result.actions).toHaveLength(0);
    });

    it("includes failure info in summary", async () => {
      const result = await analyzer.execute(CONTEXT);

      expect(result.summary).toContain("0 fix(es) applied");
    });

    it("does not create a PR", async () => {
      await analyzer.execute(CONTEXT);

      expect(git.createDraftPR).not.toHaveBeenCalled();
    });

    it("cleans up the branch", async () => {
      await analyzer.execute(CONTEXT);

      expect(gitOps.cleanup).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Edge: No changes after Guardian invocation
  // -----------------------------------------------------------------------

  describe("when Guardian produces no file changes", () => {
    const criticalFinding = makeFinding({ severity: "critical" });

    beforeEach(() => {
      state = createMockState([criticalFinding]);
      vi.mocked(gitOps.hasChanges).mockResolvedValue(false);
      analyzer = createAutoDevelopAnalyzer({ copilot, git, state, config, gitOps });
    });

    it("cleans up the branch and skips PR", async () => {
      await analyzer.execute(CONTEXT);

      expect(gitOps.cleanup).toHaveBeenCalled();
      expect(git.createDraftPR).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Edge: PR creation failure
  // -----------------------------------------------------------------------

  describe("when PR creation fails", () => {
    const findings = [
      makeFinding({ id: "finding-001", severity: "critical", issue: "SQL injection" }),
      makeFinding({ id: "finding-002", severity: "critical", issue: "Path traversal" }),
    ];

    beforeEach(() => {
      state = createMockState(findings);

      // First PR creation fails, second succeeds
      vi.mocked(git.createDraftPR)
        .mockRejectedValueOnce(new Error("GitHub API error"))
        .mockResolvedValueOnce({
          url: "https://github.com/owner/repo/pull/43",
          number: 43,
        });

      analyzer = createAutoDevelopAnalyzer({ copilot, git, state, config, gitOps });
    });

    it("continues processing remaining findings", async () => {
      const result = await analyzer.execute(CONTEXT);

      expect(copilot.invoke).toHaveBeenCalledTimes(2);
      // At least one PR action should succeed
      expect(result.actions.some((a) => a.type === "pr_opened")).toBe(true);
    });

    it("does not throw on PR creation failure", async () => {
      const result = await analyzer.execute(CONTEXT);
      expect(result.success).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Never throws — returns error result
  // -----------------------------------------------------------------------

  describe("error handling", () => {
    it("catches unexpected errors and returns error result", async () => {
      vi.mocked(config.get).mockImplementation(() => {
        throw new Error("Config explosion");
      });
      analyzer = createAutoDevelopAnalyzer({ copilot, git, state, config, gitOps });

      const result = await analyzer.execute(CONTEXT);

      expect(result.success).toBe(false);
      expect(result.summary).toContain("Config explosion");
    });
  });

  // -----------------------------------------------------------------------
  // State save — persists after processing
  // -----------------------------------------------------------------------

  describe("state persistence", () => {
    it("saves state after processing findings", async () => {
      state = createMockState([makeFinding({ severity: "critical" })]);
      analyzer = createAutoDevelopAnalyzer({ copilot, git, state, config, gitOps });

      await analyzer.execute(CONTEXT);

      expect(state.save).toHaveBeenCalled();
    });
  });
});
