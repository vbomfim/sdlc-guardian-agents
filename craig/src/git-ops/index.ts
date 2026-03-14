/**
 * Git-Ops module — barrel exports.
 *
 * Exports the worktree-based GitOpsPort, its adapter, and a bridge
 * function that adapts the worktree API to the stateful GitOpsPort
 * consumed by auto-fix and auto-develop analyzers.
 *
 * @module git-ops
 * @see [HEXAGONAL] — Module boundary with clean public API
 */

export type { GitOpsPort } from "./git-ops.port.js";
export { GitOpsAdapter } from "./git-ops.adapter.js";

// ---------------------------------------------------------------------------
// Bridge: worktree GitOpsPort → auto-fix/auto-develop GitOpsPort
// ---------------------------------------------------------------------------

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitOpsPort } from "./git-ops.port.js";
import type { GitOpsPort as AnalyzerGitOpsPort } from "../analyzers/auto-fix/auto-fix.ports.js";

const execFileAsync = promisify(execFile);

/**
 * Bridge a worktree-based GitOpsPort into the stateful GitOpsPort
 * interface expected by auto-develop (and auto-fix) analyzers.
 *
 * The auto-develop analyzer calls methods like `createBranch(name)` then
 * later `hasChanges()` / `commitAll(msg)` — a stateful API where the
 * "current branch" is implicit. Worktree operations are explicit about
 * which directory they target.
 *
 * This bridge maintains the active worktree path as internal state,
 * translating the stateful calls into explicit worktree operations.
 *
 * @param adapter - Worktree-based GitOpsPort implementation
 * @param baseBranch - Default branch to fork from (e.g., "main")
 * @returns An AnalyzerGitOpsPort compatible with AutoDevelopDeps.gitOps
 *
 * [HEXAGONAL] Adapter pattern — translates between two port interfaces
 * [CLEAN-CODE] State is encapsulated; each method validates preconditions
 */
export function toAnalyzerGitOps(
  adapter: GitOpsPort,
  baseBranch: string,
): AnalyzerGitOpsPort {
  let activeWorktree: string | null = null;

  return {
    async createBranch(name: string): Promise<void> {
      activeWorktree = await adapter.createWorktree(name, baseBranch);
    },

    async hasChanges(): Promise<boolean> {
      if (!activeWorktree) return false;

      const { stdout } = await execFileAsync(
        "git",
        ["status", "--porcelain"],
        { cwd: activeWorktree },
      );

      return stdout.trim().length > 0;
    },

    async getChangedFiles(): Promise<string[]> {
      if (!activeWorktree) return [];

      const { stdout } = await execFileAsync(
        "git",
        ["status", "--porcelain"],
        { cwd: activeWorktree },
      );

      return stdout
        .trim()
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => line.substring(3)); // strip status prefix "?? " / " M " etc.
    },

    async commitAll(message: string): Promise<string> {
      if (!activeWorktree) {
        throw new Error(
          "No active worktree — call createBranch before commitAll",
        );
      }

      await execFileAsync("git", ["add", "-A"], { cwd: activeWorktree });
      await execFileAsync("git", ["commit", "-m", message], {
        cwd: activeWorktree,
      });
      const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
        cwd: activeWorktree,
      });

      return stdout.trim();
    },

    async push(branchName: string): Promise<void> {
      if (!activeWorktree) {
        throw new Error(
          "No active worktree — call createBranch before push",
        );
      }

      await adapter.push(activeWorktree, branchName);
    },

    async cleanup(_branchName: string, _defaultBranch: string): Promise<void> {
      if (!activeWorktree) return;

      await adapter.removeWorktree(activeWorktree);
      activeWorktree = null;
    },
  };
}
