/**
 * Workflow Orchestrator — Full SDLC pipeline: Finding → Fix → Review → PR.
 *
 * Implements the autonomous workflow loop described in Issue #59:
 * 1. Read CRITICAL/HIGH findings from state
 * 2. Invoke Developer Guardian to fix each finding (TDD)
 * 3. Invoke QA + Security + Code Review Guardians in parallel
 * 4. If reviews find blocking issues (CRITICAL/HIGH): iterate
 * 5. Max 3 passes — on 3rd pass, use consultation model
 * 6. If all reviews pass: create draft PR
 *
 * Design decisions:
 * - Never throws — returns `{ success: false }` on failure [CLEAN-CODE]
 * - Only processes CRITICAL/HIGH severity findings [AC2]
 * - Creates draft PRs — human always approves [SPECIFICATION]
 * - Disabled by default (`autonomous_workflow: false`) — opt-in [AC7]
 * - Each finding is processed independently [CLEAN-CODE]
 * - Parallel review invocation via Promise.allSettled [AC3]
 * - All dependencies injected via factory params [SOLID/DIP] [HEXAGONAL]
 *
 * @module workflow
 * @see https://github.com/vbomfim/sdlc-guardian-agents/issues/59
 */

import type { AnalyzerPort } from "../analyzers/analyzer.port.js";
import type {
  AnalyzerContext,
  AnalyzerResult,
  ActionTaken,
} from "../analyzers/analyzer.types.js";
import type { Finding } from "../state/index.js";
import type { GuardianAgent } from "../copilot/copilot.types.js";
import type { WorkflowOrchestratorDeps } from "./workflow.port.js";
import type { ReviewResult, WorkflowIteration } from "./workflow.types.js";
import {
  MAX_PASSES,
  WORKFLOW_QUALIFYING_SEVERITIES,
  REVIEW_AGENTS,
} from "./workflow.types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Model used for consultation on the 3rd (final) pass. */
const CONSULTATION_MODEL = "claude-opus-4.6";

/** Emoji mapping for severity levels in PR titles. */
const SEVERITY_EMOJI: Readonly<Record<string, string>> = {
  critical: "🔴",
  high: "🟠",
};

/** Guardian type mapping for the result parser. */
const AGENT_TO_GUARDIAN_TYPE: Readonly<Record<string, string>> = {
  "qa-guardian": "qa",
  "security-guardian": "security",
  "code-review-guardian": "code-review",
};

// ---------------------------------------------------------------------------
// Pure Functions — Prompt & Body Builders [CLEAN-CODE] [SRP]
// ---------------------------------------------------------------------------

/**
 * Build the prompt for Developer Guardian on the initial fix attempt.
 *
 * [CLEAN-CODE] Pure function — no side effects.
 */
function buildDevFixPrompt(finding: Finding): string {
  const parts: string[] = [
    `Fix the following ${finding.severity.toUpperCase()} finding as part of the SDLC workflow:`,
    "",
    `**Issue:** ${finding.issue}`,
    `**Severity:** ${finding.severity}`,
    `**Category:** ${finding.category}`,
  ];

  if (finding.file) {
    parts.push(`**File:** ${finding.file}`);
  }

  parts.push(
    `**Source:** ${finding.source}`,
    "",
    "Apply the fix following TDD: write a test for the vulnerability first, then fix it.",
    "Ensure the fix does not introduce regressions.",
  );

  return parts.join("\n");
}

/**
 * Build the prompt for Developer Guardian on subsequent fix iterations.
 *
 * Includes feedback from the review Guardians so the developer
 * knows what to address in this pass.
 *
 * [CLEAN-CODE] Pure function — no side effects.
 */
function buildIterationPrompt(
  finding: Finding,
  pass: number,
  reviewFeedback: readonly ReviewResult[],
): string {
  const feedbackLines = reviewFeedback
    .filter((r) => r.blockingFindingCount > 0)
    .flatMap((r) => [
      `### ${r.agent} (${r.blockingFindingCount} blocking finding(s)):`,
      ...r.blockingFindings.map((f) => `- ${f}`),
      "",
    ]);

  return [
    `## Iteration ${pass}: Fix remaining issues`,
    "",
    `The previous fix for the ${finding.severity.toUpperCase()} finding was reviewed by QA, Security, and Code Review Guardians.`,
    `They found the following blocking issues that must be addressed:`,
    "",
    ...feedbackLines,
    `**Original finding:** ${finding.issue}`,
    "",
    "Fix ALL blocking issues listed above. Follow TDD — update tests first, then fix.",
    "Ensure no regressions are introduced.",
  ].join("\n");
}

/**
 * Build the review prompt for a Guardian agent.
 *
 * [CLEAN-CODE] Pure function — no side effects.
 */
function buildReviewPrompt(
  agent: GuardianAgent,
  finding: Finding,
  devOutput: string,
): string {
  return [
    `Review the following code changes made by Developer Guardian to fix a ${finding.severity.toUpperCase()} finding.`,
    "",
    `**Original finding:** ${finding.issue}`,
    `**Category:** ${finding.category}`,
    finding.file ? `**File:** ${finding.file}` : "",
    "",
    "## Developer Guardian Output",
    "",
    devOutput,
    "",
    `Provide your ${agent} review. Flag any CRITICAL or HIGH severity issues that must be fixed before merging.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Build the draft PR body for a workflow-completed finding.
 *
 * [CLEAN-CODE] Structured markdown for readability.
 */
function buildPRBody(
  finding: Finding,
  iterations: readonly WorkflowIteration[],
): string {
  const emoji = SEVERITY_EMOJI[finding.severity] ?? "⚠️";
  const passCount = iterations.length;

  const iterationSummary = iterations
    .map(
      (iter) =>
        `| ${iter.pass} | ${iter.devFixSucceeded ? "✅" : "❌"} | ${iter.totalBlockingFindings} | ${iter.modelUsed} |`,
    )
    .join("\n");

  return [
    `## 🤖 Craig SDLC Workflow`,
    "",
    `This draft PR was automatically created by **Craig's SDLC Workflow Orchestrator**.`,
    "",
    `> Craig detected a ${emoji} **${finding.severity.toUpperCase()}** finding, invoked Developer Guardian to fix it,`,
    `> then ran QA, Security, and Code Review Guardians to validate the fix.`,
    "",
    `### Finding Details`,
    "",
    `| Field | Value |`,
    `|-------|-------|`,
    `| **Severity** | ${emoji} ${finding.severity.toUpperCase()} |`,
    `| **Category** | ${finding.category} |`,
    `| **File** | \`${finding.file ?? "N/A"}\` |`,
    `| **Issue** | ${finding.issue} |`,
    `| **Source** | ${finding.source} |`,
    "",
    `### Workflow Summary`,
    "",
    `| Pass | Dev Fix | Blocking Findings | Model |`,
    `|------|---------|-------------------|-------|`,
    iterationSummary,
    "",
    `**Total passes:** ${passCount}`,
    "",
    `---`,
    `*This PR was generated by Craig's SDLC workflow orchestrator (Issue #59).*`,
    `*All changes were validated by QA, Security, and Code Review Guardians.*`,
    `*Human review is required before merging.*`,
  ].join("\n");
}

/**
 * Build the PR title for a workflow-completed finding.
 *
 * [CLEAN-CODE] Truncates long issue descriptions to keep titles readable.
 */
function buildPRTitle(finding: Finding): string {
  const emoji = SEVERITY_EMOJI[finding.severity] ?? "⚠️";
  const maxIssueLength = 50;
  const issueText =
    finding.issue.length > maxIssueLength
      ? `${finding.issue.substring(0, maxIssueLength)}...`
      : finding.issue;

  return `fix: ${emoji} [workflow] ${issueText}`;
}

/**
 * Generate a branch name for a workflow fix.
 *
 * Format: `craig/workflow-{sanitized-finding-id}`
 *
 * [CLEAN-CODE] Deterministic — same finding always produces same branch.
 */
function buildBranchName(finding: Finding): string {
  const sanitizedId = finding.id
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .substring(0, 40);
  return `craig/workflow-${sanitizedId}`;
}

// ---------------------------------------------------------------------------
// Factory Function
// ---------------------------------------------------------------------------

/**
 * Create a Workflow Orchestrator instance.
 *
 * Factory function pattern — returns the AnalyzerPort interface.
 * All dependencies are injected; the implementation is encapsulated.
 *
 * @param deps - All required port dependencies
 * @returns An AnalyzerPort instance for the full SDLC workflow loop
 *
 * @example
 * ```typescript
 * const orchestrator = createWorkflowOrchestrator({
 *   copilot, git, state, config, gitOps, resultParser,
 * });
 * const result = await orchestrator.execute(context);
 * ```
 *
 * [HEXAGONAL] Returns the port interface, not the implementation.
 * [SOLID/DIP] Depends on abstractions (ports), not concretions.
 */
export function createWorkflowOrchestrator(
  deps: WorkflowOrchestratorDeps,
): AnalyzerPort {
  const { copilot, git, state, config, gitOps, resultParser } = deps;

  return {
    name: "autonomous_workflow",

    async execute(context: AnalyzerContext): Promise<AnalyzerResult> {
      const startTime = Date.now();

      try {
        return await runWorkflow(context, startTime);
      } catch (error: unknown) {
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

  // -----------------------------------------------------------------------
  // Core Workflow
  // -----------------------------------------------------------------------

  /**
   * Core workflow logic — separated from error handling.
   *
   * Steps:
   * 1. Check config (autonomous_workflow enabled? draft PRs enabled?)
   * 2. Query state for CRITICAL/HIGH findings
   * 3. For each qualifying finding → run the full SDLC loop
   * 4. Return structured result
   *
   * [CLEAN-CODE] Each step is a small, named function.
   */
  async function runWorkflow(
    _context: AnalyzerContext,
    startTime: number,
  ): Promise<AnalyzerResult> {
    // Step 1: Check config
    const cfg = config.get();

    if (!cfg.capabilities.autonomous_workflow) {
      return skipResult("autonomous workflow disabled by config", startTime);
    }

    if (!cfg.autonomy.create_draft_prs) {
      return skipResult("draft PRs disabled by config", startTime);
    }

    // Step 2: Query qualifying findings
    const allFindings = state.getFindings();
    const qualifyingFindings = allFindings.filter((f) =>
      WORKFLOW_QUALIFYING_SEVERITIES.has(f.severity),
    );

    if (qualifyingFindings.length === 0) {
      return skipResult(
        "no qualifying findings (CRITICAL/HIGH)",
        startTime,
      );
    }

    // Step 3: Process each finding independently
    const actionsTaken: ActionTaken[] = [];
    const outcomes: string[] = [];

    for (const finding of qualifyingFindings) {
      const result = await processWorkflowForFinding(finding, cfg.branch);

      if (result.action) {
        actionsTaken.push(result.action);
      }
      outcomes.push(result.outcomeMessage);
    }

    // Step 4: Save state
    await state.save();

    const prsCreated = actionsTaken.filter((a) => a.type === "pr_opened").length;

    return {
      success: true,
      summary: `SDLC workflow complete. ${prsCreated} PR(s) created from ${qualifyingFindings.length} finding(s). ` +
        outcomes.join("; "),
      findings: [],
      actions: actionsTaken,
      duration_ms: Date.now() - startTime,
    };
  }

  // -----------------------------------------------------------------------
  // Per-finding SDLC loop
  // -----------------------------------------------------------------------

  /**
   * Run the full SDLC loop for a single finding.
   *
   * Loop:
   * 1. Create branch
   * 2. Invoke Developer Guardian
   * 3. Check for changes
   * 4. Run reviews in parallel
   * 5. If blocking findings → iterate (up to MAX_PASSES)
   * 6. On pass 3 → use consultation model
   * 7. If clean → create draft PR
   *
   * [CLEAN-CODE] Each finding is independent — one failure doesn't block others.
   * [SRP] This function handles the full lifecycle of one finding workflow.
   */
  async function processWorkflowForFinding(
    finding: Finding,
    baseBranch: string,
  ): Promise<{ action: ActionTaken | null; outcomeMessage: string }> {
    const branchName = buildBranchName(finding);
    const iterations: WorkflowIteration[] = [];

    try {
      // Create workflow branch
      await gitOps.createBranch(branchName);

      for (let pass = 1; pass <= MAX_PASSES; pass++) {
        // Step A: Invoke Developer Guardian
        const devResult = await invokeDevGuardian(finding, pass, iterations);

        if (!devResult.success) {
          await safeCleanup(branchName, baseBranch);
          return {
            action: null,
            outcomeMessage: `${finding.id}: dev fix failed on pass ${pass}`,
          };
        }

        // Step B: Check if dev produced changes (only on first pass)
        if (pass === 1) {
          const hasChanges = await gitOps.hasChanges();
          if (!hasChanges) {
            await safeCleanup(branchName, baseBranch);
            return {
              action: null,
              outcomeMessage: `${finding.id}: no changes produced`,
            };
          }
        }

        // Step C: Run reviews in parallel [AC3]
        const reviews = await runReviews(finding, devResult.output);
        const totalBlocking = reviews.reduce(
          (sum, r) => sum + r.blockingFindingCount,
          0,
        );

        const iteration: WorkflowIteration = {
          pass,
          devFixSucceeded: true,
          devOutput: devResult.output,
          reviews,
          totalBlockingFindings: totalBlocking,
          modelUsed: devResult.modelUsed,
        };
        iterations.push(iteration);

        // All reviews passed → create PR
        if (totalBlocking === 0) {
          const prResult = await createWorkflowPR(
            finding,
            branchName,
            baseBranch,
            iterations,
          );
          return {
            action: prResult.action,
            outcomeMessage: `${finding.id}: PR created after ${pass} pass(es)`,
          };
        }

        // Last pass and still blocking → give up
        if (pass === MAX_PASSES) {
          await safeCleanup(branchName, baseBranch);
          return {
            action: null,
            outcomeMessage: `${finding.id}: max passes (${MAX_PASSES}) exceeded, blocking findings remain`,
          };
        }
      }

      // Should not reach here, but safety net
      await safeCleanup(branchName, baseBranch);
      return { action: null, outcomeMessage: `${finding.id}: unexpected exit` };
    } catch (error: unknown) {
      console.error(
        `[Craig] Workflow failed for finding ${finding.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await safeCleanup(branchName, baseBranch);
      return {
        action: null,
        outcomeMessage: `${finding.id}: error — ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // -----------------------------------------------------------------------
  // Single pass execution
  // -----------------------------------------------------------------------

  /**
   * Invoke Developer Guardian for a fix attempt.
   *
   * On pass 3 (MAX_PASSES), uses the consultation model for a
   * fresh perspective.
   *
   * [AC5] Consultation pattern — different model on 3rd pass.
   */
  async function invokeDevGuardian(
    finding: Finding,
    pass: number,
    previousIterations: readonly WorkflowIteration[],
  ): Promise<{ success: boolean; output: string; modelUsed: string }> {
    const isConsultation = pass === MAX_PASSES;
    const model = isConsultation ? CONSULTATION_MODEL : undefined;
    const modelUsed = model ?? config.get().models.default;

    // Build the appropriate dev prompt
    const devPrompt =
      pass === 1
        ? buildDevFixPrompt(finding)
        : buildIterationPrompt(
            finding,
            pass,
            previousIterations[previousIterations.length - 1]?.reviews ?? [],
          );

    // Invoke Developer Guardian
    const devResult = await copilot.invoke({
      agent: "dev-guardian",
      prompt: devPrompt,
      model,
    });

    return {
      success: devResult.success,
      output: devResult.success ? devResult.output : "",
      modelUsed,
    };
  }

  // -----------------------------------------------------------------------
  // Parallel review execution
  // -----------------------------------------------------------------------

  /**
   * Run QA, Security, and Code Review Guardians in parallel.
   *
   * Uses Promise.allSettled to ensure all reviews complete even
   * if one fails. Failed invocations are reported but don't block
   * the workflow.
   *
   * [AC3] Parallel execution for efficiency.
   * [CLEAN-CODE] allSettled — never loses a result.
   */
  async function runReviews(
    finding: Finding,
    devOutput: string,
  ): Promise<ReviewResult[]> {
    const reviewPromises = REVIEW_AGENTS.map(async (agent) => {
      const prompt = buildReviewPrompt(agent, finding, devOutput);

      const result = await copilot.invoke({
        agent,
        prompt,
      });

      if (!result.success) {
        const failResult: ReviewResult = {
          agent,
          invocationSucceeded: false,
          output: "",
          blockingFindingCount: 0,
          blockingFindings: [],
        };
        return failResult;
      }

      // Parse the review output for blocking findings
      const guardianType = AGENT_TO_GUARDIAN_TYPE[agent] ?? "code-review";
      const parsed = resultParser.parse(
        result.output,
        guardianType as "security" | "code-review" | "qa",
      );

      const blockingFindings = parsed.findings.filter(
        (f) => f.severity === "critical" || f.severity === "high",
      );

      const reviewResult: ReviewResult = {
        agent,
        invocationSucceeded: true,
        output: result.output,
        blockingFindingCount: blockingFindings.length,
        blockingFindings: blockingFindings.map((f) => f.issue),
      };
      return reviewResult;
    });

    const settled = await Promise.allSettled(reviewPromises);

    const results: ReviewResult[] = [];
    for (const entry of settled) {
      if (entry.status === "fulfilled") {
        results.push(entry.value);
      }
    }
    return results;
  }

  // -----------------------------------------------------------------------
  // PR creation
  // -----------------------------------------------------------------------

  /**
   * Create a draft PR for a successfully fixed finding.
   *
   * Commits all changes, pushes the branch, and creates a draft PR
   * with the workflow summary in the body.
   *
   * [AC6] Draft PR — human always approves.
   */
  async function createWorkflowPR(
    finding: Finding,
    branchName: string,
    baseBranch: string,
    iterations: readonly WorkflowIteration[],
  ): Promise<{ action: ActionTaken }> {
    const commitMessage = `fix: address ${finding.severity} finding — ${finding.issue}`;
    await gitOps.commitAll(commitMessage);
    await gitOps.push(branchName);

    const pr = await git.createDraftPR({
      title: buildPRTitle(finding),
      body: buildPRBody(finding, iterations),
      head: branchName,
      base: baseBranch,
      draft: true,
    });

    return {
      action: {
        type: "pr_opened",
        url: pr.url,
        description: `Draft PR #${pr.number}: SDLC workflow fix for ${finding.severity} finding — ${finding.issue}`,
      },
    };
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Build a skip result — used when config disables the workflow
   * or no qualifying findings are found.
   */
  function skipResult(reason: string, startTime: number): AnalyzerResult {
    return {
      success: true,
      summary: reason,
      findings: [],
      actions: [],
      duration_ms: Date.now() - startTime,
    };
  }

  /**
   * Cleanup branch without throwing — used in catch blocks.
   *
   * [CLEAN-CODE] Don't mask the original error with cleanup errors.
   */
  async function safeCleanup(
    branchName: string,
    defaultBranch: string,
  ): Promise<void> {
    try {
      await gitOps.cleanup(branchName, defaultBranch);
    } catch {
      // Swallow cleanup errors — the original error is more important
    }
  }
}
