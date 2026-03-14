/**
 * PrReviewAnalyzer — Orchestrates PR Guardian reviews.
 *
 * Flow: get PR diff → sanitize → invoke Security + Code Review Guardians
 *       (parallel) → parse reports → post PR review comment →
 *       create issues for critical/high → store findings in state →
 *       update last_reviewed_prs.
 *
 * [HEXAGONAL] Depends only on port interfaces — no direct imports of adapters.
 * [CLEAN-CODE] Never throws — returns { success: false, error } on failure.
 * [SRP] Orchestration only — formatting delegated to pr-comment-formatter.
 *
 * @module analyzers/pr-review
 */

import type { CopilotPort, InvokeResult } from "../../copilot/index.js";
import type { GitHubPort } from "../../github/index.js";
import type { StatePort, Finding } from "../../state/index.js";
import type {
  ResultParserPort,
  ParsedFinding,
  ParsedReport,
} from "../../result-parser/index.js";
import type { AnalyzerPort } from "../analyzer.port.js";
import type {
  AnalyzerContext,
  AnalyzerResult,
  AnalyzerFinding,
  ActionTaken,
} from "../analyzer.types.js";
import { formatPrReviewComment } from "./pr-comment-formatter.js";

// ---------------------------------------------------------------------------
// Extended Context — pr-review needs PR info beyond base context
// ---------------------------------------------------------------------------

/**
 * Extended context for PR review analysis.
 *
 * [CLEAN-ARCH] Extends the shared AnalyzerContext with PR-specific
 * fields. The PR watcher populates these when dispatching review tasks.
 */
export interface PrReviewContext extends AnalyzerContext {
  /** Pull request number. */
  readonly pr_number: number;
  /** Head commit SHA. */
  readonly head_sha: string;
  /** PR title. */
  readonly pr_title: string;
  /** PR author login. */
  readonly pr_author: string;
  /** Pre-fetched diff text (optional — if absent, fetched via GitHubPort). */
  readonly diff?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of lines in a diff before truncation. */
const MAX_DIFF_LINES = 5_000;

/** Severity levels that trigger automatic GitHub issue creation. */
const ISSUE_WORTHY_SEVERITIES = new Set(["critical", "high"]);

// ---------------------------------------------------------------------------
// Factory Options
// ---------------------------------------------------------------------------

/** Dependencies required by the PrReviewAnalyzer. */
export interface PrReviewAnalyzerDeps {
  readonly copilot: CopilotPort;
  readonly github: GitHubPort;
  readonly state: StatePort;
  readonly parser: ResultParserPort;
}

// ---------------------------------------------------------------------------
// Factory Function
// ---------------------------------------------------------------------------

/**
 * Create a PrReviewAnalyzer instance.
 *
 * [CLEAN-ARCH] Factory function — composition root creates and injects deps.
 *
 * @param deps - Port dependencies (copilot, github, state, parser)
 * @returns AnalyzerPort implementation for PR reviews
 */
export function createPrReviewAnalyzer(
  deps: PrReviewAnalyzerDeps,
): AnalyzerPort {
  return {
    name: "pr_review",

    async execute(context: AnalyzerContext): Promise<AnalyzerResult> {
      const start = Date.now();
      const actions: ActionTaken[] = [];
      const prCtx = context as PrReviewContext;

      try {
        // Validate input
        if (!prCtx.pr_number || !prCtx.head_sha) {
          return failResult(start, "Missing pr_number or head_sha in analyzer context");
        }

        // Step 1: Get diff
        const { diff, truncated } = await resolveDiff(prCtx, deps.github);

        // Step 2: Invoke guardians in parallel
        const [securityResult, codeReviewResult] = await Promise.all([
          deps.copilot.invoke({
            agent: "security-guardian",
            prompt:
              "Perform a security review of the following pull request diff. Report all findings.",
            context: diff,
          }),
          deps.copilot.invoke({
            agent: "code-review-guardian",
            prompt:
              "Perform a code quality review of the following pull request diff. Report all findings.",
            context: diff,
          }),
        ]);

        // Step 3: Parse reports
        const securityReport = parseIfSuccessful(
          securityResult,
          "security",
          deps.parser,
        );
        const codeReviewReport = parseIfSuccessful(
          codeReviewResult,
          "code-review",
          deps.parser,
        );

        const allFindings = [
          ...securityReport.findings,
          ...codeReviewReport.findings,
        ];

        // Step 4: Post PR review
        const comment = formatPrReviewComment({
          pr_number: prCtx.pr_number,
          pr_title: prCtx.pr_title,
          head_sha: prCtx.head_sha.slice(0, 7),
          securityFindings: securityReport.findings,
          codeReviewFindings: codeReviewReport.findings,
          securityTimedOut: !securityResult.success,
          codeReviewTimedOut: !codeReviewResult.success,
          diffTruncated: truncated,
        });

        const reviewRef = await deps.github.postPRReview({
          pull_number: prCtx.pr_number,
          body: comment,
          event: "COMMENT",
        });
        actions.push({
          type: "comment_added",
          url: reviewRef.url,
          description: `PR review posted on #${prCtx.pr_number}`,
        });

        // Step 5: Create issues for critical/high findings
        const issueActions = await createIssuesForSevereFindings(
          allFindings,
          prCtx.pr_number,
          deps.github,
        );
        actions.push(...issueActions);

        // Step 6: Store findings in state
        await recordFindings(allFindings, prCtx.pr_number, deps.state);

        // Step 7: Update last_reviewed_prs state
        const reviewedPRs = deps.state.get("last_reviewed_prs");
        deps.state.set("last_reviewed_prs", {
          ...reviewedPRs,
          [String(prCtx.pr_number)]: prCtx.head_sha,
        });
        await deps.state.save();

        return {
          success: true,
          summary: `PR #${prCtx.pr_number} review: ${allFindings.length} findings`,
          findings: allFindings.map(toAnalyzerFinding),
          actions,
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
 * Resolve the diff text from context or GitHub API.
 * Truncates large diffs to MAX_DIFF_LINES lines.
 */
async function resolveDiff(
  context: PrReviewContext,
  github: GitHubPort,
): Promise<{ diff: string; truncated: boolean }> {
  let diff: string;

  if (context.diff) {
    diff = context.diff;
  } else {
    diff = await github.getPRDiff(context.pr_number);
  }

  return truncateDiff(diff);
}

/** Truncate diff to MAX_DIFF_LINES if needed. */
function truncateDiff(diff: string): { diff: string; truncated: boolean } {
  const lines = diff.split("\n");
  if (lines.length <= MAX_DIFF_LINES) {
    return { diff, truncated: false };
  }
  return {
    diff: lines.slice(0, MAX_DIFF_LINES).join("\n"),
    truncated: true,
  };
}

/** Parse an invoke result if successful; return empty findings if not. */
function parseIfSuccessful(
  result: InvokeResult,
  guardianType: "security" | "code-review",
  parser: ResultParserPort,
): ParsedReport {
  if (result.success) {
    return parser.parse(result.output, guardianType);
  }
  return {
    guardian: guardianType,
    summary: "",
    findings: [],
    recommended_actions: [],
    raw: "",
  };
}

/** Create GitHub issues for critical/high findings, checking for duplicates. */
async function createIssuesForSevereFindings(
  findings: readonly ParsedFinding[],
  prNumber: number,
  github: GitHubPort,
): Promise<ActionTaken[]> {
  const actions: ActionTaken[] = [];

  for (const finding of findings) {
    if (!ISSUE_WORTHY_SEVERITIES.has(finding.severity)) {
      continue;
    }

    const title = `[Craig] ${finding.severity.toUpperCase()}: ${finding.issue}`;
    const existing = await github.findExistingIssue(title);

    if (existing) {
      continue;
    }

    const issue = await github.createIssue({
      title,
      body: buildIssueBody(finding, prNumber),
      labels: ["craig", "pr-review"],
    });

    actions.push({
      type: "issue_created",
      url: issue.url,
      description: `Created issue for ${finding.severity} finding: ${finding.issue}`,
    });
  }

  return actions;
}

/** Build the body for a GitHub issue from a finding. */
function buildIssueBody(finding: ParsedFinding, prNumber: number): string {
  return [
    `## Finding`,
    "",
    `**Severity:** ${finding.severity.toUpperCase()}`,
    `**Category:** ${finding.category}`,
    `**File:** ${finding.file_line || "N/A"}`,
    `**Source:** PR #${prNumber}`,
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
    `_Created automatically by Craig PR review on PR #${prNumber}._`,
  ].join("\n");
}

/** Record all findings in the state. */
async function recordFindings(
  findings: readonly ParsedFinding[],
  prNumber: number,
  state: StatePort,
): Promise<void> {
  for (const finding of findings) {
    const stateFinding: Finding = {
      id: crypto.randomUUID(),
      severity: finding.severity,
      category: finding.category,
      file: finding.file_line || undefined,
      issue: finding.issue,
      source: "pr_review",
      detected_at: new Date().toISOString(),
      task: `pr_review_#${prNumber}`,
    };
    state.addFinding(stateFinding);
  }

  await state.save();
}

/** Map a ParsedFinding to the shared AnalyzerFinding shape. */
function toAnalyzerFinding(finding: ParsedFinding): AnalyzerFinding {
  return {
    severity: finding.severity,
    category: finding.category,
    file: finding.file_line || undefined,
    issue: finding.issue,
    source: finding.source_justification,
    suggested_fix: finding.suggested_fix,
  };
}

/** Build a failed AnalyzerResult. */
function failResult(
  start: number,
  error: string,
  actions: readonly ActionTaken[] = [],
): AnalyzerResult {
  return {
    success: false,
    summary: `PR review failed: ${error}`,
    findings: [],
    actions: [...actions],
    duration_ms: Date.now() - start,
  };
}
