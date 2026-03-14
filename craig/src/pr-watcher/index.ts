/**
 * PR Watcher component — public API barrel export.
 *
 * All consumers import from this file, never from internals.
 * This is the component boundary.
 *
 * @module pr-watcher
 */

export { PrWatcherAdapter } from "./pr-watcher.adapter.js";
export type { PrWatcherPort } from "./pr-watcher.port.js";
export type { PrEvent, PrHandler } from "./pr-watcher.types.js";
export type { PrWatcherOptions } from "./pr-watcher.adapter.js";
