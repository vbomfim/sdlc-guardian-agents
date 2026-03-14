/**
 * Workflow Orchestrator — Type definitions.
 *
 * Defines the data models for the full SDLC workflow loop:
 * Finding → Developer fix → QA + Security + Code Review → Draft PR
 *
 * [CLEAN-ARCH] These types form the contract for the workflow component.
 * No implementation details leak here.
 *
 * @module workflow/types
 * @see https://github.com/vbomfim/sdlc-guardian-agents/issues/59
 */

import type { Severity } from "../shared/severity.js";
import type { GuardianAgent } from "../copilot/copilot.types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of fix-review passes before giving up. */
export const MAX_PASSES = 3;

/** Severity levels that trigger the autonomous workflow. */
export const WORKFLOW_QUALIFYING_SEVERITIES: ReadonlySet<Severity> = new Set([
  "critical",
  "high",
]);

/** Guardian agents invoked in parallel during the review phase. */
export const REVIEW_AGENTS: readonly GuardianAgent[] = [
  "qa-guardian",
  "security-guardian",
  "code-review-guardian",
] as const;

// ---------------------------------------------------------------------------
// Review Result — output from a single Guardian review
// ---------------------------------------------------------------------------

/**
 * Result of invoking a single review Guardian.
 *
 * Captures the agent name, whether it passed, and any blocking findings
 * (CRITICAL/HIGH severity) that would trigger another iteration.
 */
export interface ReviewResult {
  /** Which Guardian agent produced this review. */
  readonly agent: GuardianAgent;

  /** Whether the Guardian invocation succeeded (SDK call worked). */
  readonly invocationSucceeded: boolean;

  /** Raw markdown output from the Guardian. */
  readonly output: string;

  /** Number of CRITICAL/HIGH findings in this review. */
  readonly blockingFindingCount: number;

  /** Summary of blocking findings (for developer prompt context). */
  readonly blockingFindings: readonly string[];
}

// ---------------------------------------------------------------------------
// Workflow Iteration — one fix-review pass
// ---------------------------------------------------------------------------

/**
 * Represents a single iteration of the fix → review loop.
 *
 * Each pass consists of:
 * 1. Developer Guardian fix attempt
 * 2. Parallel review by QA, Security, and Code Review Guardians
 * 3. Assessment of whether blocking findings remain
 */
export interface WorkflowIteration {
  /** 1-indexed pass number (1, 2, or 3). */
  readonly pass: number;

  /** Whether the Developer Guardian fix succeeded. */
  readonly devFixSucceeded: boolean;

  /** Raw output from Developer Guardian. */
  readonly devOutput: string;

  /** Results from all review Guardians. */
  readonly reviews: readonly ReviewResult[];

  /** Total blocking findings across all reviews. */
  readonly totalBlockingFindings: number;

  /** Model used for this iteration. */
  readonly modelUsed: string;
}

// ---------------------------------------------------------------------------
// Workflow Result — outcome of the full workflow for one finding
// ---------------------------------------------------------------------------

/**
 * Outcome of running the full SDLC workflow for a single finding.
 *
 * Tracks all iterations, the final verdict, and any PR created.
 */
export interface WorkflowResult {
  /** The finding ID that triggered this workflow. */
  readonly findingId: string;

  /** All iterations performed (1 to MAX_PASSES). */
  readonly iterations: readonly WorkflowIteration[];

  /** Final verdict: did the workflow produce a clean PR? */
  readonly verdict: WorkflowVerdict;

  /** URL of the draft PR (if created). */
  readonly prUrl?: string;

  /** PR number (if created). */
  readonly prNumber?: number;

  /** Total duration across all iterations in ms. */
  readonly totalDurationMs: number;
}

/** Possible outcomes of the workflow for a finding. */
export type WorkflowVerdict =
  | "pr_created"
  | "max_passes_exceeded"
  | "dev_fix_failed"
  | "config_disabled"
  | "no_changes_produced";
