/**
 * Analyzers component — public API barrel export.
 *
 * Re-exports the AnalyzerPort interface and all shared types.
 * Concrete analyzer implementations are exported here as they
 * are developed (one per VALID_TASKS entry).
 *
 * @module analyzers
 */

export type { AnalyzerPort } from "./analyzer.port.js";
export type {
  AnalyzerContext,
  AnalyzerResult,
  AnalyzerFinding,
  ActionTaken,
} from "./analyzer.types.js";

// Analyzer implementations
export { createMergeReviewAnalyzer } from "./merge-review/index.js";
export type {
  MergeReviewAnalyzerDeps,
  MergeReviewContext,
} from "./merge-review/merge-review.analyzer.js";
