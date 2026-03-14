/**
 * Dependency-check analyzer — public API barrel file.
 *
 * Re-exports the analyzer class, types, and parsers for external use.
 *
 * @module analyzers/dependency-check
 */

export { DependencyCheckAnalyzer } from "./dependency-check.adapter.js";
export type {
  PackageManager,
  Vulnerability,
  ShellPort,
  CommandResult,
  DependencyCheckDeps,
} from "./dependency-check.types.js";
export { PACKAGE_MANAGER_FILES } from "./dependency-check.types.js";
export {
  parseNpmAudit,
  parsePipAudit,
  parseCargoAudit,
} from "./dependency-check.parsers.js";
