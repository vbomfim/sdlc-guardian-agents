/**
 * Port for local git operations using worktree isolation.
 *
 * Worktrees provide isolated checkouts — each branch gets its own
 * directory, so parallel operations (e.g., multiple auto-develop fixes)
 * cannot interfere with each other or with the user's working directory.
 *
 * @module git-ops
 * @see [HEXAGONAL] — Port defining the boundary for local git operations
 * @see [SOLID/DIP] — Consumers depend on this abstraction, not child_process
 */

// ---------------------------------------------------------------------------
// GitOpsPort — Worktree-based local git operations
// ---------------------------------------------------------------------------

/**
 * Port for local git operations using worktree isolation.
 *
 * Each operation is explicit about which worktree it targets,
 * making the API safe for concurrent use across multiple branches.
 *
 * **Security**: Implementations MUST use `execFile` (not `exec`)
 * with argument arrays to prevent shell injection.
 */
export interface GitOpsPort {
  /**
   * Create an isolated git worktree on a new branch.
   *
   * Equivalent to: `git worktree add /tmp/craig-{uuid} -b {branch} {baseBranch}`
   *
   * @param branch - New branch name to create (e.g., "craig/fix-finding-001")
   * @param baseBranch - Base branch to fork from (e.g., "main")
   * @returns Absolute path to the worktree directory
   */
  createWorktree(branch: string, baseBranch: string): Promise<string>;

  /**
   * Write files, stage all changes, and commit in a worktree.
   *
   * Writes each entry in `files` to the worktree, runs `git add .`,
   * then `git commit -m {message}`.
   *
   * @param worktreePath - Absolute path to the worktree
   * @param files - Map of relative file paths → file contents
   * @param message - Commit message
   * @returns The commit SHA
   */
  commitFiles(
    worktreePath: string,
    files: Map<string, string>,
    message: string,
  ): Promise<string>;

  /**
   * Push a branch to the remote origin from a worktree.
   *
   * Equivalent to: `git push origin {branch}` (run inside the worktree).
   *
   * @param worktreePath - Absolute path to the worktree
   * @param branch - Branch name to push
   */
  push(worktreePath: string, branch: string): Promise<void>;

  /**
   * Remove a git worktree and clean up its directory.
   *
   * Equivalent to: `git worktree remove {worktreePath} --force`
   *
   * @param worktreePath - Absolute path to the worktree to remove
   */
  removeWorktree(worktreePath: string): Promise<void>;
}
