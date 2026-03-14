/**
 * MergeReviewAnalyzer — Orchestrates post-merge Guardian reviews.
 *
 * Flow: get diff → invoke Security + Code Review Guardians (parallel) →
 *       parse reports → post review comment → create issues for critical/high →
 *       store findings in state.
 *
 * [HEXAGONAL] Depends only on port interfaces — no direct imports of adapters.
 * [CLEAN-CODE] Never throws — returns { success: false, error } on failure.
 * [SRP] Orchestration only — formatting delegated to comment-formatter.
 *
 * @module analyzers/merge-review
 */

import type { CopilotPort, InvokeResult } from "../../copilot/index.js";
import type { GitHubPort, CommitDiff } from "../../github/index.js";
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
import { formatReviewComment } from "./comment-formatter.js";

// ---------------------------------------------------------------------------
// Extended Context — merge-review needs SHA + diff beyond base context
// ---------------------------------------------------------------------------

/**
 * Extended context for merge-review analysis.
 *
 * [CLEAN-ARCH] Extends the shared AnalyzerContext with merge-specific
 * fields. Tool-handlers populate these when dispatching merge tasks.
 */
export interface MergeReviewContext extends AnalyzerContext {
  /** Commit SHA for merge-triggered tasks. */
  readonly sha?: string;
  /** Raw diff text for merge-triggered tasks. */
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

/** Dependencies required by the MergeReviewAnalyzer. */
export interface MergeReviewAnalyzerDeps {
  readonly copilot: CopilotPort;
  readonly github: GitHubPort;
  readonly state: StatePort;
  readonly parser: ResultParserPort;
}

// ---------------------------------------------------------------------------
// Factory Function
// ---------------------------------------------------------------------------

/**
 * Create a MergeReviewAnalyzer instance.
 *
 * [CLEAN-ARCH] Factory function — composition root creates and injects deps.
 *
 * @param deps - Port dependencies (copilot, github, state, parser)
 * @returns AnalyzerPort implementation for merge reviews
 */
export function createMergeReviewAnalyzer(
  deps: MergeReviewAnalyzerDeps,
): AnalyzerPort {
  return {
    name: "merge_review",

    async execute(context: AnalyzerContext): Promise<AnalyzerResult> {
      const start = Date.now();
      const actions: ActionTaken[] = [];
      const mergeCtx = context as MergeReviewContext;

      try {
        // Validate input
        if (!mergeCtx.sha) {
          return failResult(start, "Missing SHA in analyzer context");
        }

        // Step 1: Get diff
        const { diff, truncated } = await resolveDiff(
          mergeCtx,
          deps.github,
        );

        // Step 2: Invoke guardians in parallel
        const [securityResult, codeReviewResult] = await Promise.all([
          deps.copilot.invoke({
            agent: "security-guardian",
            prompt:
              "Perform a security review of the following merge diff. Report all findings.",
            context: diff,
          }),
          deps.copilot.invoke({
            agent: "code-review-guardian",
            prompt:
              "Perform a code quality review of the following merge diff. Report all findings.",
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

        // Step 4: Post review comment
        const comment = formatReviewComment({
          sha: mergeCtx.sha.slice(0, 7),
          securityFindings: securityReport.findings,
          codeReviewFindings: codeReviewReport.findings,
          securityTimedOut: !securityResult.success,
          codeReviewTimedOut: !codeReviewResult.success,
          diffTruncated: truncated,
        });

        const commentRef = await deps.github.createCommitComment(
          mergeCtx.sha,
          comment,
        );
        actions.push({
          type: "comment_added",
          url: commentRef.url,
          description: "Merge review comment posted",
        });

        // Step 5: Create issues for critical/high findings
        const issueActions = await createIssuesForSevereFindings(
          allFindings,
          securityReport.guardian,
          deps.github,
        );
        actions.push(...issueActions);

        // Step 6: Store findings in state
        await recordFindings(allFindings, deps.state);

        return {
          success: true,
          summary: `Merge review of ${mergeCtx.sha.slice(0, 7)}: ${allFindings.length} findings`,
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
  context: MergeReviewContext,
  github: GitHubPort,
): Promise<{ diff: string; truncated: boolean }> {
  let diff: string;

  if (context.diff) {
    diff = context.diff;
  } else {
    const commitDiff: CommitDiff = await github.getCommitDiff(context.sha!);
    diff = buildDiffText(commitDiff);
  }

  return truncateDiff(diff);
}

/** Build a unified diff string from CommitDiff files. */
function buildDiffText(commitDiff: CommitDiff): string {
  return commitDiff.files
    .map((file) => {
      const header = `--- ${file.filename} (${file.status}: +${file.additions}/-${file.deletions})`;
      return file.patch ? `${header}\n${file.patch}` : header;
    })
    .join("\n\n");
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
  source: string,
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
      body: buildIssueBody(finding, source),
      labels: ["craig", source],
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
function buildIssueBody(finding: ParsedFinding, source: string): string {
  return [
    `## Finding`,
    "",
    `**Severity:** ${finding.severity.toUpperCase()}`,
    `**Category:** ${finding.category}`,
    `**File:** ${finding.file_line || "N/A"}`,
    `**Source:** ${source}`,
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
    "_Created automatically by Craig merge review._",
  ].join("\n");
}

/** Record all findings in the state. */
async function recordFindings(
  findings: readonly ParsedFinding[],
  state: StatePort,
): Promise<void> {
  for (const finding of findings) {
    const stateFinding: Finding = {
      id: crypto.randomUUID(),
      severity: finding.severity,
      category: finding.category,
      file: finding.file_line || undefined,
      issue: finding.issue,
      source: "merge_review",
      detected_at: new Date().toISOString(),
      task: "merge_review",
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
    summary: `Merge review failed: ${error}`,
    findings: [],
    actions: [...actions],
    duration_ms: Date.now() - start,
  };
}
