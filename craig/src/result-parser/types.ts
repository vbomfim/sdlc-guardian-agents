/**
 * Result Parser Port — Interface contract for parsing Guardian agent handoff reports.
 *
 * Takes raw markdown text (Guardian handoff report) and outputs structured
 * ParsedReport objects. Pure function — no side effects, no I/O.
 *
 * @module result-parser
 */

// ---------------------------------------------------------------------------
// Guardian Types
// ---------------------------------------------------------------------------

/** Supported Guardian agent types. */
export type GuardianType = "security" | "code-review" | "qa" | "po" | "dev";

/** Severity levels used across all Guardian reports. */
export type Severity = "critical" | "high" | "medium" | "low" | "info";

// ---------------------------------------------------------------------------
// Data Models
// ---------------------------------------------------------------------------

/**
 * A single finding extracted from a Guardian report findings table.
 *
 * Maps 1:1 to a row in the Guardian findings markdown table:
 * `| # | Severity | Category | File:Line | Issue | Source & Justification | Suggested Fix |`
 */
export interface ParsedFinding {
  /** Row number from the findings table. */
  readonly number: number;

  /** Normalized severity level (lowercase enum). */
  readonly severity: Severity;

  /** Category tag, e.g. "[OWASP-A05]", "Design", "Quality". */
  readonly category: string;

  /** File and line reference, e.g. "src/db.py:42". Empty string if absent. */
  readonly file_line: string;

  /** Description of the issue found. */
  readonly issue: string;

  /** Source standard and justification for the finding. */
  readonly source_justification: string;

  /** Recommended fix for the issue. */
  readonly suggested_fix: string;
}

/**
 * A coverage gap extracted from QA Guardian reports.
 *
 * Maps to a row in the `### Coverage Gaps Found` table:
 * `| Gap | Risk | Status |`
 */
export interface CoverageGap {
  /** Description of the coverage gap. */
  readonly gap: string;

  /** Risk severity level. */
  readonly risk: Severity;

  /** Current status, e.g. "✅ Added test", "⚠️ Noted for later". */
  readonly status: string;
}

/**
 * Structured representation of a parsed Guardian handoff report.
 */
export interface ParsedReport {
  /** Which Guardian agent produced this report. */
  readonly guardian: GuardianType;

  /** Summary extracted from the `### Summary` section. */
  readonly summary: string;

  /** All findings extracted from findings tables. */
  readonly findings: ParsedFinding[];

  /** Action items from the `### Recommended Actions` section. */
  readonly recommended_actions: string[];

  /** Key-value metrics from `### Metrics` section (Code Review Guardian). */
  readonly metrics?: Record<string, string | number>;

  /** Coverage gaps from `### Coverage Gaps Found` (QA Guardian). */
  readonly coverage_gaps?: CoverageGap[];

  /** Original markdown preserved for traceability. */
  readonly raw: string;
}

// ---------------------------------------------------------------------------
// Port Interface
// ---------------------------------------------------------------------------

/**
 * Port interface for the Result Parser component.
 *
 * Consumers depend on this interface, not the implementation.
 * The implementation can be rewritten without changing consumers.
 */
export interface ResultParserPort {
  /**
   * Parse a Guardian agent handoff report from markdown into structured data.
   *
   * @param markdown - Raw markdown text of the Guardian handoff report
   * @param guardianType - Which Guardian agent produced the report
   * @returns Structured ParsedReport — never throws, returns empty findings on parse failure
   */
  parse(markdown: string, guardianType: GuardianType): ParsedReport;
}
