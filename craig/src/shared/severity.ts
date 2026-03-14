/**
 * Canonical Severity type — single source of truth for all components.
 *
 * Both `state/types.ts` and `result-parser/types.ts` previously defined
 * their own Severity types (identical but duplicated). This module
 * eliminates that duplication.
 *
 * [DRY] One definition, re-exported by state and result-parser barrels.
 * [CLEAN-ARCH] Shared kernel — owned by no component, available to all.
 *
 * @module shared/severity
 */

/** Severity levels for findings, ordered from most to least critical. */
export type Severity = "critical" | "high" | "medium" | "low" | "info";

/**
 * Ordered severity levels from most to least critical.
 * Useful for comparison and sorting.
 */
export const SEVERITY_ORDER: readonly Severity[] = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
] as const;

/**
 * Runtime check: is this string a valid Severity level?
 *
 * @param value - The string to validate
 * @returns true if the value is a valid Severity
 */
export function isSeverity(value: string): value is Severity {
  return (SEVERITY_ORDER as readonly string[]).includes(value);
}
