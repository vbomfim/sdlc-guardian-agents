/**
 * MergeWatcherPort — the inward-facing interface for the Merge Watcher.
 *
 * All consumers depend on this port, never on the adapter implementation.
 * This boundary ensures the watcher is rewritable without changing
 * any downstream component.
 *
 * @see [HEXAGONAL] — Ports & Adapters pattern
 * @module merge-watcher/port
 */

import type { MergeHandler } from "./merge-watcher.types.js";

/**
 * Port for the merge watcher lifecycle and event subscription.
 *
 * The watcher polls the configured branch at a regular interval,
 * compares against the last processed SHA, and emits MergeEvent
 * for each new merge detected.
 */
export interface MergeWatcherPort {
  /**
   * Start polling for new merges.
   * Idempotent — calling start() when already running is a no-op.
   */
  start(): void;

  /**
   * Stop polling for new merges.
   * Idempotent — calling stop() when already stopped is a no-op.
   */
  stop(): void;

  /**
   * Register a handler to be called for each new merge detected.
   * Multiple handlers can be registered — all are called in order.
   *
   * @param handler - Callback invoked with a MergeEvent for each new merge
   */
  onMerge(handler: MergeHandler): void;

  /**
   * Whether the watcher is currently polling.
   */
  isRunning(): boolean;
}
