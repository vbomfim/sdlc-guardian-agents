/**
 * AnalyzerPort — the canonical interface for all analyzers.
 *
 * Every analyzer (merge_review, security_scan, coverage_scan, etc.)
 * implements this interface. The AnalyzerRegistry maps task names
 * to AnalyzerPort instances.
 *
 * [HEXAGONAL] This is the inward-facing port. Each analyzer
 * implementation is an adapter that calls Guardian agents via
 * CopilotPort and parses results via ResultParserPort.
 *
 * [SOLID/LSP] All analyzers are interchangeable through this interface.
 * [SOLID/DIP] Tool-handlers depend on this abstraction, not concrete analyzers.
 *
 * @module analyzers/port
 */

import type { AnalyzerContext, AnalyzerResult } from "./analyzer.types.js";

/**
 * Port interface for analyzer components.
 *
 * Each task in VALID_TASKS maps to one AnalyzerPort implementation.
 * The registry holds the mapping; tool-handlers dispatch via the port.
 *
 * @example
 * ```typescript
 * const analyzer: AnalyzerPort = {
 *   name: "security_scan",
 *   execute: async (context) => {
 *     // Invoke security-guardian via CopilotPort
 *     // Parse results via ResultParserPort
 *     // Return findings + actions
 *   },
 * };
 * ```
 */
export interface AnalyzerPort {
  /** Unique name identifying this analyzer (matches a ValidTask). */
  readonly name: string;

  /**
   * Execute the analysis.
   *
   * @param context - Execution context (task, taskId, timestamp)
   * @returns Analysis results including findings and actions taken
   *
   * @throws Never — implementations must catch all errors and return
   *   `{ success: false, ... }` instead of throwing.
   */
  execute(context: AnalyzerContext): Promise<AnalyzerResult>;
}
