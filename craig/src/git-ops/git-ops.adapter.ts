/**
 * GitOpsAdapter — Worktree-based git operations.
 *
 * Implements GitOpsPort using `child_process.execFile` for safe
 * git command execution. Each operation creates or operates on
 * an isolated git worktree so parallel branches never collide.
 *
 * **Security**: All git commands use `execFile` with argument arrays —
 * never `exec` with string interpolation — to prevent shell injection.
 *
 * @module git-ops
 * @see [HEXAGONAL] — Adapter implementing the GitOpsPort boundary
 * @see [CLEAN-CODE] — Small functions, descriptive names, explicit errors
 * @see [SECURITY] — execFile with arg arrays prevents shell injection
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { GitOpsPort } from "./git-ops.port.js";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * Git operations adapter using worktree isolation.
 *
 * Each `createWorktree` call produces a unique `/tmp/craig-{uuid}` directory
 * with its own checkout, so multiple fixes can run concurrently without
 * interfering with each other or the user's working directory.
 *
 * [SOLID/SRP] One responsibility: translate GitOpsPort calls → git CLI commands.
 */
export class GitOpsAdapter implements GitOpsPort {
  /** Root directory of the main git repository. */
  private readonly repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  /**
   * Create an isolated worktree on a new branch.
   *
   * Runs: `git worktree add /tmp/craig-{uuid} -b {branch} {baseBranch}`
   *
   * @returns Absolute path to the new worktree directory.
   */
  async createWorktree(
    branch: string,
    baseBranch: string,
  ): Promise<string> {
    const worktreePath = `/tmp/craig-${randomUUID()}`;

    await execFileAsync(
      "git",
      ["worktree", "add", worktreePath, "-b", branch, baseBranch],
      { cwd: this.repoRoot },
    );

    return worktreePath;
  }

  /**
   * Write files into a worktree, stage, commit, and return the SHA.
   *
   * Steps:
   * 1. Write each file (creating directories as needed)
   * 2. `git add .`
   * 3. `git commit -m {message}`
   * 4. `git rev-parse HEAD` → return SHA
   *
   * [CLEAN-CODE] Ordered steps, each clearly documented.
   */
  async commitFiles(
    worktreePath: string,
    files: Map<string, string>,
    message: string,
  ): Promise<string> {
    // Step 1: Write files
    for (const [filePath, content] of files) {
      const fullPath = join(worktreePath, filePath);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, "utf-8");
    }

    // Step 2: Stage all changes
    await execFileAsync("git", ["add", "."], { cwd: worktreePath });

    // Step 3: Commit
    await execFileAsync("git", ["commit", "-m", message], {
      cwd: worktreePath,
    });

    // Step 4: Get commit SHA
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd: worktreePath,
    });

    return stdout.trim();
  }

  /**
   * Push a branch to origin from a worktree.
   *
   * Runs: `git push origin {branch}` in the worktree directory.
   */
  async push(worktreePath: string, branch: string): Promise<void> {
    await execFileAsync("git", ["push", "origin", branch], {
      cwd: worktreePath,
    });
  }

  /**
   * Remove a worktree and its directory.
   *
   * Runs: `git worktree remove {path} --force`
   * Uses --force to remove even if there are uncommitted changes.
   */
  async removeWorktree(worktreePath: string): Promise<void> {
    await execFileAsync(
      "git",
      ["worktree", "remove", worktreePath, "--force"],
      { cwd: this.repoRoot },
    );
  }
}
