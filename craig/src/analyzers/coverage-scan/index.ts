/**
 * Coverage Scan Analyzer — public API barrel export.
 *
 * All consumers import from here, never from internals.
 *
 * @module analyzers/coverage-scan
 */

export {
  CoverageScanAnalyzer,
  createCoverageScanAnalyzer,
} from "./coverage-scan.adapter.js";
export type { CoverageScanDeps } from "./coverage-scan.types.js";
