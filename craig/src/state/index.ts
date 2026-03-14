/**
 * State component — public API barrel file.
 *
 * Re-exports all types, interfaces, and the adapter for the state component.
 * External consumers import from here, not from internal modules.
 *
 * @example
 * ```typescript
 * import { FileStateAdapter, createDefaultState } from "./state/index.js";
 * import type { StatePort, CraigState, Finding } from "./state/index.js";
 * ```
 *
 * @module state
 */

export type { StatePort } from "./state-port.js";
export type {
  CraigState,
  Finding,
  FindingFilter,
  DailyStats,
  Severity,
} from "./types.js";
export { FileStateAdapter } from "./file-state-adapter.js";
export { createDefaultState } from "./defaults.js";
export { StateCorruptedError } from "./errors.js";
