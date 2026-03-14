/**
 * Analyzer component — shared type definitions.
 *
 * Defines the data models for analyzer execution:
 * - AnalyzerContext: input to an analyzer (what it needs to run)
 * - AnalyzerResult: output from an analyzer (what it found + did)
 * - AnalyzerFinding: a single finding discovered during analysis
 * - ActionTaken: a side-effect performed during analysis
 *
 * [CLEAN-ARCH] These types form the contract between the analyzer
 * port and tool-handlers. No implementation details leak here.
 *
 * @module analyzers/types
 */

import type { Severity } from "../shared/severity.js";

// ---------------------------------------------------------------------------
// Analyzer Context — input to execute()
// ---------------------------------------------------------------------------

/**
 * Context provided to an analyzer when it is invoked.
 *
 * Contains everything the analyzer needs to do its work.
 * Kept minimal per [YAGNI] — add fields when analyzers need them.
 */
export interface AnalyzerContext {
  /** Which task triggered this analysis (e.g., "security_scan"). */
  readonly task: string;

  /** Unique identifier for this execution run. */
  readonly taskId: string;

  /** ISO 8601 timestamp when the analysis was triggered. */
  readonly timestamp: string;
}

// ---------------------------------------------------------------------------
// Analyzer Finding — a single issue discovered
// ---------------------------------------------------------------------------

/**
 * A finding discovered by an analyzer, before it is persisted to state.
 *
 * This is the analyzer's view of a finding. The tool-handler converts
 * it to a state Finding (adding id, detected_at, task) before persistence.
 *
 * [CLEAN-ARCH] Analyzers don't depend on state types — they produce
 * their own finding shape, and the handler maps it.
 */
export interface AnalyzerFinding {
  /** Severity level of the finding. */
  readonly severity: Severity;

  /** Category of the finding (e.g., "security", "code-quality"). */
  readonly category: string;

  /** File path where the finding was detected (optional). */
  readonly file?: string;

  /** Description of the issue found. */
  readonly issue: string;

  /** Which Guardian agent or tool produced this finding. */
  readonly source: string;

  /** Recommended fix for the issue (optional). */
  readonly suggested_fix?: string;
}

// ---------------------------------------------------------------------------
// Action Taken — a side-effect performed by the analyzer
// ---------------------------------------------------------------------------

/**
 * Describes an action the analyzer performed as a side-effect.
 *
 * Analyzers may create GitHub issues, open PRs, or add comments.
 * These are recorded for audit trail and reporting.
 */
export interface ActionTaken {
  /** Type of action performed. */
  readonly type:
    | "issue_created"
    | "pr_opened"
    | "comment_added"
    | "finding_recorded";

  /** Human-readable description of the action. */
  readonly description: string;

  /** URL of the created resource (e.g., GitHub issue URL). */
  readonly url?: string;
}

// ---------------------------------------------------------------------------
// Analyzer Result — output from execute()
// ---------------------------------------------------------------------------

/**
 * Result returned by an analyzer after execution.
 *
 * Contains findings, actions taken, and execution metadata.
 * The tool-handler processes this to update state and stats.
 */
export interface AnalyzerResult {
  /** Whether the analysis completed successfully. */
  readonly success: boolean;

  /** Human-readable summary of what was analyzed and found. */
  readonly summary: string;

  /** Findings discovered during analysis. */
  readonly findings: readonly AnalyzerFinding[];

  /** Side-effects performed during analysis. */
  readonly actions: readonly ActionTaken[];

  /** How long the analysis took, in milliseconds. */
  readonly duration_ms: number;
}
