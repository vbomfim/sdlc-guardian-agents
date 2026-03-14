/**
 * Platform Audit Analyzer — K8s manifest security auditing.
 *
 * Invokes Platform Guardian via CopilotPort to audit Kubernetes manifests
 * when they change. Parses results, creates GitHub issues for CRITICAL
 * and HIGH findings with CIS Benchmark references, and stores all
 * findings in state.
 *
 * Design decisions:
 * - Never throws — returns `{ success: false, error }` on failure [CLEAN-CODE]
 * - Only invokes Guardian when K8s files are detected in changes [AC1]
 * - Creates issues only for CRITICAL and HIGH severity [AC2]
 * - Deduplicates by checking for existing open issues [AC4]
 * - Tracks consecutive failures for incident escalation [Edge Case]
 * - Uses GitPort (not GitHubPort) for provider-agnostic support [HEXAGONAL]
 * - All dependencies injected via factory params [SOLID/DIP]
 *
 * @module analyzers/platform-audit
 */

import type { AnalyzerPort } from "../analyzer.port.js";
import type {
  AnalyzerContext,
  AnalyzerResult,
  AnalyzerFinding,
  ActionTaken,
} from "../analyzer.types.js";
import type { CopilotPort } from "../../copilot/index.js";
import type { GitPort } from "../../git-port/git.port.js";
import type { StatePort, Finding } from "../../state/index.js";
import type { ResultParserPort, ParsedFinding } from "../../result-parser/index.js";
import { filterK8sFiles } from "./k8s-file-detector.js";

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
 * Prompt template for Platform Guardian K8s audits.
 * Includes CIS Benchmark reference and tooling list per Issue #57.
 */
function buildAuditPrompt(k8sFiles: readonly string[]): string {
  const fileList = k8sFiles.join("\n- ");
  return [
    "Audit these Kubernetes manifest files for security and configuration issues.",
    "Run checks equivalent to kube-bench, kube-score, polaris, kubeaudit, and trivy.",
    "Report findings with CIS Benchmark references where applicable.",
    "",
    "Changed files:",
    `- ${fileList}`,
    "",
    "Focus on:",
    "- CIS Kubernetes Benchmark compliance",
    "- Pod security (runAsNonRoot, readOnlyRootFilesystem, privilege escalation)",
    "- Resource limits and requests",
    "- Network policies",
    "- RBAC least privilege",
    "- Image security (no latest tags, signed images)",
    "- Secret management",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Extended Context
// ---------------------------------------------------------------------------

/**
 * Extended analyzer context for platform audits.
 *
 * Adds the list of changed files and optional diff, which are used to
 * determine whether K8s files are affected and provide context to the Guardian.
 */
export interface PlatformAuditContext extends AnalyzerContext {
  /** List of changed file paths (relative to repo root). */
  readonly changedFiles?: readonly string[];
  /** Raw diff text for the changed files. */
  readonly diff?: string;
}

// ---------------------------------------------------------------------------
// Factory Dependencies
// ---------------------------------------------------------------------------

/**
 * Dependencies required by the Platform Audit Analyzer.
 *
 * [SOLID/DIP] All dependencies are ports (interfaces), not implementations.
 */
export interface PlatformAuditDeps {
  readonly copilot: CopilotPort;
  readonly git: GitPort;
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
 * Build the issue title for a platform finding.
 *
 * Format: `{emoji} Platform: {issue description}`
 */
function buildIssueTitle(finding: ParsedFinding): string {
  const emoji = SEVERITY_EMOJI[finding.severity] ?? "⚠️";
  return `${emoji} Platform: ${finding.issue}`;
}

/**
 * Build the issue body for a platform finding.
 *
 * Includes CIS Benchmark reference, severity, file/line,
 * description, justification, and suggested fix.
 *
 * [CLEAN-CODE] Structured markdown for readability.
 */
function buildIssueBody(finding: ParsedFinding): string {
  const severityLabel = finding.severity.toUpperCase();
  const emoji = SEVERITY_EMOJI[finding.severity] ?? "⚠️";

  return [
    `## ${emoji} Platform Security Finding`,
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
    `### CIS Benchmark Reference & Justification`,
    finding.source_justification,
    "",
    `### Suggested Fix`,
    finding.suggested_fix,
    "",
    `---`,
    `*Detected by Craig — Platform Audit Analyzer*`,
  ].join("\n");
}

/**
 * Build the labels array for a platform finding issue.
 */
function buildIssueLabels(finding: ParsedFinding): string[] {
  return ["craig", "platform-audit", finding.severity];
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
    source: "platform-guardian",
    github_issue_url: githubIssueUrl,
    detected_at: new Date().toISOString(),
    task: "platform_audit",
  };
}

// ---------------------------------------------------------------------------
// Factory Function
// ---------------------------------------------------------------------------

/**
 * Create a Platform Audit Analyzer instance.
 *
 * Factory function pattern — returns the AnalyzerPort interface.
 * All dependencies are injected; the implementation is encapsulated.
 *
 * @param deps - All required port dependencies
 * @returns An Analyzer instance for K8s manifest auditing
 *
 * @example
 * ```typescript
 * const analyzer = createPlatformAuditAnalyzer({
 *   copilot, git, state, parser,
 * });
 * const result = await analyzer.execute({
 *   task: "platform_audit",
 *   taskId: "uuid",
 *   timestamp: new Date().toISOString(),
 *   changedFiles: ["k8s/deployment.yaml"],
 *   diff: "...",
 * });
 * ```
 *
 * [HEXAGONAL] Returns the port interface, not the implementation.
 * [SOLID/DIP] Depends on abstractions (ports), not concretions.
 */
export function createPlatformAuditAnalyzer(deps: PlatformAuditDeps): AnalyzerPort {
  const { copilot, git, state, parser } = deps;
  let consecutiveFailures = deps.consecutiveFailures ?? 0;

  return {
    name: "platform-audit",

    async execute(context: AnalyzerContext): Promise<AnalyzerResult> {
      const startTime = Date.now();

      try {
        return await runPlatformAudit(context, startTime);
      } catch (error: unknown) {
        // [CLEAN-CODE] Never throw — return error result
        consecutiveFailures++;
        await handleFailure(consecutiveFailures, error);

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
   * 1. Extract K8s files from context (skip if none)
   * 2. Invoke Platform Guardian via CopilotPort
   * 3. Parse the Guardian report
   * 4. Store all findings in state
   * 5. Create GitHub issues for CRITICAL/HIGH (with dedup)
   * 6. Return structured result
   *
   * [CLEAN-CODE] Extracted to keep execute() small.
   */
  async function runPlatformAudit(
    context: AnalyzerContext,
    startTime: number,
  ): Promise<AnalyzerResult> {
    // Step 1: Detect K8s files
    const platformContext = context as PlatformAuditContext;
    const changedFiles = platformContext.changedFiles ?? [];
    const k8sFiles = filterK8sFiles(changedFiles);

    // Skip if no K8s files changed
    if (k8sFiles.length === 0) {
      return {
        success: true,
        summary: "No Kubernetes manifest files detected in changes. Skipping platform audit.",
        findings: [],
        actions: [],
        duration_ms: Date.now() - startTime,
      };
    }

    // Step 2: Invoke Platform Guardian [AC1]
    const prompt = buildAuditPrompt(k8sFiles);
    const invokeResult = await copilot.invoke({
      agent: "platform-guardian",
      prompt,
      context: platformContext.diff,
    });

    // Handle Guardian failure
    if (!invokeResult.success) {
      consecutiveFailures++;
      await handleFailure(
        consecutiveFailures,
        new Error(invokeResult.error),
      );

      return {
        success: false,
        summary: invokeResult.error ?? "Platform Guardian invocation failed",
        findings: [],
        actions: [],
        duration_ms: Date.now() - startTime,
      };
    }

    // Reset consecutive failures on success
    consecutiveFailures = 0;

    // Step 3: Parse Guardian output
    const report = parser.parse(invokeResult.output, "security");

    // Step 4 & 5: Process findings
    const { analyzerFindings, actionsTaken } = await processFindings(
      report.findings,
    );

    // Save state
    await state.save();

    return {
      success: true,
      summary: `Platform audit complete. Audited ${k8sFiles.length} K8s file(s). Found ${analyzerFindings.length} finding(s), took ${actionsTaken.length} action(s).`,
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
  ): Promise<{ analyzerFindings: AnalyzerFinding[]; actionsTaken: ActionTaken[] }> {
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
            description: `Created issue for ${finding.severity} finding: ${finding.issue}`,
          });
        }
      }

      // Map to canonical AnalyzerFinding
      analyzerFindings.push({
        severity: finding.severity,
        category: finding.category,
        file: finding.file_line || undefined,
        issue: finding.issue,
        source: finding.source_justification || "platform-guardian",
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
   */
  async function createIssueIfNew(
    finding: ParsedFinding,
  ): Promise<{ url: string } | null> {
    const title = buildIssueTitle(finding);

    // Check for duplicate [AC4]
    const existing = await git.findExistingIssue(title);
    if (existing) {
      return null; // Skip duplicate
    }

    try {
      const issue = await git.createIssue({
        title,
        body: buildIssueBody(finding),
        labels: buildIssueLabels(finding),
      });
      return { url: issue.url };
    } catch {
      // [CLEAN-CODE] Issue creation failure is not a scan failure
      console.error(
        `[Craig] Failed to create issue for platform finding: ${finding.issue}`,
      );
      return null;
    }
  }

  /**
   * Handle audit failure: save state and create incident issue after
   * MAX_CONSECUTIVE_FAILURES consecutive failures.
   */
  async function handleFailure(
    failures: number,
    error: unknown,
  ): Promise<void> {
    try {
      await state.save();

      if (failures >= MAX_CONSECUTIVE_FAILURES) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        const incidentTitle =
          "⚠️ Craig Platform Audit — Consecutive Failures";
        const existing = await git.findExistingIssue(incidentTitle);

        if (!existing) {
          await git.createIssue({
            title: incidentTitle,
            body: [
              `## ⚠️ Platform Audit Incident`,
              "",
              `The Craig platform auditor has failed **${failures}** consecutive times.`,
              "",
              `### Last Error`,
              `\`\`\``,
              errorMessage,
              `\`\`\``,
              "",
              `### Action Required`,
              `- [ ] Check Platform Guardian availability`,
              `- [ ] Review Copilot SDK configuration`,
              `- [ ] Run manual platform audit: \`craig run platform_audit\``,
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
      console.error("[Craig] Failed to handle platform audit failure");
    }
  }
}
