/**
 * Auto-Fix Analyzer — public API barrel export.
 *
 * Consumers import from here, not from internal modules.
 *
 * @module analyzers/auto-fix
 */

export { AutoFixAnalyzer } from "./auto-fix.analyzer.js";
export type {
  CommandRunnerPort,
  CommandResult,
  GitOpsPort,
} from "./auto-fix.ports.js";
export type { LinterDefinition, FixerResult } from "./auto-fix.types.js";
export { SUPPORTED_LINTERS } from "./auto-fix.types.js";
export { FixVerificationError, GitOpsError } from "./auto-fix.errors.js";
