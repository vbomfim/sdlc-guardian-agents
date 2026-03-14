/**
 * DigestPort — the inward-facing interface for the Digest Reporter.
 *
 * Compiles daily/weekly/monthly summaries from State data and
 * publishes them as GitHub issues. Does NOT generate findings —
 * only aggregates existing data from the State component.
 *
 * [HEXAGONAL] This is the port (interface). The DigestAdapter
 * implements it using StatePort + GitHubPort as dependencies.
 *
 * @module digest/digest-port
 */

import type { DigestPeriod, DigestReport, DigestPublishResult } from "./digest.types.js";

export interface DigestPort {
  /**
   * Generate a digest report for the given period.
   *
   * Reads daily_stats and findings from StatePort to compile
   * an aggregate view. If no data exists for the period,
   * returns an empty digest (all zeros) — never errors.
   *
   * @param period - The time period to summarize
   * @returns A compiled DigestReport
   */
  generate(period: DigestPeriod): Promise<DigestReport>;

  /**
   * Publish a digest report as a GitHub issue.
   *
   * - If no matching issue exists for the period, creates a new one.
   * - If an issue already exists (matched by title), adds a comment
   *   to the existing issue instead of creating a duplicate.
   *
   * Title format: "📊 Craig Daily Digest — 2025-07-11"
   * Labels: ["craig", "digest"]
   *
   * @param report - The digest report to publish
   * @returns The URL of the created or updated GitHub issue
   */
  publish(report: DigestReport): Promise<DigestPublishResult>;
}
