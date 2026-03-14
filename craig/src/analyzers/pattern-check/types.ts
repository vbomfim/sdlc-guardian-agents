/**
 * Type definitions for the Pattern Check analyzer component.
 *
 * Defines PatternRule, PatternSet, and PatternDeviation — the data models
 * owned by this component. No other component should define these types.
 *
 * @module analyzers/pattern-check/types
 */

// ---------------------------------------------------------------------------
// Pattern Rule
// ---------------------------------------------------------------------------

/** Severity for pattern deviations. */
export type PatternSeverity = "warning" | "info";

/**
 * A single learned coding pattern from the repository.
 *
 * Represents a convention observed in the existing codebase
 * (e.g., "error handling uses Result<T> type").
 */
export interface PatternRule {
  /** Short name for the pattern (e.g., "result-type-error-handling"). */
  readonly name: string;

  /** The observed pattern description or regex. */
  readonly pattern: string;

  /** Frequency of occurrence (e.g., "15/18 files"). */
  readonly frequency: string;

  /** How severe a deviation from this pattern is. */
  readonly severity: PatternSeverity;

  /** Human-readable description of the convention. */
  readonly description: string;
}

// ---------------------------------------------------------------------------
// Pattern Set
// ---------------------------------------------------------------------------

/**
 * Complete set of learned patterns for a repository.
 *
 * Persisted to `.craig-patterns.json`. Each category contains
 * rules that the Pattern Check analyzer enforces on new code.
 */
export interface PatternSet {
  /** Naming conventions (variables, functions, files, classes). */
  readonly naming_conventions: PatternRule[];

  /** File and directory structure patterns. */
  readonly file_structure: PatternRule[];

  /** Error handling patterns (Result types, try/catch, custom errors). */
  readonly error_handling: PatternRule[];

  /** Import conventions (barrel exports, relative vs absolute, ordering). */
  readonly import_conventions: PatternRule[];

  /** ISO 8601 timestamp when patterns were learned. */
  readonly learned_at: string;
}

// ---------------------------------------------------------------------------
// Pattern Deviation
// ---------------------------------------------------------------------------

/**
 * A deviation from an established pattern found in new code.
 *
 * Generated when the analyzer compares a merge diff against
 * the learned PatternSet and finds inconsistencies.
 */
export interface PatternDeviation {
  /** Which pattern rule was violated. */
  readonly rule_name: string;

  /** Which category the deviation belongs to. */
  readonly category: "naming" | "structure" | "error_handling" | "imports";

  /** File where the deviation was found. */
  readonly file: string;

  /** Human-readable description of the deviation. */
  readonly description: string;

  /** Severity of the deviation. */
  readonly severity: PatternSeverity;
}
