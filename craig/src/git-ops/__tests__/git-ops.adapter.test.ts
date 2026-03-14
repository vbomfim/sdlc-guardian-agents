/**
 * GitOpsAdapter — Unit Tests
 *
 * Tests for the worktree-based git operations adapter.
 * All child_process.execFile calls are mocked to avoid real git operations.
 *
 * Test categories:
 * - createWorktree: creates worktree with correct args, returns path
 * - commitFiles: writes files, stages, commits, returns SHA
 * - push: pushes branch to origin
 * - removeWorktree: removes worktree with --force
 * - toAnalyzerGitOps bridge: adapts worktree API to stateful GitOpsPort
 * - Error handling: rejects on git failures, provides context
 * - Security: uses execFile (not exec) for injection safety
 *
 * [TDD] Written BEFORE implementation — Red phase.
 *
 * @module git-ops/__tests__
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — must be before imports
// ---------------------------------------------------------------------------

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("node:crypto", () => ({
  randomUUID: vi.fn().mockReturnValue("test-uuid-1234"),
}));

import { execFile } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
import { GitOpsAdapter } from "../git-ops.adapter.js";
import { toAnalyzerGitOps } from "../index.js";
import type { GitOpsPort } from "../git-ops.port.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Configure the mocked execFile to resolve with given stdout/stderr.
 *
 * child_process.execFile uses a callback signature:
 *   execFile(file, args, options, callback)
 *
 * Our adapter wraps it with util.promisify, so the mock must call the
 * callback with (null, { stdout, stderr }).
 */
function mockExecFileSuccess(stdout = "", stderr = ""): void {
  (execFile as unknown as Mock).mockImplementation(
    (
      _file: string,
      _args: string[],
      _opts: Record<string, unknown>,
      cb: (err: Error | null, result: { stdout: string; stderr: string }) => void,
    ) => {
      cb(null, { stdout, stderr });
    },
  );
}

function mockExecFileFailure(message: string): void {
  (execFile as unknown as Mock).mockImplementation(
    (
      _file: string,
      _args: string[],
      _opts: Record<string, unknown>,
      cb: (err: Error | null) => void,
    ) => {
      cb(new Error(message));
    },
  );
}

/**
 * mockExecFileSequence — configure sequential execFile responses.
 *
 * Each call to execFile will use the next response in the list.
 * Useful for testing multi-step operations like commitFiles
 * (which calls git add then git commit then git rev-parse).
 */
function mockExecFileSequence(
  responses: Array<{ stdout?: string; stderr?: string; error?: string }>,
): void {
  let callIndex = 0;
  (execFile as unknown as Mock).mockImplementation(
    (
      _file: string,
      _args: string[],
      _opts: Record<string, unknown>,
      cb: (
        err: Error | null,
        result?: { stdout: string; stderr: string },
      ) => void,
    ) => {
      const response = responses[callIndex] ?? { stdout: "" };
      callIndex++;
      if (response.error) {
        cb(new Error(response.error));
      } else {
        cb(null, { stdout: response.stdout ?? "", stderr: response.stderr ?? "" });
      }
    },
  );
}

// ---------------------------------------------------------------------------
// GitOpsAdapter — createWorktree
// ---------------------------------------------------------------------------

describe("GitOpsAdapter", () => {
  let adapter: GitOpsAdapter;
  const REPO_ROOT = "/repo";

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new GitOpsAdapter(REPO_ROOT);
  });

  describe("createWorktree", () => {
    it("calls git worktree add with correct arguments", async () => {
      mockExecFileSuccess();

      await adapter.createWorktree("craig/fix-001", "main");

      expect(execFile).toHaveBeenCalledWith(
        "git",
        ["worktree", "add", "/tmp/craig-test-uuid-1234", "-b", "craig/fix-001", "main"],
        { cwd: REPO_ROOT },
        expect.any(Function),
      );
    });

    it("returns the worktree path", async () => {
      mockExecFileSuccess();

      const path = await adapter.createWorktree("craig/fix-001", "main");

      expect(path).toBe("/tmp/craig-test-uuid-1234");
    });

    it("uses unique UUID for each worktree", async () => {
      mockExecFileSuccess();
      const { randomUUID } = await import("node:crypto");

      (randomUUID as Mock)
        .mockReturnValueOnce("uuid-aaa")
        .mockReturnValueOnce("uuid-bbb");

      const path1 = await adapter.createWorktree("branch-a", "main");
      const path2 = await adapter.createWorktree("branch-b", "main");

      expect(path1).toBe("/tmp/craig-uuid-aaa");
      expect(path2).toBe("/tmp/craig-uuid-bbb");
    });

    it("rejects when git worktree add fails", async () => {
      mockExecFileFailure("fatal: branch already exists");

      await expect(
        adapter.createWorktree("existing-branch", "main"),
      ).rejects.toThrow("fatal: branch already exists");
    });
  });

  // -------------------------------------------------------------------------
  // commitFiles
  // -------------------------------------------------------------------------

  describe("commitFiles", () => {
    it("writes each file to the worktree directory", async () => {
      mockExecFileSequence([
        { stdout: "" },                   // git add .
        { stdout: "" },                   // git commit
        { stdout: "abc123def456\n" },     // git rev-parse HEAD
      ]);

      const files = new Map<string, string>([
        ["src/fix.ts", 'console.log("fixed");'],
        ["tests/fix.test.ts", 'test("it works", () => {});'],
      ]);

      await adapter.commitFiles("/tmp/craig-wt", files, "fix: patch");

      expect(writeFile).toHaveBeenCalledWith(
        "/tmp/craig-wt/src/fix.ts",
        'console.log("fixed");',
        "utf-8",
      );
      expect(writeFile).toHaveBeenCalledWith(
        "/tmp/craig-wt/tests/fix.test.ts",
        'test("it works", () => {});',
        "utf-8",
      );
    });

    it("creates parent directories for nested files", async () => {
      mockExecFileSequence([
        { stdout: "" },
        { stdout: "" },
        { stdout: "sha1\n" },
      ]);

      const files = new Map<string, string>([
        ["src/deep/nested/file.ts", "content"],
      ]);

      await adapter.commitFiles("/tmp/craig-wt", files, "fix: nested");

      expect(mkdir).toHaveBeenCalledWith("/tmp/craig-wt/src/deep/nested", {
        recursive: true,
      });
    });

    it("stages all changes with git add", async () => {
      mockExecFileSequence([
        { stdout: "" },                   // git add .
        { stdout: "" },                   // git commit
        { stdout: "sha1\n" },             // git rev-parse HEAD
      ]);

      await adapter.commitFiles(
        "/tmp/craig-wt",
        new Map([["a.ts", "x"]]),
        "msg",
      );

      expect(execFile).toHaveBeenCalledWith(
        "git",
        ["add", "."],
        { cwd: "/tmp/craig-wt" },
        expect.any(Function),
      );
    });

    it("commits with the provided message", async () => {
      mockExecFileSequence([
        { stdout: "" },
        { stdout: "" },
        { stdout: "sha1\n" },
      ]);

      await adapter.commitFiles(
        "/tmp/craig-wt",
        new Map([["a.ts", "x"]]),
        "fix: address critical SQL injection",
      );

      expect(execFile).toHaveBeenCalledWith(
        "git",
        ["commit", "-m", "fix: address critical SQL injection"],
        { cwd: "/tmp/craig-wt" },
        expect.any(Function),
      );
    });

    it("returns the commit SHA (trimmed)", async () => {
      mockExecFileSequence([
        { stdout: "" },
        { stdout: "" },
        { stdout: "  abc123def456  \n" },
      ]);

      const sha = await adapter.commitFiles(
        "/tmp/craig-wt",
        new Map([["a.ts", "x"]]),
        "msg",
      );

      expect(sha).toBe("abc123def456");
    });

    it("rejects when git commit fails", async () => {
      mockExecFileSequence([
        { stdout: "" },                       // git add succeeds
        { error: "nothing to commit" },       // git commit fails
      ]);

      await expect(
        adapter.commitFiles("/tmp/craig-wt", new Map([["a.ts", "x"]]), "msg"),
      ).rejects.toThrow("nothing to commit");
    });
  });

  // -------------------------------------------------------------------------
  // push
  // -------------------------------------------------------------------------

  describe("push", () => {
    it("calls git push origin with branch name", async () => {
      mockExecFileSuccess();

      await adapter.push("/tmp/craig-wt", "craig/fix-001");

      expect(execFile).toHaveBeenCalledWith(
        "git",
        ["push", "origin", "craig/fix-001"],
        { cwd: "/tmp/craig-wt" },
        expect.any(Function),
      );
    });

    it("rejects when push fails", async () => {
      mockExecFileFailure("rejected: non-fast-forward");

      await expect(
        adapter.push("/tmp/craig-wt", "craig/fix-001"),
      ).rejects.toThrow("rejected: non-fast-forward");
    });
  });

  // -------------------------------------------------------------------------
  // removeWorktree
  // -------------------------------------------------------------------------

  describe("removeWorktree", () => {
    it("calls git worktree remove with --force", async () => {
      mockExecFileSuccess();

      await adapter.removeWorktree("/tmp/craig-wt");

      expect(execFile).toHaveBeenCalledWith(
        "git",
        ["worktree", "remove", "/tmp/craig-wt", "--force"],
        { cwd: REPO_ROOT },
        expect.any(Function),
      );
    });

    it("rejects when remove fails", async () => {
      mockExecFileFailure("not a valid worktree");

      await expect(
        adapter.removeWorktree("/tmp/craig-wt"),
      ).rejects.toThrow("not a valid worktree");
    });
  });
});

// ---------------------------------------------------------------------------
// toAnalyzerGitOps — Bridge to auto-fix/auto-develop GitOpsPort
// ---------------------------------------------------------------------------

describe("toAnalyzerGitOps", () => {
  const BASE_BRANCH = "main";

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: bridge's internal execFile calls succeed with empty output
    mockExecFileSuccess("");
  });

  function createMockAdapter(): GitOpsPort {
    return {
      createWorktree: vi.fn<GitOpsPort["createWorktree"]>().mockResolvedValue("/tmp/craig-mock-wt"),
      commitFiles: vi.fn<GitOpsPort["commitFiles"]>().mockResolvedValue("sha-abc"),
      push: vi.fn<GitOpsPort["push"]>().mockResolvedValue(undefined),
      removeWorktree: vi.fn<GitOpsPort["removeWorktree"]>().mockResolvedValue(undefined),
    };
  }

  describe("createBranch", () => {
    it("delegates to adapter.createWorktree with baseBranch", async () => {
      const mock = createMockAdapter();
      const bridge = toAnalyzerGitOps(mock, BASE_BRANCH);

      await bridge.createBranch("craig/fix-001");

      expect(mock.createWorktree).toHaveBeenCalledWith("craig/fix-001", "main");
    });
  });

  describe("hasChanges", () => {
    it("returns false when no worktree is active", async () => {
      const mock = createMockAdapter();
      const bridge = toAnalyzerGitOps(mock, BASE_BRANCH);

      const result = await bridge.hasChanges();

      expect(result).toBe(false);
    });

    it("returns true when worktree has uncommitted changes", async () => {
      mockExecFileSuccess(" M src/db.py\n");

      const mock = createMockAdapter();
      const bridge = toAnalyzerGitOps(mock, BASE_BRANCH);

      await bridge.createBranch("craig/fix-001");

      const result = await bridge.hasChanges();

      expect(result).toBe(true);
      expect(execFile).toHaveBeenCalledWith(
        "git",
        ["status", "--porcelain"],
        { cwd: "/tmp/craig-mock-wt" },
        expect.any(Function),
      );
    });
  });

  describe("getChangedFiles", () => {
    it("returns empty array when no worktree is active", async () => {
      const mock = createMockAdapter();
      const bridge = toAnalyzerGitOps(mock, BASE_BRANCH);

      const result = await bridge.getChangedFiles();

      expect(result).toEqual([]);
    });
  });

  describe("commitAll", () => {
    it("throws when no worktree is active", async () => {
      const mock = createMockAdapter();
      const bridge = toAnalyzerGitOps(mock, BASE_BRANCH);

      await expect(bridge.commitAll("msg")).rejects.toThrow(
        "No active worktree",
      );
    });
  });

  describe("push", () => {
    it("delegates to adapter.push with worktree path and branch", async () => {
      const mock = createMockAdapter();
      const bridge = toAnalyzerGitOps(mock, BASE_BRANCH);

      await bridge.createBranch("craig/fix-001");
      await bridge.push("craig/fix-001");

      expect(mock.push).toHaveBeenCalledWith("/tmp/craig-mock-wt", "craig/fix-001");
    });

    it("throws when no worktree is active", async () => {
      const mock = createMockAdapter();
      const bridge = toAnalyzerGitOps(mock, BASE_BRANCH);

      await expect(bridge.push("craig/fix-001")).rejects.toThrow(
        "No active worktree",
      );
    });
  });

  describe("cleanup", () => {
    it("delegates to adapter.removeWorktree", async () => {
      const mock = createMockAdapter();
      const bridge = toAnalyzerGitOps(mock, BASE_BRANCH);

      await bridge.createBranch("craig/fix-001");
      await bridge.cleanup("craig/fix-001", "main");

      expect(mock.removeWorktree).toHaveBeenCalledWith("/tmp/craig-mock-wt");
    });

    it("resets active worktree after cleanup", async () => {
      const mock = createMockAdapter();
      const bridge = toAnalyzerGitOps(mock, BASE_BRANCH);

      await bridge.createBranch("craig/fix-001");
      await bridge.cleanup("craig/fix-001", "main");

      // After cleanup, push should throw (no active worktree)
      await expect(bridge.push("craig/fix-001")).rejects.toThrow(
        "No active worktree",
      );
    });

    it("is safe to call when no worktree is active (no-op)", async () => {
      const mock = createMockAdapter();
      const bridge = toAnalyzerGitOps(mock, BASE_BRANCH);

      // Should not throw
      await bridge.cleanup("craig/fix-001", "main");

      expect(mock.removeWorktree).not.toHaveBeenCalled();
    });
  });
});
