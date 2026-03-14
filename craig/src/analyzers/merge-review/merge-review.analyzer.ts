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
import type { GitPort } from "../../git-port/git.port.js";
import type { CommitDiff } from "../../github/index.js";
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
import {
  gatherProjectContext,
  parseClassification,
  buildClassificationPrompt,
} from "./project-context.js";
import type { ProjectContext, FindingClassification } from "./project-context.js";

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

/** Minimum output length from PO Guardian to use as a rich ticket body. */
const MIN_PO_TICKET_LENGTH = 50;

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
  readonly github: GitPort;
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
            console.error(`[Craig] [${ts()}] Security Guardian finished: success=${String(r.success)}, ${r.duration_ms}ms, output_length=${r.output.length}`);
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
            console.error(`[Craig] [${ts()}] Code Review Guardian finished: success=${String(r.success)}, ${r.duration_ms}ms, output_length=${r.output.length}`);
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
        console.error(`[Craig] [${ts()}] Gathering project context for scope classification...`);
        const projectContext = await gatherProjectContext(deps.github);
        console.error(`[Craig] [${ts()}] Project context: primary=${projectContext.primaryLanguage}, languages=${Object.keys(projectContext.languages).join(",")}`);

        const { actions: issueActions, inScopeCount } = await createIssuesForSevereFindings(
          allFindings,
          securityReport.guardian,
          resolvedSha,
          deps.github,
          deps.copilot,
          projectContext,
        );
        actions.push(...issueActions);
        if (issueActions.length > 0) {
          console.error(`[Craig] [${ts()}] Created ${issueActions.length} actions for critical/high findings (${inScopeCount} in-scope)`);
        }

        // Step 6: Store findings in state
        await recordFindings(allFindings, deps.state);
        console.error(`[Craig] [${ts()}] Merge review complete: ${allFindings.length} findings, ${actions.length} actions`);

        // Step 7: Trigger auto_develop only for IN_SCOPE findings
        if (inScopeCount > 0 && deps.registry) {
          const autoDevelop = deps.registry.get("auto_develop");
          if (autoDevelop) {
            console.error(`[Craig] [${ts()}] Triggering auto_develop for ${inScopeCount} in-scope critical/high findings...`);
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
  github: GitPort,
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

/** Create GitHub issues for critical/high findings via PO Guardian with scope classification. */
async function createIssuesForSevereFindings(
  findings: readonly ParsedFinding[],
  source: string,
  sha: string,
  github: GitPort,
  copilot: CopilotPort | undefined,
  projectContext: ProjectContext,
): Promise<{ actions: ActionTaken[]; inScopeCount: number }> {
  const actions: ActionTaken[] = [];
  let inScopeCount = 0;
  const severeFindings = findings.filter(f => ISSUE_WORTHY_SEVERITIES.has(f.severity));

  if (severeFindings.length === 0) {
    return { actions, inScopeCount };
  }

  for (const finding of severeFindings) {
    const title = `[Craig] ${finding.severity.toUpperCase()}: ${finding.issue}`;
    const existing = await github.findExistingIssue(title);

    if (existing) {
      console.error(`[Craig] [${ts()}] Issue already exists: ${title}`);
      continue;
    }

    // Classify finding scope via PO Guardian
    const classification = await classifyFinding(finding, projectContext, copilot);
    console.error(`[Craig] [${ts()}] Classification for "${finding.issue}": ${classification}`);

    if (classification === "IN_SCOPE") {
      // IN_SCOPE: Create fix ticket (existing behavior)
      inScopeCount++;
      const body = await buildTicketBody(finding, source, copilot);
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
      console.error(`[Craig] [${ts()}] Issue created (IN_SCOPE): ${issue.url}`);
    } else {
      // QUESTIONABLE or OUT_OF_SCOPE: Post commit comment + clarification issue
      const commentBody = classification === "QUESTIONABLE"
        ? buildQuestionableComment(finding)
        : buildOutOfScopeComment(finding);

      const commentRef = await github.createCommitComment(sha, commentBody);
      actions.push({
        type: "comment_added",
        url: commentRef.url,
        description: `Posted ${classification} comment for: ${finding.issue}`,
      });
      console.error(`[Craig] [${ts()}] Commit comment posted (${classification}): ${commentRef.url}`);

      // Create clarification issue (not for auto_develop)
      const clarificationBody = buildClarificationIssueBody(finding, source, classification);
      const issue = await github.createIssue({
        title,
        body: clarificationBody,
        labels: ["craig", source, "craig:needs-clarification"],
      });

      actions.push({
        type: "issue_created",
        url: issue.url,
        description: `Created clarification issue (${classification}) for: ${finding.issue}`,
      });
      console.error(`[Craig] [${ts()}] Clarification issue created (${classification}): ${issue.url}`);
    }
  }

  return { actions, inScopeCount };
}

/**
 * Classify a finding's scope via PO Guardian.
 *
 * Sends the finding + project context to PO Guardian and parses the
 * classification response. Defaults to IN_SCOPE if PO Guardian is
 * unavailable or returns an unparseable response.
 *
 * [CLEAN-CODE] Never throws — returns IN_SCOPE on any failure.
 */
async function classifyFinding(
  finding: ParsedFinding,
  projectContext: ProjectContext,
  copilot: CopilotPort | undefined,
): Promise<FindingClassification> {
  if (!copilot) {
    return "IN_SCOPE";
  }

  try {
    console.error(`[Craig] [${ts()}] Classifying finding: ${finding.issue}`);
    const prompt = buildClassificationPrompt(finding, projectContext);
    const result = await copilot.invoke({
      agent: "po-guardian",
      prompt,
    });

    if (result.success) {
      return parseClassification(result.output);
    }

    console.error(`[Craig] [${ts()}] PO Guardian classification failed, defaulting to IN_SCOPE`);
    return "IN_SCOPE";
  } catch {
    console.error(`[Craig] [${ts()}] PO Guardian classification error, defaulting to IN_SCOPE`);
    return "IN_SCOPE";
  }
}

/**
 * Build issue body via PO Guardian or fallback template.
 *
 * [CLEAN-CODE] Extracted from createIssuesForSevereFindings for clarity.
 */
async function buildTicketBody(
  finding: ParsedFinding,
  source: string,
  copilot: CopilotPort | undefined,
): Promise<string> {
  if (!copilot) {
    return buildIssueBody(finding, source);
  }

  console.error(`[Craig] [${ts()}] Invoking PO Guardian for issue: ${finding.issue}`);
  const findingContext = [
    `Severity: ${finding.severity.toUpperCase()}`,
    `Category: ${finding.category}`,
    `File: ${finding.file_line || "N/A"}`,
    `Source: ${source}`,
    `Issue: ${finding.issue}`,
    `Justification: ${finding.source_justification}`,
    `Suggested Fix: ${finding.suggested_fix}`,
  ].join("\n");

  const poResult = await copilot.invoke({
    agent: "po-guardian",
    prompt: [
      "Write a GitHub issue ticket for the following finding from a merge review.",
      "Include: summary, acceptance criteria, technical context, and suggested fix.",
      "Format as a proper GitHub issue body in markdown.",
      "The finding details are provided in the context below.",
    ].join("\n"),
    context: findingContext,
  });

  if (poResult.success && poResult.output.trim().length > MIN_PO_TICKET_LENGTH) {
    console.error(`[Craig] [${ts()}] PO Guardian wrote ticket (${poResult.output.length} chars)`);
    return poResult.output;
  }

  console.error(`[Craig] [${ts()}] PO Guardian failed, using basic template`);
  return buildIssueBody(finding, source);
}

/** Build commit comment for QUESTIONABLE findings. */
function buildQuestionableComment(finding: ParsedFinding): string {
  return [
    `## 🤔 Craig — Needs Clarification`,
    "",
    `A ${finding.severity.toUpperCase()} finding was detected but its relevance to this project is unclear.`,
    "",
    `**Finding:** ${finding.issue}`,
    `**File:** ${finding.file_line || "N/A"}`,
    `**Category:** ${finding.category}`,
    "",
    `**Question for the author:** Does this file belong in this project? ` +
      `If so, the finding should be addressed. If not, consider removing the file.`,
    "",
    `_Craig created an issue tagged \`craig:needs-clarification\` for tracking._`,
  ].join("\n");
}

/** Build commit comment for OUT_OF_SCOPE findings. */
function buildOutOfScopeComment(finding: ParsedFinding): string {
  return [
    `## ⚠️ Craig — Out of Scope File Detected`,
    "",
    `A ${finding.severity.toUpperCase()} finding was detected in a file that appears ` +
      `to not belong in this project.`,
    "",
    `**Finding:** ${finding.issue}`,
    `**File:** ${finding.file_line || "N/A"}`,
    `**Category:** ${finding.category}`,
    "",
    `**Recommendation:** This file does not match the project's language/technology stack. ` +
      `Consider removing it or moving it to the appropriate repository.`,
    "",
    `_Craig created an issue tagged \`craig:needs-clarification\` for tracking._`,
  ].join("\n");
}

/** Build clarification issue body for QUESTIONABLE/OUT_OF_SCOPE findings. */
function buildClarificationIssueBody(
  finding: ParsedFinding,
  source: string,
  classification: FindingClassification,
): string {
  const statusLabel = classification === "QUESTIONABLE" ? "🤔 Questionable" : "⚠️ Out of Scope";
  return [
    `## ${statusLabel} Finding — Needs Clarification`,
    "",
    `Craig detected a ${finding.severity.toUpperCase()} finding but classified it as **${classification}**.`,
    `Human review is needed before taking action.`,
    "",
    `### Finding`,
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
    `### Why ${classification}?`,
    classification === "QUESTIONABLE"
      ? "The file or finding's relevance to this project is unclear. The commit author should clarify."
      : "The file does not appear to match the project's language or technology stack. Consider removing it.",
    "",
    "---",
    `_Created automatically by Craig merge review. **Not queued for auto_develop** — awaiting human input._`,
  ].join("\n");
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
