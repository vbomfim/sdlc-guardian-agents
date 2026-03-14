/**
 * RepoManagerPort — Public interface for multi-repo orchestration.
 *
 * All consumers depend on this port, never on the implementation.
 * The RepoManager coordinates per-repo state instances and provides
 * cross-repo aggregation for digest and findings queries.
 *
 * [HEXAGONAL] Inward-facing port — adapter implements concrete logic.
 * [SOLID/ISP] Consumers only see what they need: state lookup, config, aggregation.
 *
 * @module repo-manager
 * @see https://github.com/vbomfim/sdlc-guardian-agents/issues/34
 */

import type { StatePort, FindingFilter, Finding, DailyStats } from "../state/index.js";
import type { RepoEntry } from "../config/index.js";

/**
 * A finding enriched with its source repository identifier.
 * Used when aggregating findings across multiple repositories.
 */
export interface RepoFinding extends Finding {
  /** The "owner/repo" this finding belongs to. */
  readonly repo: string;
}

/**
 * Per-repo instance managed by RepoManager.
 * Each repo has its own state and config.
 */
export interface RepoInstance {
  /** Repository identifier ("owner/repo"). */
  readonly repo: string;
  /** Per-repo config (branch, schedule, capabilities overrides). */
  readonly config: RepoEntry;
  /** Per-repo state port instance. */
  readonly state: StatePort;
}

/**
 * Port for multi-repository orchestration.
 *
 * Manages per-repo state instances, provides repo routing,
 * and aggregates data across all monitored repositories.
 */
export interface RepoManagerPort {
  /**
   * Initialize all repo instances — loads state for each repo.
   * Must be called before any other method.
   */
  initialize(): Promise<void>;

  /** Get list of all configured repo identifiers ("owner/repo"). */
  getRepos(): string[];

  /** Get the default repo identifier (first in the list). */
  getDefaultRepo(): string;

  /**
   * Get the state port for a specific repo.
   * @throws {Error} If the repo is not configured.
   */
  getState(repo: string): StatePort;

  /**
   * Get the per-repo config for a specific repo.
   * @throws {Error} If the repo is not configured.
   */
  getRepoConfig(repo: string): RepoEntry;

  /**
   * Resolve an optional repo parameter to a concrete repo identifier.
   * - If undefined, returns the default repo.
   * - If a known repo, returns it.
   * - If unknown, throws an error.
   */
  resolveRepo(repo?: string): string;

  /**
   * Get findings aggregated across all repos, enriched with repo field.
   * @param filter - Optional filter criteria (severity, since, task).
   */
  getAllFindings(filter?: FindingFilter): RepoFinding[];

  /**
   * Get daily stats aggregated (summed) across all repos.
   */
  getAggregatedDailyStats(): DailyStats;
}
