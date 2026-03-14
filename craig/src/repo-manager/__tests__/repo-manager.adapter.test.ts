/**
 * Unit tests for RepoManager — multi-repo orchestration component.
 *
 * Tests written FIRST per TDD — these define the expected behavior
 * for the RepoManager port that coordinates per-repo state,
 * watchers, and schedulers.
 *
 * @see https://github.com/vbomfim/sdlc-guardian-agents/issues/34
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { StatePort } from "../../state/index.js";
import type { CraigConfig } from "../../config/index.js";
import { RepoManager } from "../repo-manager.adapter.js";
import type { RepoManagerPort, RepoInstance } from "../repo-manager.port.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function createMockState(repoName?: string): StatePort {
  return {
    load: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockReturnValue([]),
    set: vi.fn(),
    addFinding: vi.fn(),
    getFindings: vi.fn().mockReturnValue([]),
  };
}

/** Factory for creating StatePort instances — injectable for testing. */
type StateFactory = (filePath: string) => StatePort;

function createMockStateFactory(): {
  factory: StateFactory;
  instances: Map<string, StatePort>;
} {
  const instances = new Map<string, StatePort>();
  const factory: StateFactory = (filePath: string) => {
    const state = createMockState();
    instances.set(filePath, state);
    return state;
  };
  return { factory, instances };
}

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const SINGLE_REPO_CONFIG: CraigConfig = {
  repo: "owner/repo-name",
  branch: "main",
  schedule: { coverage_scan: "0 8 * * *" },
  capabilities: {
    merge_review: true,
    coverage_gaps: true,
    bug_detection: true,
    pattern_enforcement: true,
    po_audit: true,
    auto_fix: true,
    dependency_updates: true,
    pr_monitor: false,
  },
  models: { default: "claude-sonnet-4.5" },
  autonomy: { create_issues: true, create_draft_prs: true, auto_merge: false as const },
  guardians: { path: "~/.copilot/" },
};

const MULTI_REPO_CONFIG: CraigConfig = {
  ...SINGLE_REPO_CONFIG,
  repo: "owner/repo-name",
  repos: [
    {
      repo: "owner/repo-a",
      branch: "main",
      schedule: { merge_monitor: "on_push" },
    },
    {
      repo: "owner/repo-b",
      branch: "develop",
      schedule: { coverage_scan: "0 10 * * *" },
      capabilities: { merge_review: false },
    },
  ],
};

const REPOS_ONLY_CONFIG: CraigConfig = {
  ...SINGLE_REPO_CONFIG,
  repo: undefined as unknown as string,
  repos: [
    { repo: "org/service-a", branch: "main" },
    { repo: "org/service-b", branch: "main" },
    { repo: "org/service-c", branch: "release" },
  ],
};

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("RepoManager (#34)", () => {
  let manager: RepoManagerPort;
  let stateFactory: ReturnType<typeof createMockStateFactory>;

  // ─── AC4: Single-repo backward compatibility ─────────────────────

  describe("single-repo mode (backward compatible)", () => {
    beforeEach(async () => {
      stateFactory = createMockStateFactory();
      manager = new RepoManager(SINGLE_REPO_CONFIG, stateFactory.factory);
      await manager.initialize();
    });

    it("should return exactly one repo", () => {
      expect(manager.getRepos()).toEqual(["owner/repo-name"]);
    });

    it("should return the single repo as default", () => {
      expect(manager.getDefaultRepo()).toBe("owner/repo-name");
    });

    it("should resolve undefined repo to the default", () => {
      expect(manager.resolveRepo(undefined)).toBe("owner/repo-name");
    });

    it("should resolve explicit repo to itself", () => {
      expect(manager.resolveRepo("owner/repo-name")).toBe("owner/repo-name");
    });

    it("should create state with standard file path", () => {
      const state = manager.getState("owner/repo-name");
      expect(state).toBeDefined();
      expect(stateFactory.instances.has(".craig-state.json")).toBe(true);
    });

    it("should load state on initialize", () => {
      const state = stateFactory.instances.get(".craig-state.json")!;
      expect(state.load).toHaveBeenCalled();
    });
  });

  // ─── AC1: Multi-repo mode ────────────────────────────────────────

  describe("multi-repo mode", () => {
    beforeEach(async () => {
      stateFactory = createMockStateFactory();
      manager = new RepoManager(MULTI_REPO_CONFIG, stateFactory.factory);
      await manager.initialize();
    });

    it("should return all configured repos", () => {
      expect(manager.getRepos()).toEqual(["owner/repo-a", "owner/repo-b"]);
    });

    it("should return first repo as default", () => {
      expect(manager.getDefaultRepo()).toBe("owner/repo-a");
    });

    it("should create separate state files per repo", () => {
      expect(
        stateFactory.instances.has(".craig-state-owner-repo-a.json"),
      ).toBe(true);
      expect(
        stateFactory.instances.has(".craig-state-owner-repo-b.json"),
      ).toBe(true);
    });

    it("should return correct state for each repo", () => {
      const stateA = manager.getState("owner/repo-a");
      const stateB = manager.getState("owner/repo-b");

      expect(stateA).toBeDefined();
      expect(stateB).toBeDefined();
      expect(stateA).not.toBe(stateB);
    });

    it("should load all states on initialize", () => {
      for (const [, state] of stateFactory.instances) {
        expect(state.load).toHaveBeenCalled();
      }
    });

    it("should resolve undefined repo to default (first)", () => {
      expect(manager.resolveRepo(undefined)).toBe("owner/repo-a");
    });

    it("should resolve explicit repo to itself", () => {
      expect(manager.resolveRepo("owner/repo-b")).toBe("owner/repo-b");
    });
  });

  // ─── AC2: Per-repo schedule config ───────────────────────────────

  describe("per-repo config", () => {
    beforeEach(async () => {
      stateFactory = createMockStateFactory();
      manager = new RepoManager(MULTI_REPO_CONFIG, stateFactory.factory);
      await manager.initialize();
    });

    it("should return per-repo schedule", () => {
      const configA = manager.getRepoConfig("owner/repo-a");
      const configB = manager.getRepoConfig("owner/repo-b");

      expect(configA.schedule).toEqual({ merge_monitor: "on_push" });
      expect(configB.schedule).toEqual({ coverage_scan: "0 10 * * *" });
    });

    it("should return per-repo branch", () => {
      const configA = manager.getRepoConfig("owner/repo-a");
      const configB = manager.getRepoConfig("owner/repo-b");

      expect(configA.branch).toBe("main");
      expect(configB.branch).toBe("develop");
    });

    it("should return per-repo capabilities override", () => {
      const configB = manager.getRepoConfig("owner/repo-b");
      expect(configB.capabilities?.merge_review).toBe(false);
    });
  });

  // ─── Error handling ──────────────────────────────────────────────

  describe("error handling", () => {
    beforeEach(async () => {
      stateFactory = createMockStateFactory();
      manager = new RepoManager(MULTI_REPO_CONFIG, stateFactory.factory);
      await manager.initialize();
    });

    it("should throw for unknown repo in getState", () => {
      expect(() => manager.getState("unknown/repo")).toThrow(
        "Unknown repository: unknown/repo",
      );
    });

    it("should throw for unknown repo in getRepoConfig", () => {
      expect(() => manager.getRepoConfig("unknown/repo")).toThrow(
        "Unknown repository: unknown/repo",
      );
    });

    it("should throw for unknown repo in resolveRepo", () => {
      expect(() => manager.resolveRepo("unknown/repo")).toThrow(
        "Unknown repository: unknown/repo",
      );
    });
  });

  // ─── State file isolation (security) ─────────────────────────────

  describe("state file isolation", () => {
    it("should use repo-qualified file paths for multi-repo", async () => {
      stateFactory = createMockStateFactory();
      manager = new RepoManager(REPOS_ONLY_CONFIG, stateFactory.factory);
      await manager.initialize();

      const paths = [...stateFactory.instances.keys()];
      expect(paths).toContain(".craig-state-org-service-a.json");
      expect(paths).toContain(".craig-state-org-service-b.json");
      expect(paths).toContain(".craig-state-org-service-c.json");
    });

    it("should not share state between repos", async () => {
      stateFactory = createMockStateFactory();
      manager = new RepoManager(MULTI_REPO_CONFIG, stateFactory.factory);
      await manager.initialize();

      const stateA = manager.getState("owner/repo-a");
      const stateB = manager.getState("owner/repo-b");

      // They should be different instances
      expect(stateA).not.toBe(stateB);
    });
  });

  // ─── getAllFindings aggregation ───────────────────────────────────

  describe("cross-repo aggregation", () => {
    it("should aggregate findings across all repos", async () => {
      stateFactory = createMockStateFactory();
      manager = new RepoManager(MULTI_REPO_CONFIG, stateFactory.factory);
      await manager.initialize();

      const stateA = manager.getState("owner/repo-a");
      const stateB = manager.getState("owner/repo-b");

      const findingsA = [
        { id: "1", severity: "high" as const, category: "security", issue: "XSS", source: "security-guardian", detected_at: "2024-01-01", task: "security_scan" },
      ];
      const findingsB = [
        { id: "2", severity: "low" as const, category: "style", issue: "naming", source: "code-review-guardian", detected_at: "2024-01-02", task: "pattern_check" },
      ];

      vi.mocked(stateA.getFindings).mockReturnValue(findingsA);
      vi.mocked(stateB.getFindings).mockReturnValue(findingsB);

      const all = manager.getAllFindings();
      expect(all).toHaveLength(2);
      expect(all).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "1", repo: "owner/repo-a" }),
        expect.objectContaining({ id: "2", repo: "owner/repo-b" }),
      ]));
    });

    it("should filter aggregated findings by severity", async () => {
      stateFactory = createMockStateFactory();
      manager = new RepoManager(MULTI_REPO_CONFIG, stateFactory.factory);
      await manager.initialize();

      const stateA = manager.getState("owner/repo-a");
      vi.mocked(stateA.getFindings).mockReturnValue([
        { id: "1", severity: "high" as const, category: "security", issue: "XSS", source: "s-g", detected_at: "2024-01-01", task: "security_scan" },
      ]);

      const all = manager.getAllFindings({ severity: "high" });
      expect(stateA.getFindings).toHaveBeenCalledWith({ severity: "high" });
    });
  });

  // ─── getAllDailyStats aggregation ─────────────────────────────────

  describe("digest aggregation", () => {
    it("should aggregate daily stats across all repos", async () => {
      stateFactory = createMockStateFactory();
      manager = new RepoManager(MULTI_REPO_CONFIG, stateFactory.factory);
      await manager.initialize();

      const stateA = manager.getState("owner/repo-a");
      const stateB = manager.getState("owner/repo-b");

      vi.mocked(stateA.get).mockImplementation((key: string) => {
        if (key === "daily_stats") {
          return {
            merges_reviewed: 3,
            issues_created: 2,
            prs_opened: 1,
            findings_by_severity: { critical: 1, high: 0, medium: 2, low: 0, info: 0 },
          };
        }
        return [] as never;
      });

      vi.mocked(stateB.get).mockImplementation((key: string) => {
        if (key === "daily_stats") {
          return {
            merges_reviewed: 5,
            issues_created: 1,
            prs_opened: 0,
            findings_by_severity: { critical: 0, high: 3, medium: 1, low: 0, info: 0 },
          };
        }
        return [] as never;
      });

      const aggregated = manager.getAggregatedDailyStats();
      expect(aggregated.merges_reviewed).toBe(8);
      expect(aggregated.issues_created).toBe(3);
      expect(aggregated.prs_opened).toBe(1);
      expect(aggregated.findings_by_severity.critical).toBe(1);
      expect(aggregated.findings_by_severity.high).toBe(3);
      expect(aggregated.findings_by_severity.medium).toBe(3);
    });
  });
});
