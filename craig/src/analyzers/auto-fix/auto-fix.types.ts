/**
 * Type definitions for the Auto-Fix analyzer.
 *
 * Defines linter configuration, fix results, and the registry
 * of supported linters. Data-driven design — adding a new linter
 * requires only adding an entry to SUPPORTED_LINTERS.
 *
 * @module analyzers/auto-fix
 * @see [CLEAN-CODE] — Data-driven configuration over conditional logic
 */

// ---------------------------------------------------------------------------
// Linter Definition
// ---------------------------------------------------------------------------

/**
 * Configuration for a supported linter.
 *
 * Each linter has detection rules (config files), fix commands,
 * and verification commands. The analyzer iterates this data
 * rather than using per-linter conditionals.
 */
export interface LinterDefinition {
  /** Unique linter identifier (e.g., "eslint", "ruff"). */
  readonly name: string;

  /** Language(s) the linter targets (e.g., "JavaScript/TypeScript"). */
  readonly language: string;

  /** Config file names that indicate this linter is in use. */
  readonly configIndicators: readonly string[];

  /** Command to run the fixer (e.g., "npx"). */
  readonly fixCommand: string;

  /** Arguments for the fix command (e.g., ["eslint", "--fix", "."]). */
  readonly fixArgs: readonly string[];

  /** Command to verify no new issues after fix (e.g., "npx"). */
  readonly verifyCommand: string;

  /** Arguments for the verify command (e.g., ["eslint", "."]). */
  readonly verifyArgs: readonly string[];
}

// ---------------------------------------------------------------------------
// Fix Results
// ---------------------------------------------------------------------------

/**
 * Result of running a single linter fixer.
 */
export interface FixerResult {
  /** Name of the linter that was run. */
  readonly linterName: string;

  /** Language targeted by this linter. */
  readonly language: string;

  /** Exit code of the fix command (0 = success). */
  readonly exitCode: number;

  /** Standard output from the fix command. */
  readonly stdout: string;

  /** Standard error from the fix command. */
  readonly stderr: string;
}

// ---------------------------------------------------------------------------
// Linter Registry
// ---------------------------------------------------------------------------

/**
 * Registry of supported linters.
 *
 * To add a new linter, simply add an entry here.
 * No code changes needed in the analyzer logic.
 *
 * @see [CLEAN-CODE] — Open/Closed: extend by adding data, not modifying code
 */
export const SUPPORTED_LINTERS: readonly LinterDefinition[] = [
  {
    name: "eslint",
    language: "JavaScript/TypeScript",
    configIndicators: [
      "eslint.config.js",
      "eslint.config.mjs",
      "eslint.config.cjs",
      ".eslintrc.json",
      ".eslintrc.js",
      ".eslintrc.yml",
      ".eslintrc.yaml",
      ".eslintrc",
    ],
    fixCommand: "npx",
    fixArgs: ["eslint", "--fix", "."],
    verifyCommand: "npx",
    verifyArgs: ["eslint", "."],
  },
  {
    name: "ruff",
    language: "Python",
    configIndicators: ["ruff.toml", "pyproject.toml"],
    fixCommand: "ruff",
    fixArgs: ["check", "--fix", "."],
    verifyCommand: "ruff",
    verifyArgs: ["check", "."],
  },
  {
    name: "cargo-clippy",
    language: "Rust",
    configIndicators: ["Cargo.toml"],
    fixCommand: "cargo",
    fixArgs: ["clippy", "--fix", "--allow-dirty", "--allow-staged"],
    verifyCommand: "cargo",
    verifyArgs: ["clippy"],
  },
];
