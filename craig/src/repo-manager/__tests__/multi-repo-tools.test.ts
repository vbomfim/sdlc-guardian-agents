/**
 * Unit tests for multi-repo MCP tool handler support.
 *
 * Tests written FIRST per TDD — verify that MCP tool handlers
 * accept an optional `repo` parameter and route to the correct
 * repo instance via RepoManager.
 *
 * @see https://github.com/vbomfim/sdlc-guardian-agents/issues/34
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createStatusHandler,
  createFindingsHandler,
  createDigestHandler,
  createRunTaskHandler,
} from "../../core/tool-handlers.js";
import type { StatePort } from "../../state/index.js";
import type { CopilotPort } from "../../copilot/index.js";
import type { RepoManagerPort } from "../repo-manager.port.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

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

function createMockCopilot(): CopilotPort {
  return {
    invoke: vi.fn().mockResolvedValue({
      success: true,
      output: "Review complete",
      duration_ms: 1500,
      model_used: "claude-sonnet-4.5",
    }),
    isAvailable: vi.fn().mockResolvedValue(true),
  };
}

function createMockRepoManager(repos: string[]): RepoManagerPort {
  const states = new Map<string, StatePort>();
  for (const repo of repos) {
    states.set(repo, createMockState());
  }

  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    getRepos: vi.fn().mockReturnValue(repos),
    getDefaultRepo: vi.fn().mockReturnValue(repos[0]),
    getState: vi.fn().mockImplementation((repo: string) => {
      const state = states.get(repo);
      if (!state) throw new Error(`Unknown repository: ${repo}`);
      return state;
    }),
    getRepoConfig: vi.fn().mockReturnValue({
      repo: repos[0],
      branch: "main",
    }),
    resolveRepo: vi.fn().mockImplementation((repo?: string) => {
      if (!repo) return repos[0]!;
      if (!repos.includes(repo)) throw new Error(`Unknown repository: ${repo}`);
      return repo;
    }),
    getAllFindings: vi.fn().mockReturnValue([]),
    getAggregatedDailyStats: vi.fn().mockReturnValue({
      merges_reviewed: 0,
      issues_created: 0,
      prs_opened: 0,
      findings_by_severity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    }),
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("MCP tools with repo parameter (#34)", () => {

  // ─── AC3: craig_findings with repo param ──────────────────────────

  describe("craig_findings with repo parameter", () => {
    it("should filter by specific repo when repo param provided", async () => {
      const repoManager = createMockRepoManager(["owner/repo-a", "owner/repo-b"]);
      const handler = createFindingsHandler(
        createMockState(), // default state (backward compat)
        repoManager,
      );

      await handler({ severity: "high", repo: "owner/repo-b" });

      expect(repoManager.resolveRepo).toHaveBeenCalledWith("owner/repo-b");
      const stateB = repoManager.getState("owner/repo-b");
      expect(stateB.getFindings).toHaveBeenCalled();
    });

    it("should use default repo when repo param omitted", async () => {
      const repoManager = createMockRepoManager(["owner/repo-a", "owner/repo-b"]);
      const handler = createFindingsHandler(
        createMockState(),
        repoManager,
      );

      await handler({ severity: "high" });

      expect(repoManager.resolveRepo).toHaveBeenCalledWith(undefined);
    });

    it("should return all repos findings when repo param is 'all'", async () => {
      const repoManager = createMockRepoManager(["owner/repo-a", "owner/repo-b"]);
      const findingsA = [
        { id: "1", severity: "high" as const, category: "security", issue: "XSS", source: "s-g", detected_at: "2024-01-01", task: "security_scan", repo: "owner/repo-a" },
      ];
      vi.mocked(repoManager.getAllFindings).mockReturnValue(findingsA);

      const handler = createFindingsHandler(
        createMockState(),
        repoManager,
      );

      const result = await handler({ repo: "all" });
      expect(repoManager.getAllFindings).toHaveBeenCalled();
      expect("findings" in result).toBe(true);
    });

    it("should work without RepoManager (single-repo backward compat)", async () => {
      const state = createMockState();
      vi.mocked(state.getFindings).mockReturnValue([]);

      const handler = createFindingsHandler(state);
      const result = await handler({ severity: "high" });

      expect("findings" in result).toBe(true);
      expect(state.getFindings).toHaveBeenCalled();
    });
  });

  // ─── craig_status with repo parameter ─────────────────────────────

  describe("craig_status with repo parameter", () => {
    it("should return status for specific repo", async () => {
      const repoManager = createMockRepoManager(["owner/repo-a", "owner/repo-b"]);
      const stateA = repoManager.getState("owner/repo-a");
      vi.mocked(stateA.get).mockImplementation((key: string) => {
        if (key === "running_tasks") return ["security_scan"];
        if (key === "last_runs") return { security_scan: "2024-01-01T00:00:00Z" };
        return [] as never;
      });

      const handler = createStatusHandler(
        createMockState(),
        repoManager,
      );

      const result = await handler({ repo: "owner/repo-a" });

      expect("running_tasks" in result).toBe(true);
      if ("running_tasks" in result) {
        expect(result.running_tasks).toEqual(["security_scan"]);
      }
    });

    it("should work without RepoManager (backward compat)", async () => {
      const state = createMockState();
      vi.mocked(state.get).mockImplementation((key: string) => {
        if (key === "running_tasks") return [];
        if (key === "last_runs") return {};
        return [] as never;
      });

      const handler = createStatusHandler(state);
      const result = await handler();

      expect("health" in result).toBe(true);
    });
  });

  // ─── craig_digest with repo aggregation ───────────────────────────

  describe("craig_digest with repo parameter", () => {
    it("should aggregate across repos when no repo specified", async () => {
      const repoManager = createMockRepoManager(["owner/repo-a", "owner/repo-b"]);
      vi.mocked(repoManager.getAggregatedDailyStats).mockReturnValue({
        merges_reviewed: 10,
        issues_created: 5,
        prs_opened: 3,
        findings_by_severity: { critical: 1, high: 2, medium: 3, low: 4, info: 0 },
      });

      const handler = createDigestHandler(
        createMockState(),
        repoManager,
      );

      const result = await handler({});
      expect("merges_reviewed" in result).toBe(true);
      if ("merges_reviewed" in result) {
        expect(result.merges_reviewed).toBe(10);
      }
    });

    it("should return single-repo digest when repo specified", async () => {
      const repoManager = createMockRepoManager(["owner/repo-a", "owner/repo-b"]);
      const stateA = repoManager.getState("owner/repo-a");
      vi.mocked(stateA.get).mockImplementation((key: string) => {
        if (key === "daily_stats") {
          return {
            merges_reviewed: 7,
            issues_created: 2,
            prs_opened: 1,
            findings_by_severity: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
          };
        }
        return [] as never;
      });

      const handler = createDigestHandler(
        createMockState(),
        repoManager,
      );

      const result = await handler({ repo: "owner/repo-a" });
      expect("merges_reviewed" in result).toBe(true);
      if ("merges_reviewed" in result) {
        expect(result.merges_reviewed).toBe(7);
      }
    });
  });

  // ─── craig_run_task with repo parameter ───────────────────────────

  describe("craig_run_task with repo parameter", () => {
    it("should run task on specified repo state", async () => {
      const repoManager = createMockRepoManager(["owner/repo-a", "owner/repo-b"]);
      const stateA = repoManager.getState("owner/repo-a");
      vi.mocked(stateA.get).mockReturnValue([]);

      const handler = createRunTaskHandler(
        createMockState(),
        createMockCopilot(),
        undefined,
        repoManager,
      );

      const result = await handler({ task: "security_scan", repo: "owner/repo-a" });
      expect("task_id" in result).toBe(true);
    });

    it("should use default repo state when no repo specified", async () => {
      const repoManager = createMockRepoManager(["owner/repo-a"]);
      const stateA = repoManager.getState("owner/repo-a");
      vi.mocked(stateA.get).mockReturnValue([]);

      const handler = createRunTaskHandler(
        createMockState(),
        createMockCopilot(),
        undefined,
        repoManager,
      );

      const result = await handler({ task: "security_scan" });
      expect("task_id" in result).toBe(true);
    });
  });
});
