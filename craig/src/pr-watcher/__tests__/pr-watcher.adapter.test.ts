/**
 * Unit tests for PrWatcherAdapter.
 *
 * Tests are organized by acceptance criteria from issue #33.
 * All tests mock GitHubPort and StatePort — no real API calls.
 *
 * AC1: New PR → emit event
 * AC2: PR with new commits → re-emit event
 * AC3: PR monitoring disabled → skip polling
 * AC4: PR already reviewed at current SHA → skip
 *
 * @see [TDD] — Tests written first, implementation second
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PrWatcherAdapter } from "../pr-watcher.adapter.js";
import type { PrEvent, PrHandler } from "../pr-watcher.types.js";
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
    listOpenPRs: vi.fn().mockResolvedValue([]),
    getPRDiff: vi.fn().mockResolvedValue(""),
    postPRReview: vi.fn().mockResolvedValue({ id: 1, url: "https://github.com/review/1" }),
    createIssueComment: vi.fn(),
  };
}

function createMockState(
  reviewedPRs: Record<string, string> = {},
): StatePort {
  let storedReviewedPRs = { ...reviewedPRs };
  return {
    load: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockImplementation((key: string) => {
      if (key === "last_reviewed_prs") return storedReviewedPRs;
      return undefined;
    }),
    set: vi.fn().mockImplementation((key: string, value: unknown) => {
      if (key === "last_reviewed_prs")
        storedReviewedPRs = value as Record<string, string>;
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
      pr_monitor: true,
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

function createPR(
  number: number,
  headSha: string,
  title = `PR #${number}`,
) {
  return {
    number,
    title,
    head_sha: headSha,
    head_ref: `feature-${number}`,
    base_ref: "main",
    author: "test-user",
    url: `https://github.com/test/repo/pull/${number}`,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PrWatcherAdapter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── Lifecycle ─────────────────────────────────────────────────

  describe("Lifecycle", () => {
    it("should start and report isRunning=true", () => {
      const watcher = new PrWatcherAdapter({
        github: createMockGitHub(),
        state: createMockState(),
        config: createMockConfig(),
        pollIntervalMs: 100,
      });

      watcher.start();
      expect(watcher.isRunning()).toBe(true);
      watcher.stop();
    });

    it("should stop and report isRunning=false", () => {
      const watcher = new PrWatcherAdapter({
        github: createMockGitHub(),
        state: createMockState(),
        config: createMockConfig(),
        pollIntervalMs: 100,
      });

      watcher.start();
      watcher.stop();
      expect(watcher.isRunning()).toBe(false);
    });

    it("should be idempotent — multiple start() calls are safe", () => {
      const watcher = new PrWatcherAdapter({
        github: createMockGitHub(),
        state: createMockState(),
        config: createMockConfig(),
        pollIntervalMs: 100,
      });

      watcher.start();
      watcher.start();
      expect(watcher.isRunning()).toBe(true);
      watcher.stop();
    });

    it("should be idempotent — multiple stop() calls are safe", () => {
      const watcher = new PrWatcherAdapter({
        github: createMockGitHub(),
        state: createMockState(),
        config: createMockConfig(),
        pollIntervalMs: 100,
      });

      watcher.stop();
      watcher.stop();
      expect(watcher.isRunning()).toBe(false);
    });
  });

  // ─── AC1: New PR → emit event ─────────────────────────────────

  describe("AC1: New PR detected", () => {
    it("should emit PrEvent for a new PR not in last_reviewed_prs", async () => {
      const github = createMockGitHub();
      const state = createMockState({}); // no reviewed PRs
      const pr = createPR(42, "abc1234");
      vi.mocked(github.listOpenPRs).mockResolvedValue([pr]);

      const handler = vi.fn();
      const watcher = new PrWatcherAdapter({
        github,
        state,
        config: createMockConfig(),
        pollIntervalMs: 100,
      });

      watcher.onPr(handler);
      watcher.start();

      // Advance past the poll interval
      await vi.advanceTimersByTimeAsync(100);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          pr_number: 42,
          head_sha: "abc1234",
          title: "PR #42",
        }),
      );

      watcher.stop();
    });

    it("should emit events for multiple new PRs", async () => {
      const github = createMockGitHub();
      const state = createMockState({});
      vi.mocked(github.listOpenPRs).mockResolvedValue([
        createPR(1, "sha-1"),
        createPR(2, "sha-2"),
        createPR(3, "sha-3"),
      ]);

      const handler = vi.fn();
      const watcher = new PrWatcherAdapter({
        github,
        state,
        config: createMockConfig(),
        pollIntervalMs: 100,
      });

      watcher.onPr(handler);
      watcher.start();

      await vi.advanceTimersByTimeAsync(100);

      expect(handler).toHaveBeenCalledTimes(3);
      watcher.stop();
    });
  });

  // ─── AC2: PR with new commits → re-emit event ─────────────────

  describe("AC2: PR with new commits", () => {
    it("should emit event when head_sha changes (new commits pushed)", async () => {
      const github = createMockGitHub();
      const state = createMockState({ "42": "old-sha" }); // PR 42 was reviewed at old-sha
      const pr = createPR(42, "new-sha"); // now at new-sha
      vi.mocked(github.listOpenPRs).mockResolvedValue([pr]);

      const handler = vi.fn();
      const watcher = new PrWatcherAdapter({
        github,
        state,
        config: createMockConfig(),
        pollIntervalMs: 100,
      });

      watcher.onPr(handler);
      watcher.start();

      await vi.advanceTimersByTimeAsync(100);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          pr_number: 42,
          head_sha: "new-sha",
        }),
      );

      watcher.stop();
    });
  });

  // ─── AC3: PR monitoring disabled → skip ────────────────────────

  describe("AC3: PR monitoring disabled", () => {
    it("should not start polling when pr_monitor is false", async () => {
      const github = createMockGitHub();
      const config = createMockConfig({
        capabilities: {
          merge_review: true,
          coverage_gaps: true,
          bug_detection: true,
          pattern_enforcement: true,
          po_audit: true,
          auto_fix: true,
          dependency_updates: true,
          pr_monitor: false,
        },
      });

      const handler = vi.fn();
      const watcher = new PrWatcherAdapter({
        github,
        state: createMockState(),
        config,
        pollIntervalMs: 100,
      });

      watcher.onPr(handler);
      watcher.start();

      expect(watcher.isRunning()).toBe(false);

      await vi.advanceTimersByTimeAsync(200);

      expect(handler).not.toHaveBeenCalled();
      expect(github.listOpenPRs).not.toHaveBeenCalled();
      watcher.stop();
    });
  });

  // ─── AC4: PR already reviewed at current SHA → skip ────────────

  describe("AC4: Already reviewed PR skipped", () => {
    it("should not emit event when PR is already reviewed at same SHA", async () => {
      const github = createMockGitHub();
      const state = createMockState({ "42": "same-sha" });
      const pr = createPR(42, "same-sha");
      vi.mocked(github.listOpenPRs).mockResolvedValue([pr]);

      const handler = vi.fn();
      const watcher = new PrWatcherAdapter({
        github,
        state,
        config: createMockConfig(),
        pollIntervalMs: 100,
      });

      watcher.onPr(handler);
      watcher.start();

      await vi.advanceTimersByTimeAsync(100);

      expect(handler).not.toHaveBeenCalled();
      watcher.stop();
    });

    it("should skip reviewed PRs but emit for new ones in same poll", async () => {
      const github = createMockGitHub();
      const state = createMockState({ "42": "reviewed-sha" });
      vi.mocked(github.listOpenPRs).mockResolvedValue([
        createPR(42, "reviewed-sha"), // already reviewed
        createPR(43, "new-pr-sha"),   // new PR
      ]);

      const handler = vi.fn();
      const watcher = new PrWatcherAdapter({
        github,
        state,
        config: createMockConfig(),
        pollIntervalMs: 100,
      });

      watcher.onPr(handler);
      watcher.start();

      await vi.advanceTimersByTimeAsync(100);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ pr_number: 43 }),
      );

      watcher.stop();
    });
  });

  // ─── Error handling ────────────────────────────────────────────

  describe("Error handling", () => {
    it("should continue polling after an API error", async () => {
      const github = createMockGitHub();
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      vi.mocked(github.listOpenPRs)
        .mockRejectedValueOnce(new Error("API error"))
        .mockResolvedValueOnce([createPR(1, "sha-1")]);

      const handler = vi.fn();
      const watcher = new PrWatcherAdapter({
        github,
        state: createMockState(),
        config: createMockConfig(),
        pollIntervalMs: 100,
      });

      watcher.onPr(handler);
      watcher.start();

      // First poll fails
      await vi.advanceTimersByTimeAsync(100);
      expect(handler).not.toHaveBeenCalled();

      // Second poll succeeds
      await vi.advanceTimersByTimeAsync(100);
      expect(handler).toHaveBeenCalledTimes(1);

      watcher.stop();
      consoleErrorSpy.mockRestore();
    });

    it("should warn after consecutive failures", async () => {
      const github = createMockGitHub();
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      vi.mocked(github.listOpenPRs).mockRejectedValue(new Error("Persistent failure"));

      const watcher = new PrWatcherAdapter({
        github,
        state: createMockState(),
        config: createMockConfig(),
        pollIntervalMs: 100,
      });

      watcher.start();

      // Advance through 3 consecutive failures
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(100);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("consecutive API failures"),
      );

      watcher.stop();
      consoleErrorSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });
  });

  // ─── Handler management ────────────────────────────────────────

  describe("Handler management", () => {
    it("should call all registered handlers for each event", async () => {
      const github = createMockGitHub();
      vi.mocked(github.listOpenPRs).mockResolvedValue([createPR(1, "sha-1")]);

      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const watcher = new PrWatcherAdapter({
        github,
        state: createMockState(),
        config: createMockConfig(),
        pollIntervalMs: 100,
      });

      watcher.onPr(handler1);
      watcher.onPr(handler2);
      watcher.start();

      await vi.advanceTimersByTimeAsync(100);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);

      watcher.stop();
    });
  });

  // ─── Polling behavior ─────────────────────────────────────────

  describe("Polling behavior", () => {
    it("should not poll when no open PRs exist", async () => {
      const github = createMockGitHub();
      vi.mocked(github.listOpenPRs).mockResolvedValue([]);

      const handler = vi.fn();
      const watcher = new PrWatcherAdapter({
        github,
        state: createMockState(),
        config: createMockConfig(),
        pollIntervalMs: 100,
      });

      watcher.onPr(handler);
      watcher.start();

      await vi.advanceTimersByTimeAsync(100);

      expect(github.listOpenPRs).toHaveBeenCalledTimes(1);
      expect(handler).not.toHaveBeenCalled();

      watcher.stop();
    });
  });
});
