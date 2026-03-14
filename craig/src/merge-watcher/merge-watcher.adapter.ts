/**
 * MergeWatcherAdapter — polling-based implementation of MergeWatcherPort.
 *
 * Polls the configured branch at a regular interval for new merge commits.
 * Compares against `last_processed_sha` from State and emits MergeEvent
 * for each new merge detected.
 *
 * @see [HEXAGONAL] — Adapter implements the MergeWatcherPort interface
 * @see [CLEAN-CODE] — Small functions, clear error handling
 * @see [SOLID/SRP] — Only detects merges; does not process or review them
 * @module merge-watcher/adapter
 */

import type { MergeWatcherPort } from "./merge-watcher.port.js";
import type { MergeEvent, MergeHandler } from "./merge-watcher.types.js";
import type { GitHubPort } from "../github/index.js";
import type { StatePort } from "../state/index.js";
import type { CraigConfig } from "../config/index.js";

/** Default polling interval: 60 seconds. */
const DEFAULT_POLL_INTERVAL_MS = 60_000;

/** Number of consecutive failures before logging a warning. */
const CONSECUTIVE_FAILURE_THRESHOLD = 3;

/** Options for constructing a MergeWatcherAdapter. */
export interface MergeWatcherOptions {
  readonly github: GitHubPort;
  readonly state: StatePort;
  readonly config: CraigConfig;
  /** Polling interval in milliseconds. Defaults to 60000 (60s). */
  readonly pollIntervalMs?: number;
}

export class MergeWatcherAdapter implements MergeWatcherPort {
  private readonly github: GitHubPort;
  private readonly state: StatePort;
  private readonly config: CraigConfig;
  private readonly pollIntervalMs: number;
  private readonly handlers: MergeHandler[] = [];

  private timerId: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private consecutiveFailures = 0;
  private polling = false;

  constructor(options: MergeWatcherOptions) {
    this.github = options.github;
    this.state = options.state;
    this.config = options.config;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────

  /**
   * Start polling for new merges.
   * Idempotent — calling start() when already running is a no-op.
   */
  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.schedulePoll();
  }

  /**
   * Stop polling for new merges.
   * Idempotent — calling stop() when already stopped is a no-op.
   */
  stop(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.running = false;
  }

  /**
   * Register a handler to be called for each new merge detected.
   */
  onMerge(handler: MergeHandler): void {
    this.handlers.push(handler);
  }

  /**
   * Whether the watcher is currently polling.
   */
  isRunning(): boolean {
    return this.running;
  }

  // ─── Private: Polling ───────────────────────────────────────────

  /**
   * Schedule the next poll cycle using setTimeout.
   * Uses setTimeout instead of setInterval to prevent overlapping polls.
   */
  private schedulePoll(): void {
    this.timerId = setTimeout(async () => {
      await this.executePoll();
      if (this.running) {
        this.schedulePoll();
      }
    }, this.pollIntervalMs);
  }

  /**
   * Execute a single poll cycle.
   * Handles first-run initialization, new merge detection, and errors.
   */
  private async executePoll(): Promise<void> {
    if (this.polling) {
      return; // Prevent overlapping polls
    }

    this.polling = true;
    try {
      const lastSha = this.state.get("last_processed_sha");

      if (lastSha === null) {
        await this.handleFirstRun();
      } else {
        await this.pollForNewMerges(lastSha);
      }

      this.consecutiveFailures = 0;
    } catch (error: unknown) {
      await this.handlePollError(error);
    } finally {
      this.polling = false;
    }
  }

  // ─── Private: First Run ─────────────────────────────────────────

  /**
   * Handle the first poll when no last_processed_sha exists.
   * Sets SHA to current HEAD without emitting events (AC4).
   */
  private async handleFirstRun(): Promise<void> {
    const commits = await this.github.getLatestCommits(
      new Date(0).toISOString(),
      this.config.branch,
    );

    if (commits.length === 0) {
      return;
    }

    const headSha = commits[0]?.sha;
    if (headSha) {
      this.state.set("last_processed_sha", headSha);
      await this.state.save();
    }
  }

  // ─── Private: Merge Detection ───────────────────────────────────

  /**
   * Poll for new merge commits since the last processed SHA.
   * Emits MergeEvent for each new merge and updates state.
   */
  private async pollForNewMerges(lastSha: string): Promise<void> {
    let merges;
    try {
      merges = await this.github.getMergeCommits(lastSha);
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        await this.handleForcePush();
        return;
      }
      throw error;
    }

    const newMerges = this.filterNewMerges(merges, lastSha);

    if (newMerges.length === 0) {
      return;
    }

    await this.processNewMerges(newMerges);
  }

  /**
   * Filter out already-processed commits from the merge list.
   */
  private filterNewMerges(
    merges: { sha: string; message: string; author: string; timestamp: string }[],
    lastSha: string,
  ): { sha: string; message: string; author: string; timestamp: string }[] {
    const lastShaIndex = merges.findIndex((m) => m.sha === lastSha);

    if (lastShaIndex === -1) {
      // lastSha not in results — all are new
      return merges;
    }

    // Return only merges after the last processed SHA
    return merges.slice(lastShaIndex + 1);
  }

  /**
   * Process new merges: emit events and update state after each.
   */
  private async processNewMerges(
    merges: { sha: string; message: string; author: string; timestamp: string }[],
  ): Promise<void> {
    for (const merge of merges) {
      const event = this.toMergeEvent(merge);
      this.emitMerge(event);
      this.state.set("last_processed_sha", merge.sha);
      await this.state.save();
    }
  }

  /**
   * Convert a CommitInfo to a MergeEvent with diff_url.
   */
  private toMergeEvent(commit: {
    sha: string;
    message: string;
    author: string;
    timestamp: string;
  }): MergeEvent {
    return {
      sha: commit.sha,
      message: commit.message,
      author: commit.author,
      timestamp: commit.timestamp,
      diff_url: `https://github.com/${this.config.repo}/commit/${commit.sha}`,
    };
  }

  /**
   * Emit a MergeEvent to all registered handlers.
   */
  private emitMerge(event: MergeEvent): void {
    for (const handler of this.handlers) {
      handler(event);
    }
  }

  // ─── Private: Error Handling ────────────────────────────────────

  /**
   * Handle poll errors: log, track consecutive failures, warn if threshold.
   */
  private async handlePollError(error: unknown): Promise<void> {
    this.consecutiveFailures++;

    console.error(
      "[Craig] Merge watcher poll error:",
      error instanceof Error ? error : new Error(String(error)),
    );

    if (this.consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD) {
      console.warn(
        `[Craig] Merge watcher: ${this.consecutiveFailures} consecutive API failures. Polling continues but may indicate a persistent issue.`,
      );
    }
  }

  /**
   * Handle force push: reset last_processed_sha to current HEAD.
   */
  private async handleForcePush(): Promise<void> {
    console.warn(
      "[Craig] Force push detected: last_processed_sha no longer exists. Resetting to current HEAD.",
    );

    const commits = await this.github.getLatestCommits(
      new Date(0).toISOString(),
      this.config.branch,
    );

    if (commits.length > 0 && commits[0]?.sha) {
      this.state.set("last_processed_sha", commits[0].sha);
      await this.state.save();
    }
  }

  /**
   * Type guard: check if error is a 404 "not found" error.
   */
  private isNotFoundError(error: unknown): boolean {
    return (
      error instanceof Error &&
      "status" in error &&
      (error as Error & { status: number }).status === 404
    );
  }
}
