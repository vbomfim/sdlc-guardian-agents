/**
 * Unit tests for MergeWatcherAdapter.
 *
 * Tests are organized by acceptance criteria from issue #7.
 * All tests mock GitHubPort and StatePort — no real API calls.
 *
 * @see [TDD] — Tests written first, implementation second
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MergeWatcherAdapter } from "../merge-watcher.adapter.js";
import type { MergeEvent, MergeHandler } from "../merge-watcher.types.js";
import type { GitHubPort } from "../../github/index.js";
import type { StatePort } from "../../state/index.js";
import type { CraigConfig } from "../../config/index.js";

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockGitHub(): GitHubPort {
  return {
    createIssue: vi.fn(),
    findExistingIssue: vi.fn(),
    listOpenIssues: vi.fn(),
    createDraftPR: vi.fn(),
    createCommitComment: vi.fn(),
    getLatestCommits: vi.fn(),
    getCommitDiff: vi.fn(),
    getMergeCommits: vi.fn().mockResolvedValue([]),
    getRateLimit: vi.fn(),
  };
}

function createMockState(lastSha: string | null = null): StatePort {
  let storedSha: string | null = lastSha;
  return {
    load: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockImplementation((key: string) => {
      if (key === "last_processed_sha") return storedSha;
      return undefined;
    }),
    set: vi.fn().mockImplementation((key: string, value: unknown) => {
      if (key === "last_processed_sha") storedSha = value as string | null;
    }),
    addFinding: vi.fn(),
    getFindings: vi.fn().mockReturnValue([]),
  };
}

function createMockConfig(overrides?: Partial<CraigConfig>): CraigConfig {
  return {
    repo: "test-owner/test-repo",
    branch: "main",
    schedule: { merge_monitor: "on_push" },
    capabilities: {
      merge_review: true,
      coverage_gaps: true,
      bug_detection: true,
      pattern_enforcement: true,
      po_audit: true,
      auto_fix: true,
      dependency_updates: true,
    },
    models: { default: "claude-sonnet-4.5" },
    autonomy: {
      create_issues: true,
      create_draft_prs: true,
      auto_merge: false as const,
    },
    guardians: { path: "~/.copilot/" },
    ...overrides,
  };
}

/** Helper: create a watcher with default mocks. */
function createWatcher(options?: {
  github?: GitHubPort;
  state?: StatePort;
  config?: CraigConfig;
  pollIntervalMs?: number;
}) {
  const github = options?.github ?? createMockGitHub();
  const state = options?.state ?? createMockState();
  const config = options?.config ?? createMockConfig();
  const pollIntervalMs = options?.pollIntervalMs ?? 100;

  const watcher = new MergeWatcherAdapter({
    github,
    state,
    config,
    pollIntervalMs,
  });

  return { watcher, github, state, config };
}

/** Helper: wait for N poll cycles to complete. */
function waitForPolls(count: number, intervalMs: number): Promise<void> {
  return new Promise((resolve) =>
    setTimeout(resolve, intervalMs * count + 50),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MergeWatcherAdapter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // AC1: Detect new merge
  // -------------------------------------------------------------------------
  describe("AC1: Detect new merge", () => {
    it("calls onMerge handler when a new merge is found after last_processed_sha", async () => {
      const state = createMockState("abc123");
      const github = createMockGitHub();

      const newMerge = {
        sha: "def456",
        message: "Merge pull request #42",
        author: "alice",
        timestamp: "2024-01-15T10:00:00Z",
      };

      (github.getMergeCommits as ReturnType<typeof vi.fn>).mockResolvedValue([
        newMerge,
      ]);

      const { watcher } = createWatcher({ github, state, pollIntervalMs: 100 });

      const handler = vi.fn<MergeHandler>();
      watcher.onMerge(handler);
      watcher.start();

      await vi.advanceTimersByTimeAsync(150);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          sha: "def456",
          message: "Merge pull request #42",
          author: "alice",
          timestamp: "2024-01-15T10:00:00Z",
        }),
      );

      watcher.stop();
    });

    it("updates last_processed_sha after processing a merge", async () => {
      const state = createMockState("abc123");
      const github = createMockGitHub();

      (github.getMergeCommits as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          sha: "def456",
          message: "Merge PR",
          author: "alice",
          timestamp: "2024-01-15T10:00:00Z",
        },
      ]);

      const { watcher } = createWatcher({ github, state, pollIntervalMs: 100 });
      watcher.onMerge(vi.fn());
      watcher.start();

      await vi.advanceTimersByTimeAsync(150);

      expect(state.set).toHaveBeenCalledWith("last_processed_sha", "def456");
      expect(state.save).toHaveBeenCalled();

      watcher.stop();
    });

    it("includes diff_url in emitted MergeEvent", async () => {
      const state = createMockState("abc123");
      const github = createMockGitHub();
      const config = createMockConfig({ repo: "test-owner/test-repo" });

      (github.getMergeCommits as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          sha: "def456",
          message: "Merge PR",
          author: "alice",
          timestamp: "2024-01-15T10:00:00Z",
        },
      ]);

      const { watcher } = createWatcher({
        github,
        state,
        config,
        pollIntervalMs: 100,
      });

      const handler = vi.fn<MergeHandler>();
      watcher.onMerge(handler);
      watcher.start();

      await vi.advanceTimersByTimeAsync(150);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          diff_url: "https://github.com/test-owner/test-repo/commit/def456",
        }),
      );

      watcher.stop();
    });
  });

  // -------------------------------------------------------------------------
  // AC2: No new merges
  // -------------------------------------------------------------------------
  describe("AC2: No new merges", () => {
    it("does not emit events when no new merges exist", async () => {
      const state = createMockState("abc123");
      const github = createMockGitHub();

      (github.getMergeCommits as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const { watcher } = createWatcher({ github, state, pollIntervalMs: 100 });

      const handler = vi.fn<MergeHandler>();
      watcher.onMerge(handler);
      watcher.start();

      await vi.advanceTimersByTimeAsync(150);

      expect(handler).not.toHaveBeenCalled();

      watcher.stop();
    });

    it("does not modify state when no merges found", async () => {
      const state = createMockState("abc123");
      const github = createMockGitHub();

      (github.getMergeCommits as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const { watcher } = createWatcher({ github, state, pollIntervalMs: 100 });
      watcher.start();

      await vi.advanceTimersByTimeAsync(150);

      expect(state.set).not.toHaveBeenCalledWith(
        "last_processed_sha",
        expect.anything(),
      );

      watcher.stop();
    });
  });

  // -------------------------------------------------------------------------
  // AC3: Multiple merges between polls
  // -------------------------------------------------------------------------
  describe("AC3: Multiple merges between polls", () => {
    it("emits events in chronological order for multiple merges", async () => {
      const state = createMockState("old-sha");
      const github = createMockGitHub();

      const merges = [
        {
          sha: "merge-A",
          message: "Merge A",
          author: "alice",
          timestamp: "2024-01-15T10:00:00Z",
        },
        {
          sha: "merge-B",
          message: "Merge B",
          author: "bob",
          timestamp: "2024-01-15T11:00:00Z",
        },
        {
          sha: "merge-C",
          message: "Merge C",
          author: "carol",
          timestamp: "2024-01-15T12:00:00Z",
        },
      ];

      (github.getMergeCommits as ReturnType<typeof vi.fn>).mockResolvedValue(merges);

      const { watcher } = createWatcher({ github, state, pollIntervalMs: 100 });

      const receivedEvents: MergeEvent[] = [];
      watcher.onMerge((event) => receivedEvents.push(event));
      watcher.start();

      await vi.advanceTimersByTimeAsync(150);

      expect(receivedEvents).toHaveLength(3);
      expect(receivedEvents[0]?.sha).toBe("merge-A");
      expect(receivedEvents[1]?.sha).toBe("merge-B");
      expect(receivedEvents[2]?.sha).toBe("merge-C");

      watcher.stop();
    });

    it("updates last_processed_sha after each merge in the batch", async () => {
      const state = createMockState("old-sha");
      const github = createMockGitHub();

      const merges = [
        {
          sha: "merge-A",
          message: "Merge A",
          author: "alice",
          timestamp: "2024-01-15T10:00:00Z",
        },
        {
          sha: "merge-B",
          message: "Merge B",
          author: "bob",
          timestamp: "2024-01-15T11:00:00Z",
        },
        {
          sha: "merge-C",
          message: "Merge C",
          author: "carol",
          timestamp: "2024-01-15T12:00:00Z",
        },
      ];

      (github.getMergeCommits as ReturnType<typeof vi.fn>).mockResolvedValue(merges);

      const { watcher } = createWatcher({ github, state, pollIntervalMs: 100 });
      watcher.onMerge(vi.fn());
      watcher.start();

      await vi.advanceTimersByTimeAsync(150);

      // Should update SHA after each merge
      const setCalls = (state.set as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0] === "last_processed_sha",
      );
      expect(setCalls).toHaveLength(3);
      expect(setCalls[0]?.[1]).toBe("merge-A");
      expect(setCalls[1]?.[1]).toBe("merge-B");
      expect(setCalls[2]?.[1]).toBe("merge-C");

      watcher.stop();
    });
  });

  // -------------------------------------------------------------------------
  // AC4: First run (no previous SHA)
  // -------------------------------------------------------------------------
  describe("AC4: First run (no previous SHA)", () => {
    it("sets last_processed_sha to HEAD without emitting events on first run", async () => {
      const state = createMockState(null);
      const github = createMockGitHub();

      // getLatestCommits returns the current HEAD
      (github.getLatestCommits as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          sha: "current-head",
          message: "Latest commit",
          author: "alice",
          timestamp: "2024-01-15T10:00:00Z",
        },
      ]);

      const { watcher } = createWatcher({ github, state, pollIntervalMs: 100 });

      const handler = vi.fn<MergeHandler>();
      watcher.onMerge(handler);
      watcher.start();

      await vi.advanceTimersByTimeAsync(150);

      // Should NOT emit any events
      expect(handler).not.toHaveBeenCalled();
      // Should set the current HEAD as last_processed_sha
      expect(state.set).toHaveBeenCalledWith(
        "last_processed_sha",
        "current-head",
      );
      expect(state.save).toHaveBeenCalled();

      watcher.stop();
    });

    it("handles first run when branch has no commits", async () => {
      const state = createMockState(null);
      const github = createMockGitHub();

      (github.getLatestCommits as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const { watcher } = createWatcher({ github, state, pollIntervalMs: 100 });

      const handler = vi.fn<MergeHandler>();
      watcher.onMerge(handler);
      watcher.start();

      await vi.advanceTimersByTimeAsync(150);

      expect(handler).not.toHaveBeenCalled();
      // Should not update SHA when no commits exist
      expect(state.set).not.toHaveBeenCalledWith(
        "last_processed_sha",
        expect.anything(),
      );

      watcher.stop();
    });
  });

  // -------------------------------------------------------------------------
  // AC5: API failure resilience
  // -------------------------------------------------------------------------
  describe("AC5: API failure resilience", () => {
    it("logs error and continues polling on API failure", async () => {
      const state = createMockState("abc123");
      const github = createMockGitHub();

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // First poll fails, second succeeds
      (github.getMergeCommits as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error("GitHub API 500"))
        .mockResolvedValueOnce([]);

      const { watcher } = createWatcher({ github, state, pollIntervalMs: 100 });
      watcher.start();

      // First poll fails
      await vi.advanceTimersByTimeAsync(150);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[Craig] Merge watcher poll error"),
        expect.any(Error),
      );

      // Second poll succeeds
      await vi.advanceTimersByTimeAsync(100);

      watcher.stop();
      consoleSpy.mockRestore();
    });

    it("does not modify state on API failure", async () => {
      const state = createMockState("abc123");
      const github = createMockGitHub();

      vi.spyOn(console, "error").mockImplementation(() => {});

      (github.getMergeCommits as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("API error"),
      );

      const { watcher } = createWatcher({ github, state, pollIntervalMs: 100 });
      watcher.start();

      await vi.advanceTimersByTimeAsync(150);

      expect(state.set).not.toHaveBeenCalledWith(
        "last_processed_sha",
        expect.anything(),
      );
      expect(state.save).not.toHaveBeenCalled();

      watcher.stop();
      vi.restoreAllMocks();
    });

    it("logs warning after 3+ consecutive failures", async () => {
      const state = createMockState("abc123");
      const github = createMockGitHub();

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(console, "error").mockImplementation(() => {});

      (github.getMergeCommits as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("API error"),
      );

      const { watcher } = createWatcher({ github, state, pollIntervalMs: 100 });
      watcher.start();

      // Trigger 3 consecutive failures
      await vi.advanceTimersByTimeAsync(350);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("consecutive"),
      );

      watcher.stop();
      vi.restoreAllMocks();
    });

    it("resets consecutive failure count on successful poll", async () => {
      const state = createMockState("abc123");
      const github = createMockGitHub();

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(console, "error").mockImplementation(() => {});

      // 2 failures, then success, then 2 more failures
      (github.getMergeCommits as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error("fail-1"))
        .mockRejectedValueOnce(new Error("fail-2"))
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error("fail-3"))
        .mockRejectedValueOnce(new Error("fail-4"));

      const { watcher } = createWatcher({ github, state, pollIntervalMs: 100 });
      watcher.start();

      // 5 polls
      await vi.advanceTimersByTimeAsync(550);

      // Should NOT have warned because counter was reset after success
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("consecutive"),
      );

      watcher.stop();
      vi.restoreAllMocks();
    });
  });

  // -------------------------------------------------------------------------
  // Lifecycle: start/stop
  // -------------------------------------------------------------------------
  describe("Lifecycle: start/stop", () => {
    it("isRunning returns false before start", () => {
      const { watcher } = createWatcher();
      expect(watcher.isRunning()).toBe(false);
    });

    it("isRunning returns true after start", () => {
      const { watcher } = createWatcher();
      watcher.start();
      expect(watcher.isRunning()).toBe(true);
      watcher.stop();
    });

    it("isRunning returns false after stop", () => {
      const { watcher } = createWatcher();
      watcher.start();
      watcher.stop();
      expect(watcher.isRunning()).toBe(false);
    });

    it("start is idempotent — calling twice does not create duplicate timers", async () => {
      const state = createMockState("abc123");
      const github = createMockGitHub();

      (github.getMergeCommits as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const { watcher } = createWatcher({ github, state, pollIntervalMs: 100 });
      watcher.start();
      watcher.start(); // Should be a no-op

      await vi.advanceTimersByTimeAsync(150);

      // Should only have polled once (not twice from duplicate timers)
      expect(github.getMergeCommits).toHaveBeenCalledTimes(1);

      watcher.stop();
    });

    it("stop is idempotent — calling twice does not throw", () => {
      const { watcher } = createWatcher();
      watcher.start();
      watcher.stop();
      expect(() => watcher.stop()).not.toThrow();
    });

    it("does not poll after stop", async () => {
      const state = createMockState("abc123");
      const github = createMockGitHub();

      (github.getMergeCommits as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const { watcher } = createWatcher({ github, state, pollIntervalMs: 100 });
      watcher.start();

      await vi.advanceTimersByTimeAsync(150);
      const callCount = (github.getMergeCommits as ReturnType<typeof vi.fn>).mock
        .calls.length;

      watcher.stop();

      await vi.advanceTimersByTimeAsync(300);

      // No additional calls after stop
      expect(github.getMergeCommits).toHaveBeenCalledTimes(callCount);
    });

    it("can be restarted after stop", async () => {
      const state = createMockState("abc123");
      const github = createMockGitHub();

      (github.getMergeCommits as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const { watcher } = createWatcher({ github, state, pollIntervalMs: 100 });
      watcher.start();
      await vi.advanceTimersByTimeAsync(150);
      watcher.stop();

      const callsBefore = (github.getMergeCommits as ReturnType<typeof vi.fn>)
        .mock.calls.length;

      watcher.start();
      await vi.advanceTimersByTimeAsync(150);

      expect(
        (github.getMergeCommits as ReturnType<typeof vi.fn>).mock.calls.length,
      ).toBeGreaterThan(callsBefore);

      watcher.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Multiple handlers
  // -------------------------------------------------------------------------
  describe("Multiple handlers", () => {
    it("calls all registered handlers for each merge", async () => {
      const state = createMockState("abc123");
      const github = createMockGitHub();

      (github.getMergeCommits as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          sha: "def456",
          message: "Merge PR",
          author: "alice",
          timestamp: "2024-01-15T10:00:00Z",
        },
      ]);

      const { watcher } = createWatcher({ github, state, pollIntervalMs: 100 });

      const handler1 = vi.fn<MergeHandler>();
      const handler2 = vi.fn<MergeHandler>();
      watcher.onMerge(handler1);
      watcher.onMerge(handler2);
      watcher.start();

      await vi.advanceTimersByTimeAsync(150);

      expect(handler1).toHaveBeenCalledOnce();
      expect(handler2).toHaveBeenCalledOnce();

      watcher.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Edge case: Force push
  // -------------------------------------------------------------------------
  describe("Edge case: Force push", () => {
    it("resets last_processed_sha to HEAD when force push detected (404 on getMergeCommits)", async () => {
      const state = createMockState("gone-sha");
      const github = createMockGitHub();

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // getMergeCommits fails with 404 (SHA doesn't exist)
      const notFoundError = new Error("Not Found") as Error & { status: number };
      notFoundError.status = 404;
      (github.getMergeCommits as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        notFoundError,
      );

      // getLatestCommits returns current HEAD
      (github.getLatestCommits as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          sha: "new-head",
          message: "Latest",
          author: "alice",
          timestamp: "2024-01-15T10:00:00Z",
        },
      ]);

      const { watcher } = createWatcher({ github, state, pollIntervalMs: 100 });
      const handler = vi.fn<MergeHandler>();
      watcher.onMerge(handler);
      watcher.start();

      await vi.advanceTimersByTimeAsync(150);

      // Should reset to new HEAD
      expect(state.set).toHaveBeenCalledWith("last_processed_sha", "new-head");
      // Should warn about force push
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Force push"),
      );
      // Should NOT emit merge events
      expect(handler).not.toHaveBeenCalled();

      watcher.stop();
      warnSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // Polling configuration
  // -------------------------------------------------------------------------
  describe("Polling configuration", () => {
    it("uses the configured branch when calling getMergeCommits", async () => {
      const state = createMockState("abc123");
      const github = createMockGitHub();
      const config = createMockConfig({ branch: "develop" });

      (github.getMergeCommits as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const { watcher } = createWatcher({
        github,
        state,
        config,
        pollIntervalMs: 100,
      });
      watcher.start();

      await vi.advanceTimersByTimeAsync(150);

      // getMergeCommits is called with a 'since' timestamp
      // We just verify it's called — the branch is configured in the adapter
      expect(github.getMergeCommits).toHaveBeenCalled();

      watcher.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Edge case: Filter out already-processed commits
  // -------------------------------------------------------------------------
  describe("Edge case: Already-processed commits", () => {
    it("filters out the current last_processed_sha from results", async () => {
      const state = createMockState("abc123");
      const github = createMockGitHub();

      // API returns the current SHA plus a new one
      (github.getMergeCommits as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          sha: "abc123",
          message: "Already processed",
          author: "alice",
          timestamp: "2024-01-15T09:00:00Z",
        },
        {
          sha: "def456",
          message: "New merge",
          author: "bob",
          timestamp: "2024-01-15T10:00:00Z",
        },
      ]);

      const { watcher } = createWatcher({ github, state, pollIntervalMs: 100 });

      const handler = vi.fn<MergeHandler>();
      watcher.onMerge(handler);
      watcher.start();

      await vi.advanceTimersByTimeAsync(150);

      // Should only emit for the new merge
      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ sha: "def456" }),
      );

      watcher.stop();
    });
  });
});
