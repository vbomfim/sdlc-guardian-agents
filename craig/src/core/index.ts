/**
 * Core component — public API barrel export.
 *
 * All consumers import from here, never from internals.
 * This is the component boundary.
 *
 * @module core
 */

export { createCraigServer } from "./mcp-server.js";
export type { CraigServerDeps } from "./mcp-server.js";
export {
  createStatusHandler,
  createRunTaskHandler,
  createFindingsHandler,
  createScheduleHandler,
  createConfigHandler,
  createDigestHandler,
  createShutdownHandler,
} from "./tool-handlers.js";
export type { ShutdownHandlerOpts, Stoppable } from "./tool-handlers.js";
export type {
  StatusResult,
  RunTaskSuccess,
  FindingsResult,
  ScheduleResult,
  ConfigResult,
  DigestResult,
  ShutdownResult,
  ToolError,
  RunTaskParams,
  FindingsParams,
  ScheduleParams,
  ConfigParams,
  DigestParams,
  StatusParams,
  ShutdownParams,
  ValidTask,
} from "./core.types.js";
export { VALID_TASKS, isValidTask } from "./core.types.js";
export type { AnalyzerRegistry } from "./analyzer-registry.js";
export { createAnalyzerRegistry } from "./analyzer-registry.js";
