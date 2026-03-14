/**
 * Type definitions for the dependency-check analyzer component.
 *
 * Defines package manager detection, vulnerability data models,
 * and the ShellPort interface for command execution.
 *
 * @module analyzers/dependency-check
 */

import type { Severity } from "../../state/index.js";

/* ------------------------------------------------------------------ */
/*  Package Manager Detection                                          */
/* ------------------------------------------------------------------ */

/** Supported package managers for dependency auditing. */
export type PackageManager = "npm" | "pip" | "cargo";

/** Maps package manager to the file that signals its presence. */
export const PACKAGE_MANAGER_FILES: ReadonlyMap<PackageManager, readonly string[]> =
  new Map([
    ["npm", ["package.json"]],
    ["pip", ["requirements.txt", "pyproject.toml"]],
    ["cargo", ["Cargo.toml"]],
  ]);

/* ------------------------------------------------------------------ */
/*  Vulnerability Data Model                                           */
/* ------------------------------------------------------------------ */

/**
 * A vulnerability discovered by a package manager's audit tool.
 *
 * Normalized across all package managers to a single shape.
 * Parsers are responsible for mapping PM-specific output to this type.
 */
export interface Vulnerability {
  /** Name of the affected package. */
  readonly package_name: string;
  /** Currently installed version (may be empty if unknown). */
  readonly current_version: string;
  /** Normalized severity level. */
  readonly severity: Severity;
  /** CVE identifier (e.g., "CVE-2023-1234") or advisory ID. */
  readonly advisory_id: string;
  /** Fixed version, if available. */
  readonly fixed_version: string | null;
  /** Human-readable description of the vulnerability. */
  readonly description: string;
  /** Advisory URL for reference. */
  readonly advisory_url: string | null;
  /** Which package manager found this vulnerability. */
  readonly package_manager: PackageManager;
}

/* ------------------------------------------------------------------ */
/*  Shell Command Execution Port                                       */
/* ------------------------------------------------------------------ */

/** Result of running a shell command. */
export interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exit_code: number;
}

/**
 * ShellPort — injectable interface for shell command execution.
 *
 * [HEXAGONAL] Keeps the analyzer testable by abstracting OS interaction.
 * In production, executes real commands. In tests, returns canned output.
 */
export interface ShellPort {
  /** Execute a shell command with arguments. */
  run(command: string, args: readonly string[]): Promise<CommandResult>;

  /** Check if a file exists at the given path. */
  fileExists(path: string): Promise<boolean>;
}

/* ------------------------------------------------------------------ */
/*  Analyzer Dependencies                                              */
/* ------------------------------------------------------------------ */

import type { GitHubPort } from "../../github/index.js";
import type { StatePort } from "../../state/index.js";

/**
 * Dependencies injected into the DependencyCheckAnalyzer.
 *
 * [SOLID/DIP] All dependencies are injected via interfaces.
 */
export interface DependencyCheckDeps {
  readonly github: GitHubPort;
  readonly state: StatePort;
  readonly shell: ShellPort;
  /** Absolute path to the repository root for file detection. */
  readonly repoRoot: string;
}
