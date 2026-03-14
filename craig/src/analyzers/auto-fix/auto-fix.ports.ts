/**
 * Ports (interfaces) for the Auto-Fix analyzer's external dependencies.
 *
 * These ports decouple the analyzer from shell execution and git operations.
 * Each port can be mocked in tests and swapped in production.
 *
 * @module analyzers/auto-fix
 * @see [HEXAGONAL] — Adapter boundaries for shell and git operations
 * @see [SOLID/DIP] — Depend on abstractions, not concretions
 */

// ---------------------------------------------------------------------------
// Command Runner
// ---------------------------------------------------------------------------

/**
 * Result of executing a shell command.
 */
export interface CommandResult {
  /** Process exit code (0 = success). */
  readonly exitCode: number;

  /** Standard output. */
  readonly stdout: string;

  /** Standard error output. */
  readonly stderr: string;
}

/**
 * Port for running shell commands.
 *
 * Abstracts `child_process.exec` / `spawn` behind a testable interface.
 * The auto-fix analyzer uses this to run linter fix commands.
 */
export interface CommandRunnerPort {
  /**
   * Execute a command with arguments.
   *
   * @param command - The command to run (e.g., "npx", "ruff")
   * @param args - Command arguments (e.g., ["eslint", "--fix", "."])
   * @returns CommandResult — never throws, captures exit code instead
   */
  run(command: string, args: readonly string[]): Promise<CommandResult>;

  /**
   * Check if a file exists at the given path (relative to working directory).
   *
   * Used to detect which linters are applicable by checking for config files.
   *
   * @param path - File path to check (e.g., "eslint.config.js")
   * @returns true if the file exists, false otherwise
   */
  fileExists(path: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Git Operations
// ---------------------------------------------------------------------------

/**
 * Port for local git operations.
 *
 * Abstracts git CLI commands behind a testable interface.
 * The auto-fix analyzer uses this to create branches, commit, and push.
 *
 * Note: This is separate from GitHubPort (which talks to the GitHub API).
 * GitOpsPort handles local git operations (branch, commit, push).
 */
export interface GitOpsPort {
  /**
   * Create and checkout a new branch from the current HEAD.
   *
   * @param name - Branch name (e.g., "craig/fix-lint-2024-01-15")
   */
  createBranch(name: string): Promise<void>;

  /**
   * Check if there are uncommitted changes in the working tree.
   *
   * @returns true if there are changes (staged or unstaged), false otherwise
   */
  hasChanges(): Promise<boolean>;

  /**
   * Get the list of changed files (staged and unstaged).
   *
   * @returns Array of file paths with changes
   */
  getChangedFiles(): Promise<string[]>;

  /**
   * Stage all changes and commit with the given message.
   *
   * @param message - Commit message
   * @returns The commit SHA
   */
  commitAll(message: string): Promise<string>;

  /**
   * Push a branch to the remote origin.
   *
   * @param branchName - Branch name to push
   */
  push(branchName: string): Promise<void>;

  /**
   * Clean up: checkout default branch and delete the given branch.
   *
   * Used when aborting a fix (e.g., verification found new issues).
   *
   * @param branchName - Branch to delete
   * @param defaultBranch - Branch to checkout before deleting (e.g., "main")
   */
  cleanup(branchName: string, defaultBranch: string): Promise<void>;
}
