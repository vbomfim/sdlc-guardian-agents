/**
 * Scheduler component — public API barrel export.
 *
 * All consumers import from this file, never from internals.
 * This is the component boundary.
 *
 * @module scheduler
 */

export { CronSchedulerAdapter } from "./scheduler.adapter.js";
export type {
  SchedulerPort,
  ScheduleEntry,
  TaskDispatcher,
} from "./scheduler.port.js";
export { ScheduleValidationError } from "./scheduler.errors.js";
