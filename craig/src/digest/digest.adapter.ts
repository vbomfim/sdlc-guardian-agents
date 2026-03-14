/**
 * DigestAdapter — implementation of the DigestPort interface.
 *
 * Compiles daily/weekly/monthly summaries from StatePort data and
 * publishes them as GitHub issues via GitHubPort. Does NOT generate
 * new findings — only aggregates and formats existing data.
 *
 * [HEXAGONAL] Adapter implements DigestPort using StatePort + GitHubPort.
 * [CLEAN-CODE] Small functions, clear names, single responsibility.
 * [SOLID/SRP] Generate and publish are separate concerns, each < 20 lines.
 *
 * @module digest/digest-adapter
 */

import type { DigestPort } from "./digest.port.js";
import type { DigestPeriod, DigestReport, DigestPublishResult } from "./digest.types.js";
import { DigestPublishError } from "./digest.errors.js";
import type { StatePort, Finding, Severity } from "../state/index.js";
import type { GitHubPort } from "../github/index.js";

/** Digest labels applied to all digest issues. */
const DIGEST_LABELS: string[] = ["craig", "digest"];

/** Maximum number of top findings to include. */
const MAX_TOP_FINDINGS = 5;

/** Severity ordering: lower index = higher priority. */
const SEVERITY_ORDER: readonly Severity[] = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
] as const;

/** Emoji indicators for each severity level. */
const SEVERITY_EMOJI: Readonly<Record<Severity, string>> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🔵",
  info: "⚪",
};

/**
 * DigestAdapter — reads from StatePort and publishes via GitHubPort.
 *
 * Factory pattern: instantiate with dependencies, call generate/publish.
 */
export class DigestAdapter implements DigestPort {
  private readonly state: StatePort;
  private readonly github: GitHubPort;

  constructor(state: StatePort, github: GitHubPort) {
    this.state = state;
    this.github = github;
  }

  /**
   * Generate a digest report for the given period.
   *
   * Reads daily_stats and findings from StatePort. For "today",
   * uses current daily_stats directly. For "week" and "month",
   * filters findings by date range.
   *
   * [CLEAN-CODE] If no data exists, returns empty digest — never errors.
   */
  async generate(period: DigestPeriod): Promise<DigestReport> {
    const dailyStats = this.state.get("daily_stats");
    const lastRuns = this.state.get("last_runs");
    const { start, end } = computePeriodRange(period);

    const findings = this.state.getFindings({ since: start });
    const topFindings = selectTopFindings(findings, MAX_TOP_FINDINGS);
    const guardianInvocations = countInvocations(lastRuns);

    return {
      period,
      period_start: start,
      period_end: end,
      merges_reviewed: dailyStats.merges_reviewed,
      issues_created: dailyStats.issues_created,
      prs_opened: dailyStats.prs_opened,
      findings_by_severity: { ...dailyStats.findings_by_severity },
      top_findings: topFindings,
      guardian_invocations: guardianInvocations,
      failures: [],
    };
  }

  /**
   * Publish a digest report as a GitHub issue.
   *
   * Searches for an existing issue matching the title. If found,
   * adds a comment; otherwise creates a new issue. Never creates
   * duplicate issues for the same period.
   *
   * [CLEAN-CODE] Fail-fast on errors, wrap in DigestPublishError.
   */
  async publish(report: DigestReport): Promise<DigestPublishResult> {
    const title = buildTitle(report);
    const body = renderMarkdown(report);

    try {
      const existing = await this.github.findExistingIssue(title);

      if (existing) {
        await this.github.createIssueComment(existing.number, body);
        return { url: existing.url };
      }

      const created = await this.github.createIssue({
        title,
        body,
        labels: DIGEST_LABELS,
      });
      return { url: created.url };
    } catch (error: unknown) {
      throw new DigestPublishError(
        error instanceof Error ? error.message : String(error),
        { cause: error },
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Pure helper functions (no side effects, easily testable)
// ---------------------------------------------------------------------------

/**
 * Compute the start and end dates for a period.
 *
 * - "today" → same date for start/end
 * - "week"  → Monday to Sunday of current ISO week
 * - "month" → 1st to last day of current month
 */
function computePeriodRange(period: DigestPeriod): {
  start: string;
  end: string;
} {
  const now = new Date();

  if (period === "today") {
    const date = formatDateUTC(now);
    return { start: date, end: date };
  }

  if (period === "week") {
    return computeWeekRange(now);
  }

  return computeMonthRange(now);
}

/** Compute ISO week range (Monday–Sunday). */
function computeWeekRange(now: Date): { start: string; end: string } {
  const day = now.getUTCDay();
  // ISO: Monday = 1, Sunday = 0. Shift so Monday = 0.
  const daysSinceMonday = day === 0 ? 6 : day - 1;

  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - daysSinceMonday);

  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  return {
    start: formatDateUTC(monday),
    end: formatDateUTC(sunday),
  };
}

/** Compute calendar month range (1st to last day). */
function computeMonthRange(now: Date): { start: string; end: string } {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  );

  return {
    start: formatDateUTC(start),
    end: formatDateUTC(end),
  };
}

/** Format a Date as "YYYY-MM-DD" in UTC. */
function formatDateUTC(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Select top N findings sorted by severity (critical first).
 *
 * [CLEAN-CODE] Pure function, no mutation, returns a new array.
 */
function selectTopFindings(
  findings: readonly Finding[],
  limit: number,
): Finding[] {
  return [...findings]
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .slice(0, limit);
}

/** Return numeric rank for severity (lower = more critical). */
function severityRank(severity: Severity): number {
  const index = SEVERITY_ORDER.indexOf(severity);
  return index === -1 ? SEVERITY_ORDER.length : index;
}

/**
 * Count guardian invocations from last_runs.
 *
 * Extracts the base task name (strips trailing _N suffixes)
 * and counts occurrences.
 */
function countInvocations(
  lastRuns: Record<string, string>,
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const taskKey of Object.keys(lastRuns)) {
    // Strip trailing _N (e.g., "merge_review_2" → "merge_review")
    const baseName = taskKey.replace(/_\d+$/, "");
    counts[baseName] = (counts[baseName] ?? 0) + 1;
  }

  return counts;
}

/**
 * Build the GitHub issue title for a digest report.
 *
 * Format examples:
 * - "📊 Craig Daily Digest — 2025-07-11"
 * - "📊 Craig Weekly Digest — Week 28, 2025"
 * - "📊 Craig Monthly Digest — July 2025"
 */
function buildTitle(report: DigestReport): string {
  if (report.period === "today") {
    return `📊 Craig Daily Digest — ${report.period_end}`;
  }

  if (report.period === "week") {
    const weekNumber = getISOWeekNumber(new Date(report.period_start));
    const year = new Date(report.period_start).getUTCFullYear();
    return `📊 Craig Weekly Digest — Week ${weekNumber}, ${year}`;
  }

  const date = new Date(report.period_start);
  const monthName = date.toLocaleString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
  const year = date.getUTCFullYear();
  return `📊 Craig Monthly Digest — ${monthName} ${year}`;
}

/** Calculate ISO week number for a date. */
function getISOWeekNumber(date: Date): number {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
}

/**
 * Render a DigestReport as a markdown string.
 *
 * Follows the exact format from the specification (AC5).
 *
 * [CLEAN-CODE] Pure function, no side effects.
 */
function renderMarkdown(report: DigestReport): string {
  const sections: string[] = [];
  const hasActivity = hasAnyActivity(report);

  // Header
  sections.push(`# ${buildTitle(report)}\n`);

  if (!hasActivity) {
    sections.push("Craig monitored the repo — no issues detected. ✅\n");
    return sections.join("\n");
  }

  // Activity table
  sections.push(renderActivityTable(report));

  // Findings by Severity table
  sections.push(renderSeverityTable(report));

  // Top Findings
  if (report.top_findings.length > 0) {
    sections.push(renderTopFindings(report.top_findings));
  }

  // Failures
  if (report.failures.length > 0) {
    sections.push(renderFailures(report.failures));
  }

  return sections.join("\n");
}

/** Check whether the report has any non-zero activity. */
function hasAnyActivity(report: DigestReport): boolean {
  return (
    report.merges_reviewed > 0 ||
    report.issues_created > 0 ||
    report.prs_opened > 0 ||
    report.top_findings.length > 0 ||
    report.failures.length > 0 ||
    Object.values(report.findings_by_severity).some((v) => v > 0)
  );
}

/** Render the Activity table section. */
function renderActivityTable(report: DigestReport): string {
  const totalInvocations = Object.values(report.guardian_invocations).reduce(
    (sum, n) => sum + n,
    0,
  );

  return [
    "## Activity",
    "| Metric | Count |",
    "|--------|-------|",
    `| Merges reviewed | ${report.merges_reviewed} |`,
    `| Issues created | ${report.issues_created} |`,
    `| Draft PRs opened | ${report.prs_opened} |`,
    `| Guardian invocations | ${totalInvocations} |`,
    "",
  ].join("\n");
}

/** Render the Findings by Severity table section. */
function renderSeverityTable(report: DigestReport): string {
  const sev = report.findings_by_severity;

  return [
    "## Findings by Severity",
    "| 🔴 Critical | 🟠 High | 🟡 Medium | 🔵 Low |",
    "|-------------|---------|-----------|--------|",
    `| ${sev["critical"] ?? 0} | ${sev["high"] ?? 0} | ${sev["medium"] ?? 0} | ${sev["low"] ?? 0} |`,
    "",
  ].join("\n");
}

/** Render the Top Findings section. */
function renderTopFindings(findings: readonly Finding[]): string {
  const lines = ["## Top Findings"];

  for (let i = 0; i < findings.length; i++) {
    const f = findings[i]!;
    const emoji = SEVERITY_EMOJI[f.severity] ?? "⚪";
    const label = f.severity.toUpperCase();
    lines.push(
      `${i + 1}. ${emoji} **${label}** — ${f.issue} (${f.source})`,
    );
  }

  lines.push("");
  return lines.join("\n");
}

/** Render the Failures section. */
function renderFailures(failures: readonly string[]): string {
  const lines = ["## Failures"];

  for (const failure of failures) {
    lines.push(`- ${failure}`);
  }

  lines.push("");
  return lines.join("\n");
}
