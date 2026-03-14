/**
 * Default state factory for Craig.
 *
 * Provides the empty/initial state used when no state file exists
 * or when the existing file is corrupted.
 *
 * @module state/defaults
 */

import type { CraigState } from "./types.js";

/** Current schema version. Increment on breaking state changes. */
export const CURRENT_STATE_VERSION = 1;

/** Maximum age (in days) for findings before pruning. */
export const FINDINGS_MAX_AGE_DAYS = 90;

/** Maximum time (in minutes) a task can be "running" before it's considered stale. */
export const STALE_TASK_THRESHOLD_MINUTES = 30;

/**
 * Create a fresh default state with all fields zeroed/empty.
 *
 * @returns A new CraigState with sensible defaults
 */
export function createDefaultState(): CraigState {
  return {
    version: CURRENT_STATE_VERSION,
    last_processed_sha: null,
    last_runs: {},
    running_tasks: [],
    findings: [],
    daily_stats: {
      merges_reviewed: 0,
      issues_created: 0,
      prs_opened: 0,
      findings_by_severity: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        info: 0,
      },
    },
  };
}
