/**
 * RepoManager — Adapter implementation of RepoManagerPort.
 *
 * Orchestrates per-repo state instances for multi-repo monitoring.
 * In single-repo mode, creates one instance with the default state file path.
 * In multi-repo mode, creates separate state files per repo.
 *
 * [HEXAGONAL] Adapter — implements RepoManagerPort for filesystem-backed state.
 * [SOLID/SRP] Manages repo lifecycle only — no business logic.
 * [CLEAN-CODE] Small functions, clear names, immutable where possible.
 *
 * @module repo-manager
 * @see https://github.com/vbomfim/sdlc-guardian-agents/issues/34
 */

import type { StatePort, FindingFilter, DailyStats } from "../state/index.js";
import type { CraigConfig, RepoEntry } from "../config/index.js";
import type { RepoManagerPort, RepoInstance, RepoFinding } from "./repo-manager.port.js";

/** Factory function for creating StatePort instances with a given file path. */
export type StateFactory = (filePath: string) => StatePort;

/**
 * Default state file path for single-repo mode (backward compatible).
 * @see [AC4] — no breaking change for single-repo configs.
 */
const DEFAULT_STATE_FILE = ".craig-state.json";

/**
 * Generate a repo-qualified state file path.
 * Replaces "/" with "-" to create valid filenames.
 *
 * @example stateFilePath("owner/repo") → ".craig-state-owner-repo.json"
 */
function stateFilePath(repo: string): string {
  const sanitized = repo.replace(/\//g, "-");
  return `.craig-state-${sanitized}.json`;
}

export class RepoManager implements RepoManagerPort {
  private readonly instances = new Map<string, RepoInstance>();
  private readonly repoOrder: string[] = [];
  private readonly config: CraigConfig;
  private readonly createState: StateFactory;

  constructor(config: CraigConfig, createState: StateFactory) {
    this.config = config;
    this.createState = createState;
  }

  /**
   * Initialize all repo instances.
   *
   * In multi-repo mode (repos[] present): creates one instance per entry.
   * In single-repo mode (repo only): creates one instance with default state path.
   *
   * [AC1] Multiple repos → monitors all of them.
   * [AC4] Single repo → backward compatible (no breaking change).
   */
  async initialize(): Promise<void> {
    if (this.config.repos && this.config.repos.length > 0) {
      await this.initializeMultiRepo(this.config.repos);
    } else if (this.config.repo) {
      await this.initializeSingleRepo(this.config.repo);
    }
  }

  // ─── Public API ─────────────────────────────────────────────────

  getRepos(): string[] {
    return [...this.repoOrder];
  }

  getDefaultRepo(): string {
    return this.repoOrder[0]!;
  }

  getState(repo: string): StatePort {
    const instance = this.instances.get(repo);
    if (!instance) {
      throw new Error(`Unknown repository: ${repo}`);
    }
    return instance.state;
  }

  getRepoConfig(repo: string): RepoEntry {
    const instance = this.instances.get(repo);
    if (!instance) {
      throw new Error(`Unknown repository: ${repo}`);
    }
    return instance.config;
  }

  resolveRepo(repo?: string): string {
    if (!repo) {
      return this.getDefaultRepo();
    }
    if (!this.instances.has(repo)) {
      throw new Error(`Unknown repository: ${repo}`);
    }
    return repo;
  }

  /**
   * Aggregate findings across all repos, enriching each with its repo identifier.
   *
   * [AC3] When repo param is "all", return findings from all repos.
   * [SECURITY] State files are repo-isolated — no cross-repo data leakage.
   */
  getAllFindings(filter?: FindingFilter): RepoFinding[] {
    const allFindings: RepoFinding[] = [];

    for (const [repoName, instance] of this.instances) {
      const findings = instance.state.getFindings(filter);
      for (const finding of findings) {
        allFindings.push({ ...finding, repo: repoName });
      }
    }

    return allFindings;
  }

  /**
   * Aggregate daily stats across all repos by summing each field.
   *
   * Uses mutable accumulators internally, returns immutable DailyStats.
   * Used by craig_digest when no specific repo is requested.
   */
  getAggregatedDailyStats(): DailyStats {
    let mergesReviewed = 0;
    let issuesCreated = 0;
    let prsOpened = 0;
    const severity: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };

    for (const [, instance] of this.instances) {
      const stats = instance.state.get("daily_stats");
      mergesReviewed += stats.merges_reviewed;
      issuesCreated += stats.issues_created;
      prsOpened += stats.prs_opened;

      for (const key of Object.keys(severity)) {
        severity[key]! += stats.findings_by_severity[key as keyof typeof stats.findings_by_severity] ?? 0;
      }
    }

    return {
      merges_reviewed: mergesReviewed,
      issues_created: issuesCreated,
      prs_opened: prsOpened,
      findings_by_severity: severity as DailyStats["findings_by_severity"],
    };
  }

  // ─── Private: Initialization ────────────────────────────────────

  /**
   * Initialize multi-repo mode: one instance per repos[] entry.
   * Each gets its own state file: .craig-state-{owner}-{repo}.json
   */
  private async initializeMultiRepo(repos: readonly RepoEntry[]): Promise<void> {
    for (const entry of repos) {
      const filePath = stateFilePath(entry.repo);
      const state = this.createState(filePath);
      await state.load();

      this.instances.set(entry.repo, {
        repo: entry.repo,
        config: entry,
        state,
      });
      this.repoOrder.push(entry.repo);
    }
  }

  /**
   * Initialize single-repo mode: one instance with the default state file.
   * [AC4] Backward compatible — uses ".craig-state.json".
   */
  private async initializeSingleRepo(repo: string): Promise<void> {
    const state = this.createState(DEFAULT_STATE_FILE);
    await state.load();

    const entry: RepoEntry = {
      repo,
      branch: this.config.branch,
      schedule: this.config.schedule,
      capabilities: this.config.capabilities,
      models: this.config.models,
    };

    this.instances.set(repo, { repo, config: entry, state });
    this.repoOrder.push(repo);
  }
}
