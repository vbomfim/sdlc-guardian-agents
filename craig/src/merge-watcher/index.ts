/**
 * Merge Watcher component — public API barrel export.
 *
 * All consumers import from this file, never from internals.
 * This is the component boundary.
 *
 * @module merge-watcher
 */

export { MergeWatcherAdapter } from "./merge-watcher.adapter.js";
export type { MergeWatcherPort } from "./merge-watcher.port.js";
export type { MergeEvent, MergeHandler } from "./merge-watcher.types.js";
export type { MergeWatcherOptions } from "./merge-watcher.adapter.js";
