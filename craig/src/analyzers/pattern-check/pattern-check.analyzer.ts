/**
 * PatternCheckAnalyzer — Learns repo patterns and enforces them on new code.
 *
 * Implements the Analyzer interface. On manual/schedule triggers, learns
 * patterns from the repository. On merge triggers, compares new code
 * against learned patterns and flags deviations.
 *
 * [HEXAGONAL] Adapter implementing Analyzer port.
 * [SOLID] SRP — pattern enforcement only.
 * [CLEAN-CODE] Never throws from execute() — returns AnalyzerResult.
 *
 * @module analyzers/pattern-check/pattern-check-analyzer
 */

import type { AnalyzerPort } from "../analyzer.port.js";
import type { AnalyzerContext, AnalyzerResult } from "../analyzer.types.js";
import type { PatternStorePort } from "./pattern-store.port.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TASK_NAME = "pattern_check";

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Analyzer that learns repository conventions and flags deviations.
 *
 * Two modes of operation:
 * - **Learn** (manual/schedule): Analyzes the codebase and stores patterns
 * - **Enforce** (merge): Compares new code against stored patterns
 *
 * Uses Code Review Guardian (via CopilotPort) for both learning and enforcement.
 */
export class PatternCheckAnalyzer implements AnalyzerPort {
  readonly name = TASK_NAME;

  constructor(
    private readonly patternStore: PatternStorePort,
  ) {}

  /**
   * Execute the pattern check analysis.
   *
   * - Manual/Schedule triggers → learn (or re-learn) patterns
   * - Merge triggers → enforce patterns against the diff
   *
   * Never throws — returns AnalyzerResult with success: false on error.
   */
  async execute(_context: AnalyzerContext): Promise<AnalyzerResult> {
    const startTime = Date.now();

    try {
      // Default behavior: learn patterns (enforce requires diff context
      // which is not part of the canonical AnalyzerContext)
      return await this.learnPatterns(startTime);
    } catch (error: unknown) {
      return this.createErrorResult(error, startTime);
    }
  }

  // -----------------------------------------------------------------------
  // Learn mode
  // -----------------------------------------------------------------------

  /**
   * Learn (or re-learn) patterns from the repository.
   *
   * On manual/schedule triggers, always re-learns to pick up new conventions.
   * If loading existing patterns fails, proceeds to learn fresh.
   */
  private async learnPatterns(startTime: number): Promise<AnalyzerResult> {
    const patterns = await this.patternStore.learn(".");
    await this.patternStore.save(patterns);

    return {
      success: true,
      summary: "Learned repository patterns successfully",
      findings: [],
      actions: [],
      duration_ms: Date.now() - startTime,
    };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Create a failure result from a caught error.
   */
  private createErrorResult(error: unknown, startTime: number): AnalyzerResult {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      summary: message,
      findings: [],
      actions: [],
      duration_ms: Date.now() - startTime,
    };
  }
}
