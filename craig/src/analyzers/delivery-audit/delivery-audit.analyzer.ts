/**
 * Delivery Audit Analyzer — Scheduled deployment & observability review.
 *
 * Invokes Delivery Guardian via CopilotPort to review the repository's
 * deployment strategy, CI/CD pipeline, observability setup, SLI/SLO
 * definitions, BCDR plans, and incident response readiness. Parses
 * results, creates GitHub issues for CRITICAL and HIGH findings with
 * Google SRE / 12-Factor references, and stores all findings in state.
 *
 * Design decisions:
 * - Never throws — returns `{ success: false }` on failure [CLEAN-CODE]
 * - Creates issues only for CRITICAL and HIGH severity [AC2]
 * - Deduplicates by checking for existing open issues [AC4]
 * - Tracks consecutive failures for incident escalation [Edge Case]
 * - All dependencies injected via factory params [SOLID/DIP] [HEXAGONAL]
 *
 * @module analyzers/delivery-audit
 */

import type { AnalyzerPort } from "../analyzer.port.js";
import type {
  AnalyzerContext,
  AnalyzerResult,
  AnalyzerFinding,
  ActionTaken,
} from "../analyzer.types.js";
import type { CopilotPort } from "../../copilot/index.js";
import type { GitHubPort } from "../../github/index.js";
import type { StatePort, Finding } from "../../state/index.js";
import type {
  ResultParserPort,
  ParsedFinding,
} from "../../result-parser/index.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Severity levels that trigger GitHub issue creation. */
const ISSUE_SEVERITIES: ReadonlySet<string> = new Set(["critical", "high"]);

/** Maximum consecutive failures before creating an incident issue. */
const MAX_CONSECUTIVE_FAILURES = 3;

/** Emoji mapping for severity levels in issue titles. */
const SEVERITY_EMOJI: Readonly<Record<string, string>> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🔵",
  info: "ℹ️",
};

/**
 * The prompt sent to Delivery Guardian for full delivery audits.
 * Covers all six review domains from Issue #58.
 */
const DELIVERY_AUDIT_PROMPT =
  "Review this repository's delivery pipeline comprehensively: " +
  "deployment strategy (blue-green, canary, rollback), " +
  "CI/CD pipeline audit (quality gates, rollback mechanisms), " +
  "observability check (metrics, logging, tracing), " +
  "SLI/SLO validation (error budgets, latency targets), " +
  "BCDR plan review (backup, disaster recovery, RTO/RPO), " +
  "and incident response readiness (runbooks, on-call, escalation). " +
  "Report all findings with Google SRE and 12-Factor App references.";

// ---------------------------------------------------------------------------
// Factory Dependencies
// ---------------------------------------------------------------------------

/**
 * Dependencies required by the Delivery Audit Analyzer.
 *
 * [SOLID/DIP] All dependencies are ports (interfaces), not implementations.
 */
export interface DeliveryAuditAnalyzerDeps {
  readonly copilot: CopilotPort;
  readonly github: GitHubPort;
  readonly state: StatePort;
  readonly parser: ResultParserPort;

  /**
   * Number of consecutive prior failures.
   * Used to track escalation toward incident issue creation.
   * Defaults to 0 for fresh analyzers.
   */
  readonly consecutiveFailures?: number;
}

// ---------------------------------------------------------------------------
// Issue Formatting — Small Pure Functions [CLEAN-CODE] [SRP]
// ---------------------------------------------------------------------------

/**
 * Build the issue title for a delivery finding.
 *
 * Format: `{emoji} Delivery: {issue description}`
 */
function buildIssueTitle(finding: ParsedFinding): string {
  const emoji = SEVERITY_EMOJI[finding.severity] ?? "⚠️";
  return `${emoji} Delivery: ${finding.issue}`;
}

/**
 * Build the issue body for a delivery finding.
 *
 * Includes severity, category, file/line, description,
 * source justification (Google SRE / 12-Factor references),
 * and suggested fix.
 *
 * [CLEAN-CODE] Structured markdown for readability.
 */
function buildIssueBody(finding: ParsedFinding): string {
  const severityLabel = finding.severity.toUpperCase();
  const emoji = SEVERITY_EMOJI[finding.severity] ?? "⚠️";

  return [
    `## ${emoji} Delivery Finding`,
    "",
    `| Field | Value |`,
    `|-------|-------|`,
    `| **Severity** | ${emoji} ${severityLabel} |`,
    `| **Category** | ${finding.category} |`,
    `| **File** | \`${finding.file_line || "N/A"}\` |`,
    "",
    `### Description`,
    finding.issue,
    "",
    `### Source & Justification`,
    finding.source_justification,
    "",
    `### Suggested Fix`,
    finding.suggested_fix,
    "",
    `---`,
    `*Detected by Craig — Delivery Audit Analyzer*`,
  ].join("\n");
}

/**
 * Build the labels array for a delivery finding issue.
 *
 * Always includes "craig" and "delivery".
 * Adds the severity level as a label (e.g., "critical", "high").
 */
function buildIssueLabels(finding: ParsedFinding): string[] {
  return ["craig", "delivery", finding.severity];
}

/**
 * Convert a ParsedFinding to a Finding for state storage.
 *
 * [CLEAN-CODE] Pure function — transforms between data models.
 */
function toStateFinding(
  finding: ParsedFinding,
  githubIssueUrl?: string,
): Finding {
  return {
    id: crypto.randomUUID(),
    severity: finding.severity,
    category: finding.category,
    file: finding.file_line || undefined,
    issue: finding.issue,
    source: "delivery-guardian",
    github_issue_url: githubIssueUrl,
    detected_at: new Date().toISOString(),
    task: "delivery_audit",
  };
}

// ---------------------------------------------------------------------------
// Factory Function
// ---------------------------------------------------------------------------

/**
 * Create a Delivery Audit Analyzer instance.
 *
 * Factory function pattern — returns the Analyzer interface.
 * All dependencies are injected; the implementation is encapsulated.
 *
 * @param deps - All required port dependencies
 * @returns An Analyzer instance for delivery audits
 *
 * @example
 * ```typescript
 * const analyzer = createDeliveryAuditAnalyzer({
 *   copilot, github, state, parser,
 * });
 * const result = await analyzer.execute(context);
 * ```
 *
 * [HEXAGONAL] Returns the port interface, not the implementation.
 * [SOLID/DIP] Depends on abstractions (ports), not concretions.
 */
export function createDeliveryAuditAnalyzer(
  deps: DeliveryAuditAnalyzerDeps,
): AnalyzerPort {
  const { copilot, github, state, parser } = deps;
  let consecutiveFailures = deps.consecutiveFailures ?? 0;

  return {
    name: "delivery_audit",

    async execute(_context: AnalyzerContext): Promise<AnalyzerResult> {
      const startTime = Date.now();

      try {
        return await runDeliveryAudit(startTime);
      } catch (error: unknown) {
        // [CLEAN-CODE] Never throw — return error result
        consecutiveFailures++;
        await handleFailure(error);

        return {
          success: false,
          summary: error instanceof Error ? error.message : String(error),
          findings: [],
          actions: [],
          duration_ms: Date.now() - startTime,
        };
      }
    },
  };

  /**
   * Core audit logic — separated from error handling.
   *
   * Steps:
   * 1. Invoke Delivery Guardian via CopilotPort
   * 2. Parse the Guardian report
   * 3. Store all findings in state
   * 4. Create GitHub issues for CRITICAL/HIGH (with dedup)
   * 5. Return structured result
   *
   * [CLEAN-CODE] Extracted to keep execute() small.
   */
  async function runDeliveryAudit(startTime: number): Promise<AnalyzerResult> {
    // Step 1: Invoke Delivery Guardian [AC1]
    const invokeResult = await copilot.invoke({
      agent: "delivery-guardian",
      prompt: DELIVERY_AUDIT_PROMPT,
    });

    // Handle Guardian failure
    if (!invokeResult.success) {
      consecutiveFailures++;
      await handleFailure(new Error(invokeResult.error));

      return {
        success: false,
        summary: `Delivery Guardian invocation failed: ${invokeResult.error}`,
        findings: [],
        actions: [],
        duration_ms: Date.now() - startTime,
      };
    }

    // Reset consecutive failures on success
    consecutiveFailures = 0;

    // Step 2: Parse Guardian output
    const report = parser.parse(invokeResult.output, "dev");

    // Step 3 & 4: Process findings
    const { analyzerFindings, actionsTaken } = await processFindings(
      report.findings,
    );

    // Save state
    await state.save();

    return {
      success: true,
      summary: `Delivery audit complete. Found ${analyzerFindings.length} finding(s), took ${actionsTaken.length} action(s).`,
      findings: analyzerFindings,
      actions: actionsTaken,
      duration_ms: Date.now() - startTime,
    };
  }

  /**
   * Process all findings: store in state and create issues for critical/high.
   *
   * [SRP] Handles both state storage and issue creation for each finding.
   * [AC2] Only creates issues for CRITICAL and HIGH severity.
   * [AC4] Checks for duplicate open issues before creating.
   */
  async function processFindings(
    findings: ParsedFinding[],
  ): Promise<{
    analyzerFindings: AnalyzerFinding[];
    actionsTaken: ActionTaken[];
  }> {
    const actionsTaken: ActionTaken[] = [];
    const analyzerFindings: AnalyzerFinding[] = [];

    for (const finding of findings) {
      let githubIssueUrl: string | undefined;

      // Create GitHub issue for critical/high findings [AC2]
      if (ISSUE_SEVERITIES.has(finding.severity)) {
        const issueResult = await createIssueIfNew(finding);
        if (issueResult) {
          githubIssueUrl = issueResult.url;
          actionsTaken.push({
            type: "issue_created",
            url: issueResult.url,
            description: `Created delivery issue: ${finding.issue}`,
          });
        }
      }

      // Map to canonical AnalyzerFinding
      analyzerFindings.push({
        severity: finding.severity,
        category: finding.category,
        file: finding.file_line || undefined,
        issue: finding.issue,
        source: finding.source_justification || "delivery-guardian",
        suggested_fix: finding.suggested_fix,
      });

      // Store all findings in state regardless of severity [AC1]
      const stateFinding = toStateFinding(finding, githubIssueUrl);
      state.addFinding(stateFinding);
    }

    return { analyzerFindings, actionsTaken };
  }

  /**
   * Create a GitHub issue for a finding if no duplicate exists.
   *
   * [AC4] Checks findExistingIssue() before creating to prevent duplicates.
   * Returns null if a duplicate exists or if issue creation fails.
   *
   * [CLEAN-CODE] Catches issue creation errors gracefully — the audit
   * itself succeeded even if issue creation fails.
   */
  async function createIssueIfNew(
    finding: ParsedFinding,
  ): Promise<{ url: string } | null> {
    const title = buildIssueTitle(finding);

    // Check for duplicate [AC4]
    const existing = await github.findExistingIssue(title);
    if (existing) {
      return null; // Skip duplicate
    }

    try {
      const issue = await github.createIssue({
        title,
        body: buildIssueBody(finding),
        labels: buildIssueLabels(finding),
      });
      return { url: issue.url };
    } catch {
      // [CLEAN-CODE] Issue creation failure is not an audit failure
      console.error(
        `[Craig] Failed to create issue for delivery finding: ${finding.issue}`,
      );
      return null;
    }
  }

  /**
   * Handle audit failure: save state and create incident issue after
   * MAX_CONSECUTIVE_FAILURES consecutive failures.
   *
   * [Edge Case] Creates an incident issue to alert the team when
   * the delivery audit has failed too many times in a row.
   */
  async function handleFailure(error: unknown): Promise<void> {
    try {
      await state.save();

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        const incidentTitle =
          "⚠️ Craig Delivery Audit — Consecutive Failures";
        const existing = await github.findExistingIssue(incidentTitle);

        if (!existing) {
          await github.createIssue({
            title: incidentTitle,
            body: [
              `## ⚠️ Delivery Audit Incident`,
              "",
              `The Craig delivery audit has failed **${consecutiveFailures}** consecutive times.`,
              "",
              `### Last Error`,
              `\`\`\``,
              errorMessage,
              `\`\`\``,
              "",
              `### Action Required`,
              `- [ ] Check Delivery Guardian availability`,
              `- [ ] Review Copilot SDK configuration`,
              `- [ ] Run manual delivery audit: \`craig run delivery_audit\``,
              "",
              `---`,
              `*Created by Craig — Incident Detection*`,
            ].join("\n"),
            labels: ["craig", "incident"],
          });
        }
      }
    } catch {
      // [CLEAN-CODE] Failure handling must never throw
      console.error("[Craig] Failed to handle delivery audit failure");
    }
  }
}
