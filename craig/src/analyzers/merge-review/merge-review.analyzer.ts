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

/** Short timestamp for log lines. */
function ts(): string {
  return new Date().toISOString().slice(11, 19);
}

// ---------------------------------------------------------------------------
// Factory Options
// ---------------------------------------------------------------------------

/** Dependencies required by the MergeReviewAnalyzer. */
export interface MergeReviewAnalyzerDeps {
  readonly copilot: CopilotPort;
  readonly github: GitHubPort;
  readonly state: StatePort;
  readonly parser: ResultParserPort;
  /** Optional: analyzer registry to trigger auto_develop after review. */
  readonly registry?: { get(name: string): AnalyzerPort | undefined };
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
        // Resolve SHA — use provided SHA or auto-detect latest merge
        let resolvedSha: string;
        if (mergeCtx.sha) {
          resolvedSha = mergeCtx.sha;
        } else {
          const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          console.error(`[Craig] merge_review: no SHA provided, looking for commits since ${since}`);
          const merges = await deps.github.getMergeCommits(since);
          if (merges.length > 0) {
            resolvedSha = merges[0]!.sha;
          } else {
            const commits = await deps.github.getLatestCommits(since);
            if (commits.length === 0) {
              return failResult(start, "No recent commits or merges found in last 7 days");
            }
            resolvedSha = commits[0]!.sha;
          }
        }

        // Step 1: Get diff
        console.error(`[Craig] [${ts()}] Fetching diff for commit ${resolvedSha.slice(0, 7)}...`);
        const { diff, truncated } = mergeCtx.diff
          ? truncateDiff(mergeCtx.diff)
          : await fetchAndTruncateDiff(resolvedSha, deps.github);
        console.error(`[Craig] [${ts()}] Diff fetched: ${diff.split("\n").length} lines${truncated ? " (truncated)" : ""}`);

        // Step 2: Invoke guardians in parallel
        console.error(`[Craig] [${ts()}] Invoking Security Guardian + Code Review Guardian in parallel...`);
        const [securityResult, codeReviewResult] = await Promise.all([
          deps.copilot.invoke({
            agent: "security-guardian",
            prompt: [
              "You are a security reviewer. Review the following code diff for security vulnerabilities.",
              "Do NOT delegate to any other agent or background task. Perform the review yourself, right now.",
              "Report ALL findings in this exact markdown table format:",
              "",
              "| # | Severity | Category | File:Line | Issue | Source & Justification | Suggested Fix |",
              "|---|----------|----------|-----------|-------|------------------------|---------------|",
              "",
              "Use severity levels: 🔴 CRITICAL, 🟠 HIGH, 🟡 MEDIUM, 🔵 LOW",
              "Check for: SQL injection, hardcoded secrets, command injection, XSS, insecure crypto, OWASP Top 10.",
              "If no issues found, write: '✅ No security issues found.'",
            ].join("\n"),
            context: diff,
          }).then(r => {
            console.error(`[Craig] [${ts()}] Security Guardian finished: success=${String(r.success)}, ${r.duration_ms}ms`);
            console.error(`[Craig] [${ts()}] Security output (first 500 chars): ${r.output.slice(0, 500)}`);
            return r;
          }),
          deps.copilot.invoke({
            agent: "code-review-guardian",
            prompt: [
              "You are a code quality reviewer. Review the following code diff for quality issues.",
              "Do NOT delegate to any other agent or background task. Perform the review yourself, right now.",
              "Report ALL findings in this exact markdown table format:",
              "",
              "| # | Severity | Category | File:Line | Issue | Source & Justification | Suggested Fix |",
              "|---|----------|----------|-----------|-------|------------------------|---------------|",
              "",
              "Use severity levels: 🔴 CRITICAL, 🟠 HIGH, 🟡 MEDIUM, 🔵 LOW",
              "Check for: SOLID violations, complexity, naming, error handling, missing tests, design issues.",
              "If no issues found, write: '✅ No quality issues found.'",
            ].join("\n"),
            context: diff,
          }).then(r => {
            console.error(`[Craig] [${ts()}] Code Review Guardian finished: success=${String(r.success)}, ${r.duration_ms}ms`);
            console.error(`[Craig] [${ts()}] Code Review output (first 500 chars): ${r.output.slice(0, 500)}`);
            return r;
          }),
        ]);

        // Step 3: Parse reports
        console.error(`[Craig] [${ts()}] Parsing Guardian reports...`);
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
        console.error(`[Craig] [${ts()}] Parsed: ${securityReport.findings.length} security + ${codeReviewReport.findings.length} code review = ${allFindings.length} total findings`);

        // Step 4: Post review comment
        console.error(`[Craig] [${ts()}] Posting review comment on commit ${resolvedSha.slice(0, 7)}...`);
        const comment = formatReviewComment({
          sha: resolvedSha.slice(0, 7),
          securityFindings: securityReport.findings,
          codeReviewFindings: codeReviewReport.findings,
          securityTimedOut: !securityResult.success,
          codeReviewTimedOut: !codeReviewResult.success,
          diffTruncated: truncated,
        });

        const commentRef = await deps.github.createCommitComment(
          resolvedSha,
          comment,
        );
        actions.push({
          type: "comment_added",
          url: commentRef.url,
          description: "Merge review comment posted",
        });
        console.error(`[Craig] [${ts()}] Comment posted: ${commentRef.url}`);

        // Step 5: Create issues for critical/high findings (via PO Guardian)
        const issueActions = await createIssuesForSevereFindings(
          allFindings,
          securityReport.guardian,
          deps.github,
          deps.copilot,
        );
        actions.push(...issueActions);
        if (issueActions.length > 0) {
          console.error(`[Craig] [${ts()}] Created ${issueActions.length} issues for critical/high findings`);
        }

        // Step 6: Store findings in state
        await recordFindings(allFindings, deps.state);
        console.error(`[Craig] [${ts()}] Merge review complete: ${allFindings.length} findings, ${actions.length} actions`);

        // Step 7: Trigger auto_develop for critical/high findings
        const severeCount = allFindings.filter(f => ISSUE_WORTHY_SEVERITIES.has(f.severity)).length;
        if (severeCount > 0 && deps.registry) {
          const autoDevelop = deps.registry.get("auto_develop");
          if (autoDevelop) {
            console.error(`[Craig] [${ts()}] Triggering auto_develop for ${severeCount} critical/high findings...`);
            const devContext: AnalyzerContext = {
              task: "auto_develop",
              taskId: `${context.taskId}-autodev`,
              timestamp: new Date().toISOString(),
            };
            const devResult = await autoDevelop.execute(devContext);
            console.error(`[Craig] [${ts()}] auto_develop: ${devResult.summary}`);
            actions.push(...devResult.actions);
          }
        }

        return {
          success: true,
          summary: `Merge review of ${resolvedSha.slice(0, 7)}: ${allFindings.length} findings`,
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
 * Fetch diff from GitHub and truncate if needed.
 */
async function fetchAndTruncateDiff(
  sha: string,
  github: GitHubPort,
): Promise<{ diff: string; truncated: boolean }> {
  const commitDiff: CommitDiff = await github.getCommitDiff(sha);
  const diff = buildDiffText(commitDiff);
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

/** Create GitHub issues for critical/high findings via PO Guardian. */
async function createIssuesForSevereFindings(
  findings: readonly ParsedFinding[],
  source: string,
  github: GitHubPort,
  copilot?: CopilotPort,
): Promise<ActionTaken[]> {
  const actions: ActionTaken[] = [];
  const severeFindings = findings.filter(f => ISSUE_WORTHY_SEVERITIES.has(f.severity));

  if (severeFindings.length === 0) {
    return actions;
  }

  for (const finding of severeFindings) {
    const title = `[Craig] ${finding.severity.toUpperCase()}: ${finding.issue}`;
    const existing = await github.findExistingIssue(title);

    if (existing) {
      console.error(`[Craig] [${ts()}] Issue already exists: ${title}`);
      continue;
    }

    // Try PO Guardian for rich ticket, fall back to basic template
    let body: string;
    if (copilot) {
      console.error(`[Craig] [${ts()}] Invoking PO Guardian for issue: ${finding.issue}`);
      const poResult = await copilot.invoke({
        agent: "po-guardian",
        prompt: [
          "Write a GitHub issue ticket for the following finding from a merge review.",
          "Include: summary, acceptance criteria, technical context, and suggested fix.",
          "Format as a proper GitHub issue body in markdown.",
          "",
          `Severity: ${finding.severity.toUpperCase()}`,
          `Category: ${finding.category}`,
          `File: ${finding.file_line || "N/A"}`,
          `Source: ${source}`,
          `Issue: ${finding.issue}`,
          `Justification: ${finding.source_justification}`,
          `Suggested Fix: ${finding.suggested_fix}`,
        ].join("\n"),
      });

      if (poResult.success && poResult.output.trim().length > 50) {
        body = poResult.output;
        console.error(`[Craig] [${ts()}] PO Guardian wrote ticket (${body.length} chars)`);
      } else {
        console.error(`[Craig] [${ts()}] PO Guardian failed, using basic template`);
        body = buildIssueBody(finding, source);
      }
    } else {
      body = buildIssueBody(finding, source);
    }

    const issue = await github.createIssue({
      title,
      body,
      labels: ["craig", source],
    });

    actions.push({
      type: "issue_created",
      url: issue.url,
      description: `Created issue for ${finding.severity} finding: ${finding.issue}`,
    });
    console.error(`[Craig] [${ts()}] Issue created: ${issue.url}`);
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
