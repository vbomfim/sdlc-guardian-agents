/**
 * SchedulerPort — Public interface for the Scheduler component.
 *
 * All consumers depend on this port, never on the implementation.
 * This boundary ensures the scheduler adapter is rewritable without
 * changing any downstream component.
 *
 * The Scheduler reads cron expressions from Config, schedules tasks
 * using a cron library, and invokes a registered task dispatcher
 * when a schedule fires. It does NOT execute the task itself.
 *
 * @module scheduler
 * @see [HEXAGONAL] — Inward-facing port
 */

/**
 * Entry describing a single scheduled task.
 *
 * Returned by `getSchedule()` for introspection via
 * the `craig_schedule` MCP tool.
 */
export interface ScheduleEntry {
  /** Name of the scheduled task (e.g., "coverage_scan"). */
  readonly task: string;
  /** Cron expression for the schedule (e.g., "0 8 * * *"). */
  readonly cron: string;
  /**
   * ISO 8601 timestamp of the next scheduled run.
   *
   * Known limitation: Currently returns the current timestamp as a
   * placeholder because node-cron v4 does not expose getNextRun().
   * TODO: Use cron-parser to compute the actual next run time.
   */
  readonly nextRun: string;
  /** ISO 8601 timestamp of the last completed run, or null if never run. */
  readonly lastRun: string | null;
}

/**
 * Callback signature for the task dispatcher.
 *
 * Called when a cron schedule fires. Receives the task name
 * so the dispatcher can route to the appropriate analyzer.
 */
export type TaskDispatcher = (taskName: string) => void | Promise<void>;

/**
 * Port (interface) for cron-based task scheduling.
 *
 * Consumers depend on this contract. The adapter behind it
 * can be swapped (node-cron, Bree, bull, etc.) without
 * changing any consumer code.
 */
export interface SchedulerPort {
  /**
   * Start all registered cron schedules.
   *
   * Reads `config.schedule` and registers a cron job for each entry
   * that is NOT "on_push". Tasks marked "on_push" are handled by
   * the Merge Watcher, not the Scheduler.
   *
   * @throws {ScheduleValidationError} If any cron expression is invalid.
   */
  start(): void;

  /**
   * Stop all active cron jobs and clear the schedule.
   * Safe to call even if not started.
   */
  stop(): void;

  /**
   * Get the current list of scheduled tasks with their metadata.
   *
   * @returns Array of ScheduleEntry objects.
   */
  getSchedule(): ScheduleEntry[];

  /**
   * Update or add a task's cron schedule at runtime.
   *
   * If the task already exists, its cron job is replaced.
   * If the task is new, it is added to the schedule.
   *
   * @param task - Name of the task to schedule.
   * @param cron - Cron expression (5-field format).
   * @throws {ScheduleValidationError} If the cron expression is invalid.
   */
  updateSchedule(task: string, cron: string): void;
}
