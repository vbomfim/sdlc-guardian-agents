/**
 * Analyzer Registry — maps task names to AnalyzerPort implementations.
 *
 * Provides a type-safe, immutable registry of analyzers that can be
 * looked up by task name at runtime. Used by tool-handlers to dispatch
 * task execution to the correct analyzer.
 *
 * [SOLID/OCP] New analyzers are added by registering them — no existing
 * code needs to change (open for extension, closed for modification).
 * [SOLID/DIP] Tool-handlers depend on AnalyzerPort (abstraction),
 * not concrete analyzer implementations.
 * [CLEAN-ARCH] The registry is a simple data structure — no business logic.
 *
 * @module core/analyzer-registry
 */

import type { AnalyzerPort } from "../analyzers/index.js";

/**
 * Immutable registry mapping task names to their analyzer implementations.
 *
 * Uses ReadonlyMap to prevent runtime mutations after construction.
 * Analyzers are registered at bootstrap time and never change.
 */
export type AnalyzerRegistry = ReadonlyMap<string, AnalyzerPort>;

/**
 * Create an AnalyzerRegistry from an array of AnalyzerPort implementations.
 *
 * Each analyzer's `name` property is used as the map key. If multiple
 * analyzers share the same name, the last one wins (Map.set behavior).
 *
 * @param analyzers - Array of analyzer implementations to register
 * @returns Immutable registry mapping task names to analyzers
 *
 * @example
 * ```typescript
 * const registry = createAnalyzerRegistry([
 *   securityScanAnalyzer,
 *   coverageScanAnalyzer,
 *   mergeReviewAnalyzer,
 * ]);
 *
 * const analyzer = registry.get("security_scan");
 * if (analyzer) {
 *   const result = await analyzer.execute(context);
 * }
 * ```
 */
export function createAnalyzerRegistry(
  analyzers: readonly AnalyzerPort[],
): AnalyzerRegistry {
  const entries: [string, AnalyzerPort][] = analyzers.map((a) => [a.name, a]);
  return new Map(entries);
}
