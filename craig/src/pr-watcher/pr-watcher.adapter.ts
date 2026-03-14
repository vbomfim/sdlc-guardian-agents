/**
 * PrWatcherAdapter — polling-based implementation of PrWatcherPort.
 *
 * Polls for open PRs at a regular interval. Compares head SHAs
 * against `last_reviewed_prs` from State and emits PrEvent
 * for each new or updated PR detected.
 *
 * @see [HEXAGONAL] — Adapter implements the PrWatcherPort interface
 * @see [CLEAN-CODE] — Small functions, clear error handling
 * @see [SOLID/SRP] — Only detects PRs needing review; does not review them
 * @module pr-watcher/adapter
 */

import type { PrWatcherPort } from "./pr-watcher.port.js";
import type { PrEvent, PrHandler } from "./pr-watcher.types.js";
import type { GitHubPort, PullRequestInfo } from "../github/index.js";
import type { StatePort } from "../state/index.js";
import type { CraigConfig } from "../config/index.js";

/** Default polling interval: 120 seconds (conservative for PR polling). */
const DEFAULT_POLL_INTERVAL_MS = 120_000;

/** Number of consecutive failures before logging a warning. */
const CONSECUTIVE_FAILURE_THRESHOLD = 3;

/** Options for constructing a PrWatcherAdapter. */
export interface PrWatcherOptions {
  readonly github: GitHubPort;
  readonly state: StatePort;
  readonly config: CraigConfig;
  /** Polling interval in milliseconds. Defaults to 120000 (120s). */
  readonly pollIntervalMs?: number;
}

export class PrWatcherAdapter implements PrWatcherPort {
  private readonly github: GitHubPort;
  private readonly state: StatePort;
  private readonly config: CraigConfig;
  private readonly pollIntervalMs: number;
  private readonly handlers: PrHandler[] = [];

  private timerId: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private consecutiveFailures = 0;
  private polling = false;
  /** Generation counter to prevent duplicate timer chains on rapid start/stop/start. */
  private generation = 0;

  constructor(options: PrWatcherOptions) {
    this.github = options.github;
    this.state = options.state;
    this.config = options.config;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────

  /**
   * Start polling for PRs to review.
   * Idempotent — calling start() when already running is a no-op.
   * No-op if pr_monitor is disabled in config.
   */
  start(): void {
    if (this.running) {
      return;
    }

    if (!this.config.capabilities.pr_monitor) {
      return;
    }

    this.running = true;
    this.generation++;
    this.schedulePoll();
  }

  /**
   * Stop polling for PRs.
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
   * Register a handler to be called for each PR needing review.
   */
  onPr(handler: PrHandler): void {
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
   * Captures generation to prevent duplicate timer chains on rapid start/stop/start.
   */
  private schedulePoll(): void {
    const currentGeneration = this.generation;
    this.timerId = setTimeout(async () => {
      await this.executePoll();
      if (this.running && this.generation === currentGeneration) {
        this.schedulePoll();
      }
    }, this.pollIntervalMs);
  }

  /**
   * Execute a single poll cycle.
   * Fetches open PRs, compares against state, emits events for new/updated PRs.
   */
  private async executePoll(): Promise<void> {
    if (this.polling) {
      return; // Prevent overlapping polls
    }

    this.polling = true;
    try {
      await this.pollForPRs();
      this.consecutiveFailures = 0;
    } catch (error: unknown) {
      this.handlePollError(error);
    } finally {
      this.polling = false;
    }
  }

  // ─── Private: PR Detection ─────────────────────────────────────

  /**
   * Poll for open PRs and emit events for those needing review.
   *
   * A PR needs review when:
   * 1. It is not in last_reviewed_prs (new PR), or
   * 2. Its head_sha differs from the stored SHA (new commits pushed)
   */
  private async pollForPRs(): Promise<void> {
    const openPRs = await this.github.listOpenPRs();
    const reviewedPRs = this.state.get("last_reviewed_prs");

    const prsNeedingReview = this.filterPRsNeedingReview(openPRs, reviewedPRs);

    for (const pr of prsNeedingReview) {
      const event = this.toPrEvent(pr);
      await this.emitPr(event);
    }
  }

  /**
   * Filter open PRs to only those that need review.
   */
  private filterPRsNeedingReview(
    openPRs: PullRequestInfo[],
    reviewedPRs: Record<string, string>,
  ): PullRequestInfo[] {
    return openPRs.filter((pr) => {
      const lastReviewedSha = reviewedPRs[String(pr.number)];
      // New PR or new commits since last review
      return lastReviewedSha !== pr.head_sha;
    });
  }

  /**
   * Convert a PullRequestInfo to a PrEvent.
   */
  private toPrEvent(pr: PullRequestInfo): PrEvent {
    return {
      pr_number: pr.number,
      title: pr.title,
      head_sha: pr.head_sha,
      head_ref: pr.head_ref,
      base_ref: pr.base_ref,
      author: pr.author,
      url: pr.url,
    };
  }

  /**
   * Emit a PrEvent to all registered handlers.
   */
  private async emitPr(event: PrEvent): Promise<void> {
    for (const handler of this.handlers) {
      await handler(event);
    }
  }

  // ─── Private: Error Handling ────────────────────────────────────

  /**
   * Handle poll errors: log, track consecutive failures, warn if threshold.
   */
  private handlePollError(error: unknown): void {
    this.consecutiveFailures++;

    console.error(
      "[Craig] PR watcher poll error:",
      error instanceof Error ? error : new Error(String(error)),
    );

    if (this.consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD) {
      console.warn(
        `[Craig] PR watcher: ${this.consecutiveFailures} consecutive API failures. Polling continues but may indicate a persistent issue.`,
      );
    }
  }
}
