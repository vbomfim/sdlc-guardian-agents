/**
 * Shared module — public API barrel export.
 *
 * Contains cross-cutting types that belong to no single component.
 * All consumers import from here, never from internal modules.
 *
 * @module shared
 */

export type { Severity } from "./severity.js";
export { SEVERITY_ORDER, isSeverity } from "./severity.js";
