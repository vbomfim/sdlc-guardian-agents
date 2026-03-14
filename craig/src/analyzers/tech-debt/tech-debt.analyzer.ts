/**
 * TechDebtAnalyzer — Audits repository for tech debt via PO Guardian.
 *
 * Flow: invoke PO Guardian in audit mode → parse report → create categorized
 *       GitHub issues with priority labels → record findings in state.
 *
 * [HEXAGONAL] Depends only on port interfaces — no direct imports of adapters.
 * [CLEAN-CODE] Never throws — returns { success: false, error } on failure.
 * [SRP] Orchestration only — each step is a small pure function.
 *
 * @module analyzers/tech-debt
 */

import type { CopilotPort } from "../../copilot/index.js";
import type { GitHubPort } from "../../github/index.js";
import type { StatePort, Finding } from "../../state/index.js";
import type {
  ResultParserPort,
  ParsedFinding,
} from "../../result-parser/index.js";
import type {
  AnalyzerPort,
  AnalyzerContext,
  AnalyzerResult,
  ActionTaken,
} from "../analyzer.port.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Prompt sent to PO Guardian for the tech debt audit.
 * Matches the spec in Issue #12 AC1.
 */
const AUDIT_PROMPT =
  "Audit this project. Check for missing docs, stale dependencies, TODO comments, incomplete specs. Run the full 25-item project health checklist.";

/**
 * Maps finding severity to GitHub issue priority label.
 *
 * AC3: critical → priority:high, high → priority:high,
 *       medium → priority:medium, low/info → priority:low
 */
const PRIORITY_MAP: ReadonlyMap<string, string> = new Map([
  ["critical", "priority:high"],
  ["high", "priority:high"],
  ["medium", "priority:medium"],
  ["low", "priority:low"],
  ["info", "priority:low"],
]);

// ---------------------------------------------------------------------------
// Factory Options
// ---------------------------------------------------------------------------

/** Dependencies required by the TechDebtAnalyzer. */
export interface TechDebtAnalyzerDeps {
  readonly copilot: CopilotPort;
  readonly github: GitHubPort;
  readonly state: StatePort;
  readonly parser: ResultParserPort;
}

// ---------------------------------------------------------------------------
// Factory Function
// ---------------------------------------------------------------------------

/**
 * Create a TechDebtAnalyzer instance.
 *
 * [CLEAN-ARCH] Factory function — composition root creates and injects deps.
 *
 * @param deps - Port dependencies (copilot, github, state, parser)
 * @returns AnalyzerPort implementation for tech debt audits
 */
export function createTechDebtAnalyzer(
  deps: TechDebtAnalyzerDeps,
): AnalyzerPort {
  return {
    name: "tech_debt_audit",

    async execute(
      _context: AnalyzerContext,
    ): Promise<AnalyzerResult> {
      const start = Date.now();
      const actions: ActionTaken[] = [];

      try {
        // Step 1: Invoke PO Guardian in audit mode [AC1]
        const invokeResult = await deps.copilot.invoke({
          agent: "po-guardian",
          prompt: AUDIT_PROMPT,
        });

        // If PO Guardian failed, return error result
        if (!invokeResult.success) {
          return failResult(
            start,
            `PO Guardian invocation failed: ${invokeResult.error}`,
          );
        }

        // Step 2: Parse the PO Guardian report
        const report = deps.parser.parse(invokeResult.output, "po");

        // Step 3: Create categorized GitHub issues [AC2] + priority labels [AC3]
        const issueUrls = await createCategorizedIssues(
          report.findings,
          deps.github,
          actions,
        );

        // Step 4: Record findings in state
        await recordFindings(report.findings, issueUrls, deps.state);

        return {
          task: "tech_debt_audit",
          success: true,
          findings: report.findings.map(toResultFinding),
          actions_taken: actions,
          duration_ms: Date.now() - start,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : String(error);
        return failResult(start, message, actions);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Create GitHub issues for each finding with category and priority labels.
 *
 * [AC2] Each issue gets a `tech-debt:<category>` label.
 * [AC3] Each issue gets a `priority:<level>` label.
 *
 * Skips duplicate issues (findExistingIssue check).
 * Continues creating other issues if one fails (partial failure OK).
 *
 * @returns Map of finding index → issue URL (for state recording)
 */
async function createCategorizedIssues(
  findings: readonly ParsedFinding[],
  github: GitHubPort,
  actions: ActionTaken[],
): Promise<Map<number, string>> {
  const issueUrls = new Map<number, string>();

  for (let i = 0; i < findings.length; i++) {
    const finding = findings[i]!;
    const title = buildIssueTitle(finding);

    try {
      // Check for duplicate
      const existing = await github.findExistingIssue(title);
      if (existing) {
        issueUrls.set(i, existing.url);
        continue;
      }

      // Create issue with category + priority labels
      const labels = buildLabels(finding);
      const body = buildIssueBody(finding);

      const issue = await github.createIssue({
        title,
        body,
        labels,
      });

      issueUrls.set(i, issue.url);
      actions.push({
        type: "issue_created",
        url: issue.url,
        description: `Created tech debt issue: ${finding.issue}`,
      });
    } catch {
      // Partial failure — continue with remaining findings
      // [CLEAN-CODE] Log would go to stderr in production
    }
  }

  return issueUrls;
}

/**
 * Build the issue title with [Craig] prefix.
 *
 * Format: `[Craig] Tech Debt: <issue description>`
 */
function buildIssueTitle(finding: ParsedFinding): string {
  return `[Craig] Tech Debt: ${finding.issue}`;
}

/**
 * Build the labels array for a finding.
 *
 * Includes: craig, tech-debt, tech-debt:<category>, priority:<level>
 */
function buildLabels(finding: ParsedFinding): string[] {
  const priority = PRIORITY_MAP.get(finding.severity) ?? "priority:low";
  const categoryLabel = finding.category
    ? `tech-debt:${finding.category}`
    : "tech-debt:general";

  return ["craig", "tech-debt", categoryLabel, priority];
}

/**
 * Build the body for a GitHub issue from a finding.
 */
function buildIssueBody(finding: ParsedFinding): string {
  return [
    `## Tech Debt Finding`,
    "",
    `**Severity:** ${finding.severity.toUpperCase()}`,
    `**Category:** ${finding.category || "General"}`,
    `**File:** ${finding.file_line || "N/A"}`,
    `**Source:** PO Guardian audit`,
    "",
    `### Issue`,
    finding.issue,
    "",
    `### Justification`,
    finding.source_justification,
    "",
    `### Suggested Fix`,
    finding.suggested_fix,
    "",
    "---",
    "_Created automatically by Craig tech debt audit._",
  ].join("\n");
}

/**
 * Record all findings in the state component.
 *
 * Each finding becomes a State Finding with source "po-guardian"
 * and task "tech_debt_audit". If a GitHub issue was created,
 * the github_issue_url is included.
 */
async function recordFindings(
  findings: readonly ParsedFinding[],
  issueUrls: Map<number, string>,
  state: StatePort,
): Promise<void> {
  for (let i = 0; i < findings.length; i++) {
    const finding = findings[i]!;
    const issueUrl = issueUrls.get(i);

    const stateFinding: Finding = {
      id: crypto.randomUUID(),
      severity: finding.severity,
      category: finding.category,
      file: finding.file_line || undefined,
      issue: finding.issue,
      source: "po-guardian",
      detected_at: new Date().toISOString(),
      task: "tech_debt_audit",
      ...(issueUrl ? { github_issue_url: issueUrl } : {}),
    };
    state.addFinding(stateFinding);
  }

  await state.save();
}

/**
 * Map a ParsedFinding to the AnalyzerResult finding shape.
 */
function toResultFinding(
  finding: ParsedFinding,
): AnalyzerResult["findings"][number] {
  return {
    severity: finding.severity,
    category: finding.category,
    file: finding.file_line,
    issue: finding.issue,
    source: finding.source_justification,
    suggested_fix: finding.suggested_fix,
  };
}

/**
 * Build a failed AnalyzerResult.
 *
 * [CLEAN-CODE] Never throws — structured error response.
 */
function failResult(
  start: number,
  error: string,
  actions: readonly ActionTaken[] = [],
): AnalyzerResult {
  return {
    task: "tech_debt_audit",
    success: false,
    findings: [],
    actions_taken: actions,
    duration_ms: Date.now() - start,
    error,
  };
}
