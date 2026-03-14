/**
 * State component type definitions for Craig.
 *
 * Defines the shape of Craig's persistent operational state,
 * including findings, daily stats, and filter criteria.
 *
 * @module state/types
 */

/** Severity levels for findings, ordered from most to least critical. */
export type Severity = "critical" | "high" | "medium" | "low" | "info";

/**
 * A single finding discovered by a Guardian agent.
 *
 * Findings are deduplicated by `file` + `issue` combination.
 * When a duplicate is detected, the existing finding's `detected_at`
 * timestamp is updated rather than creating a new entry.
 */
export interface Finding {
  /** Unique identifier for the finding (UUID v4). */
  readonly id: string;
  /** Severity level of the finding. */
  readonly severity: Severity;
  /** Category of the finding (e.g., "security", "code-quality"). */
  readonly category: string;
  /** File path where the finding was detected (optional). */
  readonly file?: string;
  /** Description of the issue found. */
  readonly issue: string;
  /** Which Guardian agent produced this finding. */
  readonly source: string;
  /** URL of the GitHub issue created for this finding (optional). */
  readonly github_issue_url?: string;
  /** ISO 8601 timestamp when the finding was detected. */
  readonly detected_at: string;
  /** Which task discovered the finding. */
  readonly task: string;
}

/**
 * Filter criteria for querying findings.
 * All fields are optional — omitted fields match everything.
 */
export interface FindingFilter {
  /** Filter by severity level. */
  readonly severity?: Severity;
  /** Only return findings detected on or after this ISO date. */
  readonly since?: string;
  /** Only return findings from this task. */
  readonly task?: string;
}

/**
 * Aggregated daily statistics for Craig's operations.
 * Reset at the start of each day.
 */
export interface DailyStats {
  /** Number of merge commits reviewed today. */
  readonly merges_reviewed: number;
  /** Number of GitHub issues created today. */
  readonly issues_created: number;
  /** Number of draft PRs opened today. */
  readonly prs_opened: number;
  /** Count of findings grouped by severity level. */
  readonly findings_by_severity: Record<Severity, number>;
}

/**
 * The complete persistent state for Craig.
 * Serialized to and deserialized from `.craig-state.json`.
 */
export interface CraigState {
  /** Schema version for future migrations. */
  readonly version: number;
  /** SHA of the last processed merge commit, or null if none. */
  readonly last_processed_sha: string | null;
  /** Map of task name → ISO 8601 timestamp of last execution. */
  readonly last_runs: Record<string, string>;
  /** List of currently running task names. */
  readonly running_tasks: string[];
  /** All recorded findings (pruned to 90 days). */
  readonly findings: Finding[];
  /** Aggregated statistics for the current day. */
  readonly daily_stats: DailyStats;
}
