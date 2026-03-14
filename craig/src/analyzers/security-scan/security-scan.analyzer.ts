/**
 * Security Scan Analyzer — Scheduled full-repo security scan.
 *
 * Invokes Security Guardian via CopilotPort to run a full security review
 * of the repository. Parses results, creates GitHub issues for CRITICAL
 * and HIGH findings, and stores all findings in state.
 *
 * Design decisions:
 * - Never throws — returns `{ success: false, error }` on failure [CLEAN-CODE]
 * - Creates issues only for CRITICAL and HIGH severity [AC2]
 * - Deduplicates by checking for existing open issues [AC4]
 * - Tracks consecutive failures for incident escalation [Edge Case]
 * - All dependencies injected via factory params [SOLID/DIP] [HEXAGONAL]
 *
 * @module analyzers/security-scan
 */

import type {
  Analyzer,
  AnalyzerContext,
  AnalyzerResult,
  ActionTaken,
} from "../analyzer.types.js";
import type { CopilotPort } from "../../copilot/index.js";
import type { GitHubPort } from "../../github/index.js";
import type { StatePort, Finding } from "../../state/index.js";
import type { ResultParserPort, ParsedFinding } from "../../result-parser/index.js";

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
 * The prompt sent to Security Guardian for full-repo scans.
 * Matches the spec in Issue #10 AC1.
 */
const SECURITY_SCAN_PROMPT =
  "Run a full security review of this repository: Semgrep, Gitleaks, Trivy, dependency audit. Report all findings.";

// ---------------------------------------------------------------------------
// Factory Dependencies
// ---------------------------------------------------------------------------

/**
 * Dependencies required by the Security Scan Analyzer.
 *
 * [SOLID/DIP] All dependencies are ports (interfaces), not implementations.
 */
export interface SecurityScanDeps {
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
 * Build the issue title for a security finding.
 *
 * Format: `{emoji} Security: {issue description}`
 * Matches the spec example: "🔴 Security: SQL injection in src/db.py"
 */
function buildIssueTitle(finding: ParsedFinding): string {
  const emoji = SEVERITY_EMOJI[finding.severity] ?? "⚠️";
  return `${emoji} Security: ${finding.issue}`;
}

/**
 * Build the issue body for a security finding.
 *
 * Includes all fields from the Guardian report per AC3:
 * severity, OWASP category, file/line, description,
 * justification, and suggested fix.
 *
 * [CLEAN-CODE] Structured markdown for readability.
 */
function buildIssueBody(finding: ParsedFinding): string {
  const severityLabel = finding.severity.toUpperCase();
  const emoji = SEVERITY_EMOJI[finding.severity] ?? "⚠️";

  return [
    `## ${emoji} Security Finding`,
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
    `*Detected by Craig — Security Scan Analyzer*`,
  ].join("\n");
}

/**
 * Build the labels array for a security finding issue.
 *
 * Always includes "craig" and "security".
 * Adds the severity level as a label (e.g., "critical", "high").
 */
function buildIssueLabels(finding: ParsedFinding): string[] {
  return ["craig", "security", finding.severity];
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
    source: "security-guardian",
    github_issue_url: githubIssueUrl,
    detected_at: new Date().toISOString(),
    task: "security_scan",
  };
}

// ---------------------------------------------------------------------------
// Factory Function
// ---------------------------------------------------------------------------

/**
 * Create a Security Scan Analyzer instance.
 *
 * Factory function pattern — returns the Analyzer interface.
 * All dependencies are injected; the implementation is encapsulated.
 *
 * @param deps - All required port dependencies
 * @returns An Analyzer instance for security scanning
 *
 * @example
 * ```typescript
 * const analyzer = createSecurityScanAnalyzer({
 *   copilot, github, state, parser,
 * });
 * const result = await analyzer.execute({ trigger: "schedule" });
 * ```
 *
 * [HEXAGONAL] Returns the port interface, not the implementation.
 * [SOLID/DIP] Depends on abstractions (ports), not concretions.
 */
export function createSecurityScanAnalyzer(deps: SecurityScanDeps): Analyzer {
  const { copilot, github, state, parser } = deps;
  let consecutiveFailures = deps.consecutiveFailures ?? 0;

  return {
    name: "security-scan",

    async execute(context: AnalyzerContext): Promise<AnalyzerResult> {
      const startTime = Date.now();

      try {
        return await runSecurityScan(
          context,
          copilot,
          github,
          state,
          parser,
          startTime,
        );
      } catch (error: unknown) {
        // [CLEAN-CODE] Never throw — return error result
        consecutiveFailures++;
        await handleFailure(github, state, consecutiveFailures, error);

        return {
          task: "security_scan",
          success: false,
          findings: [],
          actions_taken: [],
          duration_ms: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };

  /**
   * Core scan logic — separated from error handling.
   *
   * Steps:
   * 1. Invoke Security Guardian via CopilotPort
   * 2. Parse the Guardian report
   * 3. Store all findings in state
   * 4. Create GitHub issues for CRITICAL/HIGH (with dedup)
   * 5. Return structured result
   *
   * [CLEAN-CODE] Extracted to keep execute() small.
   */
  async function runSecurityScan(
    _context: AnalyzerContext,
    copilotPort: CopilotPort,
    githubPort: GitHubPort,
    statePort: StatePort,
    parserPort: ResultParserPort,
    startTime: number,
  ): Promise<AnalyzerResult> {
    // Step 1: Invoke Security Guardian [AC1]
    const invokeResult = await copilotPort.invoke({
      agent: "security-guardian",
      prompt: SECURITY_SCAN_PROMPT,
    });

    // Handle Guardian failure
    if (!invokeResult.success) {
      consecutiveFailures++;
      await handleFailure(
        githubPort,
        statePort,
        consecutiveFailures,
        new Error(invokeResult.error),
      );

      return {
        task: "security_scan",
        success: false,
        findings: [],
        actions_taken: [],
        duration_ms: Date.now() - startTime,
        error: invokeResult.error,
      };
    }

    // Reset consecutive failures on success
    consecutiveFailures = 0;

    // Step 2: Parse Guardian output
    const report = parserPort.parse(invokeResult.output, "security");

    // Step 3 & 4: Process findings
    const actionsTaken = await processFindings(
      report.findings,
      githubPort,
      statePort,
    );

    // Save state
    await statePort.save();

    return {
      task: "security_scan",
      success: true,
      findings: report.findings,
      actions_taken: actionsTaken,
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
    githubPort: GitHubPort,
    statePort: StatePort,
  ): Promise<ActionTaken[]> {
    const actionsTaken: ActionTaken[] = [];

    for (const finding of findings) {
      let githubIssueUrl: string | undefined;

      // Create GitHub issue for critical/high findings [AC2]
      if (ISSUE_SEVERITIES.has(finding.severity)) {
        const issueResult = await createIssueIfNew(finding, githubPort);
        if (issueResult) {
          githubIssueUrl = issueResult.url;
          actionsTaken.push({
            type: "issue_created",
            url: issueResult.url,
            description: `Created issue for ${finding.severity} finding: ${finding.issue}`,
          });
        }
      }

      // Store all findings in state regardless of severity [AC1]
      const stateFinding = toStateFinding(finding, githubIssueUrl);
      statePort.addFinding(stateFinding);
    }

    return actionsTaken;
  }

  /**
   * Create a GitHub issue for a finding if no duplicate exists.
   *
   * [AC4] Checks findExistingIssue() before creating to prevent duplicates.
   * Returns null if a duplicate exists or if issue creation fails.
   *
   * [CLEAN-CODE] Catches issue creation errors gracefully — the scan
   * itself succeeded even if issue creation fails.
   */
  async function createIssueIfNew(
    finding: ParsedFinding,
    githubPort: GitHubPort,
  ): Promise<{ url: string } | null> {
    const title = buildIssueTitle(finding);

    // Check for duplicate [AC4]
    const existing = await githubPort.findExistingIssue(title);
    if (existing) {
      return null; // Skip duplicate
    }

    try {
      const issue = await githubPort.createIssue({
        title,
        body: buildIssueBody(finding),
        labels: buildIssueLabels(finding),
      });
      return { url: issue.url };
    } catch {
      // [CLEAN-CODE] Issue creation failure is not a scan failure
      // Log to stderr (not stdout — MCP uses stdout for JSON-RPC)
      console.error(
        `[Craig] Failed to create issue for finding: ${finding.issue}`,
      );
      return null;
    }
  }

  /**
   * Handle scan failure: save state and create incident issue after
   * MAX_CONSECUTIVE_FAILURES consecutive failures.
   *
   * [Edge Case] Creates an incident issue to alert the team when
   * the security scanner has failed too many times in a row.
   */
  async function handleFailure(
    githubPort: GitHubPort,
    statePort: StatePort,
    failures: number,
    error: unknown,
  ): Promise<void> {
    try {
      await statePort.save();

      if (failures >= MAX_CONSECUTIVE_FAILURES) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        // Check for existing incident issue to avoid duplicates
        const incidentTitle =
          "⚠️ Craig Security Scan — Consecutive Failures";
        const existing = await githubPort.findExistingIssue(incidentTitle);

        if (!existing) {
          await githubPort.createIssue({
            title: incidentTitle,
            body: [
              `## ⚠️ Security Scan Incident`,
              "",
              `The Craig security scanner has failed **${failures}** consecutive times.`,
              "",
              `### Last Error`,
              `\`\`\``,
              errorMessage,
              `\`\`\``,
              "",
              `### Action Required`,
              `- [ ] Check Security Guardian availability`,
              `- [ ] Review Copilot SDK configuration`,
              `- [ ] Run manual security scan: \`craig run security_scan\``,
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
      console.error("[Craig] Failed to handle security scan failure");
    }
  }
}
