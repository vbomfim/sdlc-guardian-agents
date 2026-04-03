/**
 * UAT State Machine — pure, testable logic for the SDLC Guardian extension.
 *
 * This module owns every state variable and transition rule that drives the
 * post-implementation UAT loop and review-gate boundary.  It is deliberately
 * free of Copilot SDK imports so that `node --test` can exercise it without
 * bootstrapping a live session.
 *
 * The live extension (extension.mjs) imports `UatStateMachine` and delegates
 * to it from the `onPostToolUse` hook.
 *
 * @module uat-state-machine
 */

// ── Pure helper functions (stateless) ──────────────────────────────────────

/**
 * Returns true when `filePath` looks like a Copilot session-state internal
 * path.  Normalises separators to "/" before matching so that relative paths,
 * Windows back-slashes, and mixed-separator paths are all caught.
 */
export function isSessionStatePath(filePath) {
  if (typeof filePath !== "string") return false;
  const normalised = filePath.replace(/\\/g, "/");
  return /(?:^|\/)\.copilot\/session-state\//.test(normalised);
}

/** Normalise a string argument — returns `null` for non-string / empty. */
export function normalizePath(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Returns true when the file should be tracked for the post-implementation
 * gate.  Excludes only Copilot session-state paths.
 */
export function trackableFile(filePath) {
  return Boolean(filePath && !isSessionStatePath(filePath));
}

/**
 * Extracts file paths touched by an edit/create/apply_patch tool invocation.
 * Returns an array of deduplicated paths (may be empty).
 */
export function extractEditPaths(toolName, toolArgs) {
  if (toolName === "edit" || toolName === "create") {
    const filePath = normalizePath(toolArgs?.path);
    return filePath ? [filePath] : [];
  }

  if (toolName !== "apply_patch") {
    return [];
  }

  const patchText =
    typeof toolArgs === "string" ? toolArgs : normalizePath(toolArgs?.patch);
  if (!patchText) {
    return [];
  }

  return Array.from(
    new Set(
      [...patchText.matchAll(/^\*\*\* (?:Add|Update|Delete|Rename) File: (.+)$/gm)].map(
        (match) => match[1].trim(),
      ),
    ),
  );
}

/**
 * Returns true when the tool args describe a Developer Guardian task.
 * `agent_type` is authoritative when present; `name` is a fallback.
 */
export function isDeveloperGuardianTask(toolArgs) {
  const agentType = normalizePath(toolArgs?.agent_type);
  if (agentType) return agentType === "Developer Guardian";

  const name = normalizePath(toolArgs?.name);
  if (name === "dev-guardian" || name === "developer-guardian") return true;

  return false;
}

/** The three review Guardians that constitute the full review gate. */
export const REQUIRED_REVIEW_GUARDIANS = new Set([
  "QA Guardian",
  "Security Guardian",
  "Code Review Guardian",
]);

/** Map kebab-case task names to canonical Guardian types. */
const REVIEW_NAME_TO_TYPE = new Map([
  ["qa-guardian", "QA Guardian"],
  ["security-guardian", "Security Guardian"],
  ["code-review-guardian", "Code Review Guardian"],
]);

/**
 * Returns the canonical review Guardian type for the given tool args,
 * or `null` if the args do not identify a review Guardian.
 * `agent_type` is authoritative when present; `name` is a fallback.
 */
export function getReviewGuardianType(toolArgs) {
  const agentType = normalizePath(toolArgs?.agent_type);
  if (agentType) return REQUIRED_REVIEW_GUARDIANS.has(agentType) ? agentType : null;

  const name = normalizePath(toolArgs?.name);
  return (name && REVIEW_NAME_TO_TYPE.get(name)) ?? null;
}

/**
 * Returns true when the tool args describe a review-pipeline Guardian task
 * (QA, Security, or Code Review).
 */
export function isReviewGuardianTask(toolArgs) {
  return getReviewGuardianType(toolArgs) !== null;
}

// ── Context builders ───────────────────────────────────────────────────────

/**
 * These context strings mirror the canonical rules in
 * src/instructions/sdlc-workflow.instructions.md.  Keep them aligned when
 * either file changes.
 */
export function buildStartupContext() {
  return [
    "Local-only SDLC Guardian helper is active on this machine.",
    "Use GPT-5.4 as the default/top-level orchestrator unless a task specifies otherwise.",
    "Pre-implementation gate: verify a PO ticket/spec exists before coding. This applies to ALL work types — features, bugs, defects, refactors, hotfixes. NEVER skip the PO Guardian because the user provided a good description. A well-described bug is NOT a ticket. The PO Guardian's structured questionnaire must always run.",
    "Post-implementation flow: after Developer Guardian completes, offer a UAT checkpoint (user tests + pair-fix loop), then run QA + Security + Code Review in parallel.",
    "UAT checkpoint: present worktree path, branch name, and run/test commands. If autopilot is enabled, auto-enter the UAT loop (no question needed). Otherwise wait for user opt-in. The review gate ALWAYS runs after UAT is done or skipped.",
    `UAT pair-fix cap: after ${MAX_UAT_PAIR_FIX_ITERATIONS} pair-fix iterations in the UAT loop, recommend proceeding to the review gate. The user can override, but the default is to escalate.`,
    "Guardians keep their specified models; Code Review stays dual-model (Opus 4.6 + GPT-5.4).",
    "React to system_notifications immediately and read finished background work right away.",
    "Craig is out of scope for this extension.",
  ].join("\n");
}

export function buildPostImplementationContext(fileCount) {
  return [
    `Developer Guardian completed. ${fileCount} file(s) changed in this feature.`,
    "Offer the UAT checkpoint now: present the worktree path, branch name, and run/test commands from the handoff report.",
    "If autopilot is enabled, auto-enter the UAT loop without asking — the user can say 'skip' or 'done' at any time.",
    "Otherwise ask the user: 'Would you like to manually test before the full review pipeline? (Yes / Skip)'",
    "If the user opts in, enter the UAT loop — let them test and pair-fix with Developer Guardian.",
    "After UAT is done or skipped, run the mandatory review gate: QA + Security + Code Review in parallel.",
    "Security and QA use claude-opus-4.6. Code Review stays dual-model: Opus 4.6 + GPT-5.4.",
  ].join("\n");
}

export function buildPairFixContinuationContext(
  fileCount,
  iterationNumber,
  maxIterations,
) {
  const lines = [
    `Developer Guardian pair-fix completed (iteration ${iterationNumber}/${maxIterations}). ${fileCount} file(s) changed total.`,
    "Continue the existing UAT loop — do NOT re-offer the UAT checkpoint from scratch.",
    "Present the fix summary and ask the user to continue testing or say 'done'.",
  ];
  if (iterationNumber >= maxIterations) {
    lines.push(
      `⚠️ Reached ${maxIterations} pair-fix iterations. Recommend proceeding to the review gate now.`,
      "Tell the user: 'We've completed several fix rounds. I recommend moving to the review gate so QA, Security, and Code Review can provide a comprehensive assessment. You can continue fixing, or say done to proceed.'",
    );
  }
  return lines.join("\n");
}

// ── State machine ──────────────────────────────────────────────────────────

/** Maximum pair-fix iterations before the extension advises escalation. */
export const MAX_UAT_PAIR_FIX_ITERATIONS = 3;

/**
 * Encapsulates all mutable UAT-loop state and the transition logic that the
 * `onPostToolUse` hook delegates to.
 *
 * Lifecycle:
 *  1. File edits accumulate in `editedFiles`.
 *  2. First successful Dev Guardian completion → UAT offer, `uatOfferInjected = true`.
 *  3. Subsequent Dev Guardian completions → pair-fix continuation (clears
 *     stale gate tracking so the next review cycle starts fresh).
 *  4. All three required review Guardians succeed (after UAT offer) →
 *     arm `pendingFeatureReset`, snapshot `editedFiles` into `baselineFiles`.
 *     If any reviewer fails/cancels, the gate is tainted and cannot pass
 *     until a pair-fix clears the tracking and reviews re-run.
 *  5. Next Dev Guardian completion → `consumePendingReset()` subtracts baseline,
 *     then fresh UAT offer for the new feature.
 *
 * Failed/cancelled review Guardians taint the gate — the orchestrator
 * must pair-fix and re-run the full review pipeline.  This prevents a
 * partial success from prematurely advancing the lifecycle.
 */
export class UatStateMachine {
  constructor() {
    /** @type {Set<string>} Files edited/created/patched in the current feature. */
    this.editedFiles = new Set();

    /** True once the initial UAT offer has been injected for the current feature. */
    this.uatOfferInjected = false;

    /** Pair-fix iteration counter for the current UAT loop. */
    this.uatPairFixCount = 0;

    /**
     * Armed when the full review gate passes after a UAT offer.
     * Consumed by the next Dev Guardian task completion.
     */
    this.pendingFeatureReset = false;

    /**
     * Point-in-time snapshot of `editedFiles` taken when the gate passes.
     * @type {Set<string> | null}
     */
    this.baselineFiles = null;

    /**
     * Tracks which required review Guardians have succeeded in the current
     * gate cycle.  Keyed by canonical Guardian type (e.g. "QA Guardian").
     * @type {Set<string>}
     */
    this.reviewGateSucceeded = new Set();

    /**
     * True when any review Guardian has failed or been cancelled in the
     * current gate cycle.  A tainted gate cannot pass — the orchestrator
     * must pair-fix and re-run the full review gate.
     */
    this.reviewGateTainted = false;
  }

  // ── Queries (read-only) ────────────────────────────────────────────────

  get fileCount() {
    return this.editedFiles.size;
  }

  /**
   * True when the full review gate has passed: every required Guardian
   * succeeded and none failed or were cancelled in this gate cycle.
   */
  get isReviewGatePassed() {
    if (this.reviewGateTainted) return false;
    for (const type of REQUIRED_REVIEW_GUARDIANS) {
      if (!this.reviewGateSucceeded.has(type)) return false;
    }
    return true;
  }

  // ── Commands (mutating) ────────────────────────────────────────────────

  /**
   * Record a file edit.  Accumulates unconditionally — baseline-subtract
   * at reset time removes old-feature files.
   */
  trackFile(filePath) {
    if (trackableFile(filePath)) {
      this.editedFiles.add(filePath);
    }
  }

  /** Clear gate-cycle tracking so the next review round starts fresh. */
  resetReviewGate() {
    this.reviewGateSucceeded.clear();
    this.reviewGateTainted = false;
  }

  /**
   * Consume the pending reset: clear UAT flags, baseline-subtract
   * old-feature files from `editedFiles`, and disarm the reset.
   *
   * The baseline-subtract (rather than a blanket clear) preserves any
   * new-feature files that may have propagated from the Dev Guardian's
   * sub-agent between the snapshot and the consume — these edit/create
   * events arrive before the task-completion event.
   */
  consumePendingReset() {
    this.uatOfferInjected = false;
    this.uatPairFixCount = 0;
    this.pendingFeatureReset = false;
    this.reviewGateSucceeded.clear();
    this.reviewGateTainted = false;

    if (this.baselineFiles) {
      for (const filePath of this.baselineFiles) {
        this.editedFiles.delete(filePath);
      }
      this.baselineFiles = null;
    }
  }

  // ── Main transition (called from onPostToolUse) ────────────────────────

  /**
   * Process a single `onPostToolUse` event and return the hook result.
   *
   * @param {{ toolName: string, toolArgs: any, toolResult?: any }} input
   * @returns {{ additionalContext: string } | undefined}
   */
  handlePostToolUse(input) {
    // ── Track file edits ──────────────────────────────────────────────
    for (const filePath of extractEditPaths(input.toolName, input.toolArgs)) {
      this.trackFile(filePath);
    }

    // ── Review-gate boundary detection ────────────────────────────────
    // The review gate requires ALL three Guardians (QA, Security, Code
    // Review) to succeed.  Individual successes are recorded; failures
    // taint the gate.  `pendingFeatureReset` is armed only when every
    // required Guardian has succeeded and none have failed/cancelled.
    //
    // If the gate is tainted, the orchestrator must pair-fix and re-run
    // the full review pipeline.  A pair-fix Dev Guardian completion
    // clears the gate tracking so the next review cycle starts clean.
    const reviewType = input.toolName === "task"
      ? getReviewGuardianType(input.toolArgs)
      : null;

    if (reviewType !== null) {
      const resultType = input.toolResult?.resultType;

      if (resultType && resultType !== "success") {
        // Failed or cancelled — taint the gate, do NOT arm reset.
        this.reviewGateTainted = true;
        // Disarm any already-armed pass state so the boundary cannot
        // be consumed by a subsequent Dev Guardian completion.
        this.pendingFeatureReset = false;
        this.baselineFiles = null;
        return undefined;
      }

      // Success (explicit or legacy missing resultType).
      if (this.uatOfferInjected) {
        this.reviewGateSucceeded.add(reviewType);

        // Arm reset only when the FULL gate has passed.
        if (this.isReviewGatePassed) {
          this.pendingFeatureReset = true;
          this.baselineFiles = new Set(this.editedFiles);
        }
      }
      return undefined;
    }

    // ── Only successful Developer Guardian task completions proceed ────
    if (
      input.toolName !== "task" ||
      !isDeveloperGuardianTask(input.toolArgs)
    ) {
      return undefined;
    }

    if (
      input.toolResult?.resultType &&
      input.toolResult.resultType !== "success"
    ) {
      return undefined;
    }

    // ── Feature-boundary reset (baseline-subtract) ───────────────────
    // If the review gate has been passed, this Dev Guardian completion
    // starts a new feature.  `consumePendingReset()` subtracts the
    // baseline from `editedFiles`, preserving any new-feature files
    // that propagated from the sub-agent.
    let crossedBoundary = false;
    if (this.pendingFeatureReset) {
      this.consumePendingReset();
      crossedBoundary = true;
    }

    const fileCount = this.editedFiles.size;

    // Skip UAT only when we are confident no files were changed AND
    // we did NOT just cross a feature boundary.  After a boundary
    // crossing the Dev Guardian definitely produced a new feature —
    // fileCount may be zero only because sub-agent edit/create events
    // did not propagate to this hook.
    if (fileCount === 0 && !crossedBoundary) {
      return undefined;
    }

    // First Developer Guardian completion → inject UAT offer.
    // Subsequent completions (pair-fix inside UAT loop) → inject
    // continuation context instead, with iteration tracking.
    if (!this.uatOfferInjected) {
      this.uatOfferInjected = true;
      return { additionalContext: buildPostImplementationContext(fileCount) };
    }

    this.uatPairFixCount += 1;
    // Pair-fix means code changed — stale review results are invalid.
    // Clear gate tracking so the next review cycle starts fresh.
    this.resetReviewGate();
    return {
      additionalContext: buildPairFixContinuationContext(
        fileCount,
        this.uatPairFixCount,
        MAX_UAT_PAIR_FIX_ITERATIONS,
      ),
    };
  }
}
