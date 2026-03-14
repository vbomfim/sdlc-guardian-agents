/**
 * Platform Audit — public API barrel export.
 *
 * All consumers import from here, never from internals.
 *
 * @module analyzers/platform-audit
 */

export { createPlatformAuditAnalyzer } from "./platform-audit.analyzer.js";
export type {
  PlatformAuditDeps,
  PlatformAuditContext,
} from "./platform-audit.analyzer.js";
export {
  isK8sFile,
  filterK8sFiles,
  hasK8sFiles,
} from "./k8s-file-detector.js";
