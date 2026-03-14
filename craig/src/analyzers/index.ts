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
export {
  CoverageScanAnalyzer,
  createCoverageScanAnalyzer,
} from "./coverage-scan/index.js";
export type { CoverageScanDeps } from "./coverage-scan/coverage-scan.types.js";
export { AutoFixAnalyzer } from "./auto-fix/index.js";
export type {
  CommandRunnerPort,
  CommandResult,
  GitOpsPort,
} from "./auto-fix/auto-fix.ports.js";
export type { LinterDefinition, FixerResult } from "./auto-fix/auto-fix.types.js";
export { SUPPORTED_LINTERS } from "./auto-fix/auto-fix.types.js";
export { FixVerificationError, GitOpsError } from "./auto-fix/auto-fix.errors.js";
export { PatternCheckAnalyzer } from "./pattern-check/index.js";
export { FilePatternStore } from "./pattern-check/file-pattern-store.js";
export type { PatternStorePort } from "./pattern-check/pattern-store.port.js";
export type {
  PatternSet,
  PatternRule,
  PatternSeverity,
  PatternDeviation,
} from "./pattern-check/types.js";
export {
  PatternStoreCorruptedError,
  PatternLearningError,
} from "./pattern-check/errors.js";
export { createTechDebtAnalyzer } from "./tech-debt/index.js";
export type { TechDebtAnalyzerDeps } from "./tech-debt/tech-debt.analyzer.js";
export { DependencyCheckAnalyzer } from "./dependency-check/index.js";
export type {
  PackageManager,
  Vulnerability,
  ShellPort,
  DependencyCheckDeps,
} from "./dependency-check/dependency-check.types.js";
export { PACKAGE_MANAGER_FILES } from "./dependency-check/dependency-check.types.js";
export {
  parseNpmAudit,
  parsePipAudit,
  parseCargoAudit,
} from "./dependency-check/dependency-check.parsers.js";
export { createPrReviewAnalyzer } from "./pr-review/index.js";
export type {
  PrReviewAnalyzerDeps,
  PrReviewContext,
} from "./pr-review/pr-review.analyzer.js";
export { formatPrReviewComment } from "./pr-review/pr-comment-formatter.js";
export type { PrCommentInput } from "./pr-review/pr-comment-formatter.js";
export { createPlatformAuditAnalyzer } from "./platform-audit/index.js";
export type {
  PlatformAuditDeps,
  PlatformAuditContext,
} from "./platform-audit/platform-audit.analyzer.js";
export {
  isK8sFile,
  filterK8sFiles,
  hasK8sFiles,
} from "./platform-audit/k8s-file-detector.js";
