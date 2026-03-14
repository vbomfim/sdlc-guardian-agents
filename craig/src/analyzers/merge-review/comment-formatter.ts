/**
 * Comment Formatter — Pure function to build merge review comments.
 *
 * Formats Guardian findings into a structured GitHub commit comment.
 * No side effects, no I/O — takes data in, returns markdown string out.
 *
 * [CLEAN-CODE] Pure function — easy to test, easy to rewrite.
 * [SRP] Single responsibility — formatting only.
 *
 * @module analyzers/merge-review
 */

import type { ParsedFinding } from "../../result-parser/index.js";
import type { Severity } from "../../result-parser/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Input for building a review comment. */
export interface CommentInput {
  /** Short SHA of the merge commit (first 7 chars). */
  readonly sha: string;
  /** Security Guardian findings (empty array if timed out). */
  readonly securityFindings: readonly ParsedFinding[];
  /** Code Review Guardian findings (empty array if timed out). */
  readonly codeReviewFindings: readonly ParsedFinding[];
  /** Whether Security Guardian timed out. */
  readonly securityTimedOut: boolean;
  /** Whether Code Review Guardian timed out. */
  readonly codeReviewTimedOut: boolean;
  /** Whether the diff was truncated due to size. */
  readonly diffTruncated: boolean;
}

// ---------------------------------------------------------------------------
// Severity Constants
// ---------------------------------------------------------------------------

const SEVERITY_EMOJI: Record<Severity, string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🔵",
  info: "ℹ️",
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Format a merge review comment from parsed findings.
 *
 * @param input - Structured data for the comment
 * @returns Formatted markdown string ready for GitHub
 */
export function formatReviewComment(input: CommentInput): string {
  const totalFindings =
    input.securityFindings.length + input.codeReviewFindings.length;

  if (
    totalFindings === 0 &&
    !input.securityTimedOut &&
    !input.codeReviewTimedOut
  ) {
    return formatCleanComment(input.sha, input.diffTruncated);
  }

  return formatFindingsComment(input);
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

function formatCleanComment(sha: string, diffTruncated: boolean): string {
  const lines = [
    "## 🤖 Craig — Merge Review",
    `**Commit:** ${sha}`,
    "",
    "✅ No issues found.",
  ];

  if (diffTruncated) {
    lines.push(
      "",
      "> ⚠️ Diff was truncated to 5,000 lines. Full review may require manual inspection.",
    );
  }

  return lines.join("\n");
}

function formatFindingsComment(input: CommentInput): string {
  const guardians = buildGuardianList(input);
  const lines: string[] = [
    "## 🤖 Craig — Merge Review",
    `**Commit:** ${input.sha} | **Reviewed by:** ${guardians}`,
    "",
  ];

  appendSection(
    lines,
    "Security Findings",
    input.securityFindings,
    input.securityTimedOut,
    "Security Guardian",
  );

  appendSection(
    lines,
    "Code Review Findings",
    input.codeReviewFindings,
    input.codeReviewTimedOut,
    "Code Review Guardian",
  );

  appendSummary(lines, [
    ...input.securityFindings,
    ...input.codeReviewFindings,
  ]);

  if (input.diffTruncated) {
    lines.push(
      "",
      "> ⚠️ Diff was truncated to 5,000 lines. Full review may require manual inspection.",
    );
  }

  return lines.join("\n");
}

function buildGuardianList(input: CommentInput): string {
  const guardians: string[] = [];
  if (!input.securityTimedOut || input.securityFindings.length > 0) {
    guardians.push("Security Guardian");
  }
  if (!input.codeReviewTimedOut || input.codeReviewFindings.length > 0) {
    guardians.push("Code Review Guardian");
  }
  return guardians.length > 0 ? guardians.join(", ") : "—";
}

function appendSection(
  lines: string[],
  title: string,
  findings: readonly ParsedFinding[],
  timedOut: boolean,
  guardianName: string,
): void {
  if (timedOut && findings.length === 0) {
    lines.push(
      `### ${title}`,
      `⚠️ ${guardianName} timed out — run manually with \`craig run security_scan\``,
      "",
    );
    return;
  }

  if (findings.length === 0) {
    return;
  }

  lines.push(`### ${title} (${findings.length})`);
  lines.push("| Severity | Issue | File | Fix |");
  lines.push("|----------|-------|------|-----|");

  for (const f of findings) {
    const emoji = SEVERITY_EMOJI[f.severity] ?? "❓";
    const severity = f.severity.toUpperCase();
    const file = f.file_line || "—";
    const fix = f.suggested_fix || "—";
    lines.push(`| ${emoji} ${severity} | ${f.issue} | ${file} | ${fix} |`);
  }

  lines.push("");
}

function appendSummary(
  lines: string[],
  findings: readonly ParsedFinding[],
): void {
  const counts: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  for (const f of findings) {
    counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  }

  lines.push("### Summary");
  lines.push(
    `- 🔴 ${counts.critical} critical | 🟠 ${counts.high} high | 🟡 ${counts.medium} medium | 🔵 ${counts.low} low`,
  );
}
