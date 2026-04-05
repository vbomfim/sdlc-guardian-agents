/**
 * SDLC Pipeline State Machine — pure, testable logic for the Guardian extension.
 *
 * This module owns every state variable and transition rule that drives the
 * full SDLC pipeline: PO gate, post-implementation UAT loop, and review-gate
 * boundary.  It is deliberately free of Copilot SDK imports so that
 * `node --test` can exercise it without bootstrapping a live session.
 *
 * The live extension (extension.mjs) imports `SdlcStateMachine` and delegates
 * from the hooks.
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

/**
 * Notes filenames for all seven Guardians — used by package.sh seed logic
 * and by review Guardians reading cross-guardian notes.
 * Names follow kebab-case convention from the GUARDIANS variable in package.sh.
 * IMPORTANT: these use `.notes.md`, NOT `.instructions.md` — notes files must
 * NOT be auto-loaded by Copilot CLI runtime; Guardians read them explicitly.
 */
export const GUARDIAN_NOTES_FILES = [
  "security-guardian.notes.md",
  "code-review-guardian.notes.md",
  "po-guardian.notes.md",
  "dev-guardian.notes.md",
  "qa-guardian.notes.md",
  "platform-guardian.notes.md",
  "delivery-guardian.notes.md",
];

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

/**
 * Returns true when the tool args describe a PO Guardian task.
 * `agent_type` is authoritative when present; `name` is a fallback.
 */
export function isPOGuardianTask(toolArgs) {
  const agentType = normalizePath(toolArgs?.agent_type);
  if (agentType) return agentType === "Product Owner Guardian";

  const name = normalizePath(toolArgs?.name);
  return name === "po-guardian" || name === "product-owner-guardian";
}

/**
 * Returns the canonical Guardian type for any Guardian task, or `null`.
 */
export function getGuardianType(toolArgs) {
  if (isDeveloperGuardianTask(toolArgs)) return "Developer Guardian";
  if (isPOGuardianTask(toolArgs)) return "Product Owner Guardian";
  return getReviewGuardianType(toolArgs);
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

// ── PO gate context builders ───────────────────────────────────────────────

export function buildPoGateContext() {
  return [
    "PO Guardian completed the specification.",
    "Present the FULL ticket to the user — every section, every component, every acceptance criterion, every open question.",
    "Do NOT summarize or abbreviate. The user must see the complete spec before implementation starts.",
    "Wait for the user to confirm, request changes, or answer open questions.",
    "Only invoke the Developer Guardian after the user explicitly approves.",
  ].join("\n");
}

export function buildDevWithoutPoWarning() {
  return [
    "⚠️ Developer Guardian was invoked but no PO Guardian ticket exists in this session.",
    "The pre-implementation gate requires a specification before coding.",
    "Ask the user: is there an existing ticket/issue for this work? If not, invoke PO Guardian first.",
  ].join("\n");
}

// ── Guardian completion context builders ───────────────────────────────────

/**
 * Improvement Cycle reminder appended to review Guardian completion context.
 * Tells the orchestrator to check for note proposals in the handoff report.
 */
const IMPROVEMENT_CYCLE_REMINDER =
  "Also check the handoff report for an **Improvement Cycle Proposals** section. " +
  "If proposals exist, present them to the user for approval before committing. " +
  "Approved proposals should be appended to the corresponding .notes.md file in ~/.copilot/instructions/.";

export function buildGuardianCompletionContext(guardianType) {
  switch (guardianType) {
    case "QA Guardian":
      return [
        "QA Guardian completed. Read the test report with read_agent. Present findings and coverage gaps to the user.",
        IMPROVEMENT_CYCLE_REMINDER,
      ].join("\n");
    case "Security Guardian":
      return [
        "Security Guardian completed. Read findings with read_agent. Present the Tools Report and all findings to the user — do not filter or summarize away warnings.",
        IMPROVEMENT_CYCLE_REMINDER,
      ].join("\n");
    case "Code Review Guardian":
      return [
        "Code Review Guardian completed. Read findings with read_agent. Present all findings to the user.",
        IMPROVEMENT_CYCLE_REMINDER,
      ].join("\n");
    default:
      return `${guardianType} completed. Read the report with read_agent and present results to the user.`;
  }
}

// ── State machine ──────────────────────────────────────────────────────────

/** Maximum pair-fix iterations before the extension advises escalation. */
export const MAX_UAT_PAIR_FIX_ITERATIONS = 3;

/**
 * Encapsulates all mutable pipeline state and the transition logic that the
 * `onPostToolUse` hook delegates to.
 *
 * Lifecycle:
 *  0. PO Guardian completes → `poGateCompleted = true`, inject spec-presentation context.
 *  1. File edits accumulate in `editedFiles`.
 *  2. First successful Dev Guardian completion → check PO gate, then UAT offer.
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

    /** True once PO Guardian has completed for the current feature. */
    this.poGateCompleted = false;

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
    this.poGateCompleted = false;
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

    // Only task tool completions matter for pipeline transitions.
    if (input.toolName !== "task") {
      return undefined;
    }

    // ── PO Guardian completion ────────────────────────────────────────
    if (isPOGuardianTask(input.toolArgs)) {
      const resultType = input.toolResult?.resultType;
      if (resultType && resultType !== "success") {
        return undefined;
      }
      this.poGateCompleted = true;
      return { additionalContext: buildPoGateContext() };
    }

    // ── Review-gate boundary detection ────────────────────────────────
    const reviewType = getReviewGuardianType(input.toolArgs);

    if (reviewType !== null) {
      const resultType = input.toolResult?.resultType;

      if (resultType && resultType !== "success") {
        this.reviewGateTainted = true;
        this.pendingFeatureReset = false;
        this.baselineFiles = null;
        return undefined;
      }

      // Success — record it and inject completion context.
      if (this.uatOfferInjected) {
        this.reviewGateSucceeded.add(reviewType);

        if (this.isReviewGatePassed) {
          this.pendingFeatureReset = true;
          this.baselineFiles = new Set(this.editedFiles);
        }
      }
      return { additionalContext: buildGuardianCompletionContext(reviewType) };
    }

    // ── Developer Guardian completion ─────────────────────────────────
    if (!isDeveloperGuardianTask(input.toolArgs)) {
      return undefined;
    }

    if (
      input.toolResult?.resultType &&
      input.toolResult.resultType !== "success"
    ) {
      return undefined;
    }

    // ── PO gate check ────────────────────────────────────────────────
    // If Developer Guardian completes but PO gate hasn't been satisfied,
    // warn the orchestrator.  This catches the case where someone
    // invokes Dev Guardian directly without going through PO first.
    if (!this.poGateCompleted && !this.uatOfferInjected) {
      return { additionalContext: buildDevWithoutPoWarning() };
    }

    // ── Feature-boundary reset (baseline-subtract) ───────────────────
    let crossedBoundary = false;
    if (this.pendingFeatureReset) {
      this.consumePendingReset();
      crossedBoundary = true;
    }

    const fileCount = this.editedFiles.size;

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
