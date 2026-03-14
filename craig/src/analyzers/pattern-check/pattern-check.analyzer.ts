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

import type { Analyzer, AnalyzerContext, AnalyzerResult } from "../analyzer.port.js";
import type { PatternStorePort } from "./pattern-store.port.js";
import type { PatternSet } from "./types.js";
import type { CopilotPort } from "../../copilot/index.js";
import { createResultParser } from "../../result-parser/index.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TASK_NAME = "pattern_check";
const NO_PATTERNS_MESSAGE =
  "No learned patterns found. run `craig_run_task pattern_check` to learn patterns first";

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
export class PatternCheckAnalyzer implements Analyzer {
  readonly name = TASK_NAME;

  private readonly resultParser = createResultParser();

  constructor(
    private readonly patternStore: PatternStorePort,
    private readonly copilot: CopilotPort,
  ) {}

  /**
   * Execute the pattern check analysis.
   *
   * - Manual/Schedule triggers → learn (or re-learn) patterns
   * - Merge triggers → enforce patterns against the diff
   *
   * Never throws — returns AnalyzerResult with success: false on error.
   */
  async execute(context: AnalyzerContext): Promise<AnalyzerResult> {
    const startTime = Date.now();

    try {
      if (context.trigger === "merge") {
        return await this.enforcePatterns(context, startTime);
      }

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
      task: TASK_NAME,
      success: true,
      findings: [],
      actions_taken: [],
      duration_ms: Date.now() - startTime,
    };
  }

  // -----------------------------------------------------------------------
  // Enforce mode
  // -----------------------------------------------------------------------

  /**
   * Enforce learned patterns against a merge diff.
   *
   * Loads existing patterns, builds a prompt with the patterns + diff,
   * invokes Code Review Guardian, and parses the findings.
   */
  private async enforcePatterns(
    context: AnalyzerContext,
    startTime: number,
  ): Promise<AnalyzerResult> {
    // No diff → nothing to check
    if (!context.diff) {
      return {
        task: TASK_NAME,
        success: true,
        findings: [],
        actions_taken: [],
        duration_ms: Date.now() - startTime,
      };
    }

    // Load existing patterns
    const patterns = await this.loadPatternsOrSkip(startTime);
    if (patterns === null) {
      return this.createSkipResult(startTime);
    }

    // Invoke Code Review Guardian with patterns + diff
    const result = await this.copilot.invoke({
      agent: "code-review-guardian",
      prompt: this.buildEnforcePrompt(patterns),
      context: this.buildEnforceContext(patterns, context.diff),
    });

    if (!result.success) {
      return {
        task: TASK_NAME,
        success: false,
        findings: [],
        actions_taken: [],
        duration_ms: Date.now() - startTime,
        error: result.error,
      };
    }

    // Parse the Guardian's response into structured findings
    const report = this.resultParser.parse(result.output, "code-review");
    const findings = report.findings;

    return {
      task: TASK_NAME,
      success: true,
      findings,
      actions_taken: [],
      duration_ms: Date.now() - startTime,
    };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Attempt to load patterns. Returns null if no patterns exist.
   *
   * On load error, logs and returns null (skip mode).
   */
  private async loadPatternsOrSkip(_startTime: number): Promise<PatternSet | null> {
    try {
      return await this.patternStore.load();
    } catch {
      console.error(
        `[Craig] Failed to load patterns. ${NO_PATTERNS_MESSAGE}`,
      );
      return null;
    }
  }

  /**
   * Create a result for when pattern check is skipped (no patterns learned).
   */
  private createSkipResult(startTime: number): AnalyzerResult {
    console.error(`[Craig] ${NO_PATTERNS_MESSAGE}`);
    return {
      task: TASK_NAME,
      success: true,
      findings: [],
      actions_taken: [],
      duration_ms: Date.now() - startTime,
      error: NO_PATTERNS_MESSAGE,
    };
  }

  /**
   * Build the enforcement prompt for Code Review Guardian.
   */
  private buildEnforcePrompt(patterns: PatternSet): string {
    return [
      "Review the following code diff for pattern deviations.",
      "Compare the new code against the repository's established patterns provided below.",
      "",
      "For each deviation found, report it as a finding in a markdown table with columns:",
      "| # | Severity | Category | File:Line | Issue | Source & Justification | Suggested Fix |",
      "",
      "Only flag clear deviations from the established patterns.",
      "Use severity 🟡 Medium for pattern deviations from majority conventions.",
      "Use severity 🔵 Low for minor style deviations.",
      `Patterns were learned at: ${patterns.learned_at}`,
    ].join("\n");
  }

  /**
   * Build the context string with patterns + diff for the Guardian.
   */
  private buildEnforceContext(patterns: PatternSet, diff: string): string {
    const patternSummary = this.formatPatternsForContext(patterns);

    return [
      "## Established Repository Patterns",
      "",
      patternSummary,
      "",
      "## Code diff to review",
      "",
      diff,
    ].join("\n");
  }

  /**
   * Format a PatternSet into a human-readable summary for the prompt context.
   */
  private formatPatternsForContext(patterns: PatternSet): string {
    const sections: string[] = [];

    if (patterns.naming_conventions.length > 0) {
      sections.push("### Naming Conventions");
      for (const rule of patterns.naming_conventions) {
        sections.push(`- **${rule.name}**: ${rule.description} (${rule.frequency})`);
      }
    }

    if (patterns.file_structure.length > 0) {
      sections.push("### File Structure");
      for (const rule of patterns.file_structure) {
        sections.push(`- **${rule.name}**: ${rule.description} (${rule.frequency})`);
      }
    }

    if (patterns.error_handling.length > 0) {
      sections.push("### Error Handling");
      for (const rule of patterns.error_handling) {
        sections.push(`- **${rule.name}**: ${rule.description} (${rule.frequency})`);
      }
    }

    if (patterns.import_conventions.length > 0) {
      sections.push("### Import Conventions");
      for (const rule of patterns.import_conventions) {
        sections.push(`- **${rule.name}**: ${rule.description} (${rule.frequency})`);
      }
    }

    return sections.join("\n");
  }

  /**
   * Create a failure result from a caught error.
   */
  private createErrorResult(error: unknown, startTime: number): AnalyzerResult {
    const message = error instanceof Error ? error.message : String(error);
    return {
      task: TASK_NAME,
      success: false,
      findings: [],
      actions_taken: [],
      duration_ms: Date.now() - startTime,
      error: message,
    };
  }
}
