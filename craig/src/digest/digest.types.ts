/**
 * Type definitions for the Digest Reporter component.
 *
 * Defines the digest report structure and period types used
 * by the DigestPort. All types use readonly properties to
 * enforce immutability.
 *
 * @module digest/types
 */

import type { Finding } from "../state/index.js";

/**
 * Valid digest periods.
 * - "today" — current day only
 * - "week"  — current ISO week (Mon–Sun)
 * - "month" — current calendar month
 */
export type DigestPeriod = "today" | "week" | "month";

/**
 * A compiled digest report summarizing Craig's activity
 * over a given period.
 *
 * Generated from State data (daily_stats + findings).
 * Does NOT produce new findings — only aggregates.
 */
export interface DigestReport {
  /** Human-readable period label (e.g., "today", "week", "month"). */
  readonly period: DigestPeriod;
  /** ISO 8601 date string for the period start (inclusive). */
  readonly period_start: string;
  /** ISO 8601 date string for the period end (inclusive). */
  readonly period_end: string;
  /** Number of merge commits reviewed. */
  readonly merges_reviewed: number;
  /** Number of GitHub issues created. */
  readonly issues_created: number;
  /** Number of draft PRs opened. */
  readonly prs_opened: number;
  /** Count of findings grouped by severity level. */
  readonly findings_by_severity: Record<string, number>;
  /** Top findings by severity (max 5). */
  readonly top_findings: readonly Finding[];
  /** Count of Guardian agent invocations by task name. */
  readonly guardian_invocations: Readonly<Record<string, number>>;
  /** List of failure messages from tasks that errored. */
  readonly failures: readonly string[];
}

/**
 * Result returned after publishing a digest to GitHub.
 */
export interface DigestPublishResult {
  /** URL of the created or updated GitHub issue. */
  readonly url: string;
}
