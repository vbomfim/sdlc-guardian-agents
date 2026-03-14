/**
 * Pattern Check Analyzer — Public API
 *
 * Barrel export for the pattern-check analyzer component.
 * Consumers import from here, not from internal modules.
 *
 * @module analyzers/pattern-check
 */

export { PatternCheckAnalyzer } from "./pattern-check.analyzer.js";
export { FilePatternStore } from "./file-pattern-store.js";
export type { PatternStorePort } from "./pattern-store.port.js";
export type {
  PatternSet,
  PatternRule,
  PatternSeverity,
  PatternDeviation,
} from "./types.js";
export {
  PatternStoreCorruptedError,
  PatternLearningError,
} from "./errors.js";
