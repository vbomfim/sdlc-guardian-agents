/**
 * Unit tests for AutoFixAnalyzer.
 *
 * Tests organized by acceptance criteria from issue #15.
 * All external dependencies are mocked — no real shell or git calls.
 *
 * @see [TDD] — Tests written first, implementation second
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AutoFixAnalyzer } from "../auto-fix.analyzer.js";
import type { ConfigPort } from "../../../config/index.js";
import type { GitHubPort } from "../../../github/index.js";
import type { CommandRunnerPort, GitOpsPort } from "../auto-fix.ports.js";
import type { AnalyzerContext } from "../../analyzer.types.js";
import type { CraigConfig } from "../../../config/index.js";

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createDefaultConfig(
  overrides: Partial<CraigConfig["capabilities"]> = {},
  autonomyOverrides: Partial<CraigConfig["autonomy"]> = {},
): ConfigPort {
  const config: CraigConfig = {
    repo: "test-owner/test-repo",
    branch: "main",
    schedule: {},
    capabilities: {
      merge_review: true,
      coverage_gaps: true,
      bug_detection: true,
      pattern_enforcement: true,
      po_audit: true,
      auto_fix: true,
      dependency_updates: true,
      ...overrides,
    },
    models: { default: "claude-sonnet-4.5" },
    autonomy: {
      create_issues: true,
      create_draft_prs: true,
      auto_merge: false as const,
      ...autonomyOverrides,
    },
    guardians: { path: "~/.copilot/" },
  };

  return {
    load: vi.fn().mockResolvedValue(config),
    get: vi.fn().mockReturnValue(config),
    update: vi.fn(),
    validate: vi.fn(),
  };
}

function createMockGitHub(): GitHubPort {
  return {
    createIssue: vi.fn(),
    findExistingIssue: vi.fn(),
    listOpenIssues: vi.fn(),
    createDraftPR: vi.fn().mockResolvedValue({
      url: "https://github.com/test-owner/test-repo/pull/42",
      number: 42,
    }),
    createCommitComment: vi.fn(),
    getLatestCommits: vi.fn(),
    getCommitDiff: vi.fn(),
    getMergeCommits: vi.fn(),
    getRateLimit: vi.fn(),
  };
}

function createMockCommandRunner(
  overrides: {
    fileExistsMap?: Record<string, boolean>;
    fixResult?: { exitCode: number; stdout: string; stderr: string };
    verifyResult?: { exitCode: number; stdout: string; stderr: string };
  } = {},
): CommandRunnerPort {
  const fileExistsMap = overrides.fileExistsMap ?? {
    "eslint.config.js": true,
  };
  const fixResult = overrides.fixResult ?? {
    exitCode: 0,
    stdout: "Fixed 3 problems",
    stderr: "",
  };
  const verifyResult = overrides.verifyResult ?? {
    exitCode: 0,
    stdout: "",
    stderr: "",
  };

  return {
    run: vi.fn().mockImplementation(
      (command: string, args: readonly string[]) => {
        const argsArray = [...args];
        const hasFixArg =
          argsArray.includes("--fix") ||
          argsArray.includes("--fix");
        if (hasFixArg) {
          return Promise.resolve(fixResult);
        }
        return Promise.resolve(verifyResult);
      },
    ),
    fileExists: vi.fn().mockImplementation((path: string) => {
      return Promise.resolve(fileExistsMap[path] ?? false);
    }),
  };
}

function createMockGitOps(
  overrides: {
    hasChanges?: boolean;
    changedFiles?: string[];
  } = {},
): GitOpsPort {
  return {
    createBranch: vi.fn().mockResolvedValue(undefined),
    hasChanges: vi
      .fn()
      .mockResolvedValue(overrides.hasChanges ?? true),
    getChangedFiles: vi
      .fn()
      .mockResolvedValue(
        overrides.changedFiles ?? ["src/index.ts", "src/utils.ts"],
      ),
    commitAll: vi.fn().mockResolvedValue("abc123def"),
    push: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue(undefined),
  };
}

const DEFAULT_CONTEXT: AnalyzerContext = {
  trigger: "schedule",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AutoFixAnalyzer", () => {
  let config: ConfigPort;
  let github: GitHubPort;
  let commandRunner: CommandRunnerPort;
  let gitOps: GitOpsPort;
  let analyzer: AutoFixAnalyzer;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T10:30:00Z"));

    config = createDefaultConfig();
    github = createMockGitHub();
    commandRunner = createMockCommandRunner();
    gitOps = createMockGitOps();
    analyzer = new AutoFixAnalyzer(config, github, gitOps, commandRunner);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Analyzer identity
  // -------------------------------------------------------------------------

  it("has name 'auto_fix'", () => {
    expect(analyzer.name).toBe("auto_fix");
  });

  // -------------------------------------------------------------------------
  // AC1: Auto-fix linting issues
  // -------------------------------------------------------------------------

  describe("AC1: Auto-fix linting issues", () => {
    it("creates branch, runs fixer, commits, pushes, and opens draft PR", async () => {
      const result = await analyzer.execute(DEFAULT_CONTEXT);

      expect(result.success).toBe(true);

      // Branch created with correct naming pattern
      expect(gitOps.createBranch).toHaveBeenCalledWith(
        "craig/fix-lint-2024-06-15",
      );

      // Fixer was run
      expect(commandRunner.run).toHaveBeenCalledWith(
        "npx",
        ["eslint", "--fix", "."],
      );

      // Changes committed
      expect(gitOps.commitAll).toHaveBeenCalledOnce();

      // Branch pushed
      expect(gitOps.push).toHaveBeenCalledWith("craig/fix-lint-2024-06-15");

      // Draft PR created
      expect(github.createDraftPR).toHaveBeenCalledOnce();
      const prCall = vi.mocked(github.createDraftPR).mock.calls[0]![0];
      expect(prCall.head).toBe("craig/fix-lint-2024-06-15");
      expect(prCall.base).toBe("main");
      expect(prCall.draft).toBe(true);
    });

    it("returns PR URL in actions", async () => {
      const result = await analyzer.execute(DEFAULT_CONTEXT);

      expect(result.actions).toHaveLength(1);
      expect(result.actions[0]).toEqual({
        type: "pr_opened",
        url: "https://github.com/test-owner/test-repo/pull/42",
        description: "Draft PR #42: auto-fix linting issues",
      });
    });

    it("verifies no new issues after fix", async () => {
      await analyzer.execute(DEFAULT_CONTEXT);

      // Verify command should be called after the fix command
      expect(commandRunner.run).toHaveBeenCalledWith(
        "npx",
        ["eslint", "."],
      );
    });

    it("includes duration_ms in result", async () => {
      vi.setSystemTime(new Date("2024-06-15T10:30:00.000Z"));

      const executePromise = analyzer.execute(DEFAULT_CONTEXT);

      // Advance time by 500ms during execution
      vi.advanceTimersByTime(500);

      const result = await executePromise;
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
      expect(typeof result.duration_ms).toBe("number");
    });
  });

  // -------------------------------------------------------------------------
  // AC2: PR description explains changes
  // -------------------------------------------------------------------------

  describe("AC2: PR description explains changes", () => {
    it("includes linter name in PR title", async () => {
      await analyzer.execute(DEFAULT_CONTEXT);

      const prCall = vi.mocked(github.createDraftPR).mock.calls[0]![0];
      expect(prCall.title).toContain("auto-fix");
      expect(prCall.title).toContain("linting");
    });

    it("includes what was fixed in PR body", async () => {
      await analyzer.execute(DEFAULT_CONTEXT);

      const prCall = vi.mocked(github.createDraftPR).mock.calls[0]![0];
      expect(prCall.body).toContain("eslint");
    });

    it("includes linter language in PR body", async () => {
      await analyzer.execute(DEFAULT_CONTEXT);

      const prCall = vi.mocked(github.createDraftPR).mock.calls[0]![0];
      expect(prCall.body).toContain("JavaScript/TypeScript");
    });

    it("includes changed files in PR body", async () => {
      await analyzer.execute(DEFAULT_CONTEXT);

      const prCall = vi.mocked(github.createDraftPR).mock.calls[0]![0];
      expect(prCall.body).toContain("src/index.ts");
      expect(prCall.body).toContain("src/utils.ts");
    });

    it("includes Craig rationale in PR body", async () => {
      await analyzer.execute(DEFAULT_CONTEXT);

      const prCall = vi.mocked(github.createDraftPR).mock.calls[0]![0];
      expect(prCall.body).toContain("Craig");
      expect(prCall.body).toContain("auto-fix");
    });

    it("includes fixer output in PR body", async () => {
      commandRunner = createMockCommandRunner({
        fileExistsMap: { "eslint.config.js": true },
        fixResult: {
          exitCode: 0,
          stdout: "Fixed 5 problems (3 fixable)",
          stderr: "",
        },
      });
      analyzer = new AutoFixAnalyzer(config, github, gitOps, commandRunner);

      await analyzer.execute(DEFAULT_CONTEXT);

      const prCall = vi.mocked(github.createDraftPR).mock.calls[0]![0];
      expect(prCall.body).toContain("Fixed 5 problems");
    });
  });

  // -------------------------------------------------------------------------
  // AC3: Disabled by config
  // -------------------------------------------------------------------------

  describe("AC3: Disabled by config", () => {
    it("skips execution when auto_fix capability is disabled", async () => {
      config = createDefaultConfig({ auto_fix: false });
      analyzer = new AutoFixAnalyzer(config, github, gitOps, commandRunner);

      const result = await analyzer.execute(DEFAULT_CONTEXT);

      expect(result.success).toBe(true);
      expect(result.actions).toHaveLength(0);
      expect(result.summary).toContain("auto-fix disabled by config");

      // No git or command operations should happen
      expect(gitOps.createBranch).not.toHaveBeenCalled();
      expect(commandRunner.run).not.toHaveBeenCalled();
      expect(github.createDraftPR).not.toHaveBeenCalled();
    });

    it("skips PR creation when create_draft_prs is disabled", async () => {
      config = createDefaultConfig({}, { create_draft_prs: false });
      analyzer = new AutoFixAnalyzer(config, github, gitOps, commandRunner);

      const result = await analyzer.execute(DEFAULT_CONTEXT);

      expect(result.success).toBe(true);
      expect(result.actions).toHaveLength(0);
      expect(result.summary).toContain("draft PRs disabled");

      expect(github.createDraftPR).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // AC4: No fixable issues
  // -------------------------------------------------------------------------

  describe("AC4: No fixable issues", () => {
    it("creates no branch or PR when no changes after fix", async () => {
      gitOps = createMockGitOps({ hasChanges: false });
      analyzer = new AutoFixAnalyzer(config, github, gitOps, commandRunner);

      const result = await analyzer.execute(DEFAULT_CONTEXT);

      expect(result.success).toBe(true);
      expect(result.actions).toHaveLength(0);
      expect(result.findings).toHaveLength(0);

      // Branch was created but then cleaned up
      expect(gitOps.createBranch).toHaveBeenCalled();
      expect(gitOps.cleanup).toHaveBeenCalled();

      // No commit, push, or PR
      expect(gitOps.commitAll).not.toHaveBeenCalled();
      expect(gitOps.push).not.toHaveBeenCalled();
      expect(github.createDraftPR).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Edge: Fix introduces new issues
  // -------------------------------------------------------------------------

  describe("Edge: Fix introduces new issues", () => {
    it("aborts PR and cleans up when verification fails", async () => {
      commandRunner = createMockCommandRunner({
        fileExistsMap: { "eslint.config.js": true },
        verifyResult: {
          exitCode: 1,
          stdout: "3 new problems found",
          stderr: "error: new-rule violation",
        },
      });
      analyzer = new AutoFixAnalyzer(config, github, gitOps, commandRunner);

      const result = await analyzer.execute(DEFAULT_CONTEXT);

      expect(result.success).toBe(false);
      expect(result.summary).toContain("verification failed");
      expect(result.actions).toHaveLength(0);

      // Branch cleaned up
      expect(gitOps.cleanup).toHaveBeenCalledWith(
        "craig/fix-lint-2024-06-15",
        "main",
      );

      // No commit, push, or PR
      expect(gitOps.commitAll).not.toHaveBeenCalled();
      expect(gitOps.push).not.toHaveBeenCalled();
      expect(github.createDraftPR).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Edge: Multiple languages
  // -------------------------------------------------------------------------

  describe("Edge: Multiple languages", () => {
    it("runs all applicable fixers and creates one combined PR", async () => {
      commandRunner = createMockCommandRunner({
        fileExistsMap: {
          "eslint.config.js": true,
          "pyproject.toml": true,
        },
      });
      analyzer = new AutoFixAnalyzer(config, github, gitOps, commandRunner);

      const result = await analyzer.execute(DEFAULT_CONTEXT);

      expect(result.success).toBe(true);
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0]!.type).toBe("pr_opened");

      // Both fixers ran
      expect(commandRunner.run).toHaveBeenCalledWith(
        "npx",
        ["eslint", "--fix", "."],
      );
      expect(commandRunner.run).toHaveBeenCalledWith(
        "ruff",
        ["check", "--fix", "."],
      );

      // PR body mentions both linters
      const prCall = vi.mocked(github.createDraftPR).mock.calls[0]![0];
      expect(prCall.body).toContain("eslint");
      expect(prCall.body).toContain("ruff");

      // Only one PR created
      expect(github.createDraftPR).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Edge: No applicable linters
  // -------------------------------------------------------------------------

  describe("Edge: No applicable linters", () => {
    it("returns success with no actions when no linters detected", async () => {
      commandRunner = createMockCommandRunner({
        fileExistsMap: {}, // No config files for any linter
      });
      analyzer = new AutoFixAnalyzer(config, github, gitOps, commandRunner);

      const result = await analyzer.execute(DEFAULT_CONTEXT);

      expect(result.success).toBe(true);
      expect(result.actions).toHaveLength(0);
      expect(result.summary).toContain("no applicable linters");

      // No operations performed
      expect(gitOps.createBranch).not.toHaveBeenCalled();
      expect(github.createDraftPR).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Edge: Fixer command fails
  // -------------------------------------------------------------------------

  describe("Edge: Fixer command fails", () => {
    it("continues with other fixers when one fails", async () => {
      const runFn = vi.fn();

      // ESLint fix fails, ruff fix succeeds
      runFn.mockImplementation(
        (command: string, args: readonly string[]) => {
          const argsArray = [...args];
          if (command === "npx" && argsArray.includes("--fix")) {
            return Promise.resolve({
              exitCode: 2,
              stdout: "",
              stderr: "eslint crashed",
            });
          }
          if (command === "ruff" && argsArray.includes("--fix")) {
            return Promise.resolve({
              exitCode: 0,
              stdout: "Fixed 2 issues",
              stderr: "",
            });
          }
          // Verify commands pass
          return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
        },
      );

      commandRunner = {
        run: runFn,
        fileExists: vi.fn().mockImplementation((path: string) => {
          const exists: Record<string, boolean> = {
            "eslint.config.js": true,
            "pyproject.toml": true,
          };
          return Promise.resolve(exists[path] ?? false);
        }),
      };

      analyzer = new AutoFixAnalyzer(config, github, gitOps, commandRunner);

      const result = await analyzer.execute(DEFAULT_CONTEXT);

      // Should still succeed — ruff worked even if eslint failed
      expect(result.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Edge: GitHub API error
  // -------------------------------------------------------------------------

  describe("Edge: Error handling", () => {
    it("returns error result when GitHub API fails", async () => {
      vi.mocked(github.createDraftPR).mockRejectedValue(
        new Error("GitHub API error (500): Internal Server Error"),
      );

      const result = await analyzer.execute(DEFAULT_CONTEXT);

      expect(result.success).toBe(false);
      expect(result.summary).toContain("GitHub API error");
    });

    it("cleans up branch when push fails", async () => {
      vi.mocked(gitOps.push).mockRejectedValue(
        new Error("push failed: permission denied"),
      );

      const result = await analyzer.execute(DEFAULT_CONTEXT);

      expect(result.success).toBe(false);
      expect(result.summary).toContain("push failed");

      // Branch should be cleaned up
      expect(gitOps.cleanup).toHaveBeenCalled();
    });

    it("never throws — always returns AnalyzerResult", async () => {
      vi.mocked(gitOps.createBranch).mockRejectedValue(
        new Error("unexpected git error"),
      );

      const result = await analyzer.execute(DEFAULT_CONTEXT);

      // Should NOT throw, should return error result
      expect(result.success).toBe(false);
      expect(result.summary).toBeDefined();
      expect(typeof result.duration_ms).toBe("number");
    });
  });

  // -------------------------------------------------------------------------
  // Commit message
  // -------------------------------------------------------------------------

  describe("Commit message", () => {
    it("includes linter name in commit message", async () => {
      await analyzer.execute(DEFAULT_CONTEXT);

      const commitCall = vi.mocked(gitOps.commitAll).mock.calls[0]![0];
      expect(commitCall).toContain("eslint");
    });

    it("uses conventional commit format", async () => {
      await analyzer.execute(DEFAULT_CONTEXT);

      const commitCall = vi.mocked(gitOps.commitAll).mock.calls[0]![0];
      expect(commitCall).toMatch(/^fix:/);
    });
  });

  // -------------------------------------------------------------------------
  // Context handling
  // -------------------------------------------------------------------------

  describe("Context handling", () => {
    it("works with all trigger types", async () => {
      for (const trigger of ["merge", "schedule", "manual"] as const) {
        const ctx: AnalyzerContext = { trigger };
        const result = await analyzer.execute(ctx);
        expect(result.success).toBeDefined();
      }
    });
  });
});

// Import afterEach at the top level for cleanup
import { afterEach } from "vitest";
