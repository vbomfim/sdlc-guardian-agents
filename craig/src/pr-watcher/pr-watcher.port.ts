/**
 * PrWatcherPort — the inward-facing interface for the PR Watcher.
 *
 * All consumers depend on this port, never on the adapter implementation.
 * This boundary ensures the watcher is rewritable without changing
 * any downstream component.
 *
 * @see [HEXAGONAL] — Ports & Adapters pattern
 * @module pr-watcher/port
 */

import type { PrHandler } from "./pr-watcher.types.js";

/**
 * Port for the PR watcher lifecycle and event subscription.
 *
 * The watcher polls for open PRs at a regular interval,
 * compares head SHAs against last_reviewed_prs state, and emits
 * PrEvent for each new or updated PR detected.
 */
export interface PrWatcherPort {
  /**
   * Start polling for PRs to review.
   * Idempotent — calling start() when already running is a no-op.
   */
  start(): void;

  /**
   * Stop polling for PRs.
   * Idempotent — calling stop() when already stopped is a no-op.
   */
  stop(): void;

  /**
   * Register a handler to be called for each PR needing review.
   * Multiple handlers can be registered — all are called in order.
   *
   * @param handler - Callback invoked with a PrEvent for each PR needing review
   */
  onPr(handler: PrHandler): void;

  /**
   * Whether the watcher is currently polling.
   */
  isRunning(): boolean;
}
