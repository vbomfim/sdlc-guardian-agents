/**
 * CronSchedulerAdapter — Adapter implementation of SchedulerPort.
 *
 * Uses `node-cron` to schedule tasks based on cron expressions
 * read from Craig's config. Delegates task execution to a
 * registered TaskDispatcher callback.
 *
 * Key behaviors:
 *   - Skips "on_push" entries (handled by Merge Watcher)
 *   - Validates cron expressions at registration time (fail fast)
 *   - Prevents overlapping task executions (skip if still running)
 *   - Survives dispatcher failures (catch + log, don't crash)
 *
 * @module scheduler
 * @see [HEXAGONAL] — Adapter implementing SchedulerPort
 * @see [CLEAN-CODE] — SRP: scheduling only, no task logic
 */

import * as cron from "node-cron";
import type {
  SchedulerPort,
  ScheduleEntry,
  TaskDispatcher,
} from "./scheduler.port.js";
import { ScheduleValidationError } from "./scheduler.errors.js";

/** Internal state for a single scheduled task. */
interface ScheduledTask {
  /** Name of the task. */
  readonly task: string;
  /** Cron expression. */
  readonly cron: string;
  /** The node-cron ScheduledTask handle. */
  readonly cronJob: cron.ScheduledTask;
  /** ISO timestamp of the last completed run, or null. */
  lastRun: string | null;
  /** Whether the task is currently being dispatched. */
  isRunning: boolean;
}

/**
 * Special value indicating a task is triggered on push,
 * not by cron schedule.
 */
const ON_PUSH = "on_push";

export class CronSchedulerAdapter implements SchedulerPort {
  /** Map of task name → internal scheduled task state. */
  private readonly tasks: Map<string, ScheduledTask> = new Map();

  /** The raw schedule config (task name → cron expression or "on_push"). */
  private readonly scheduleConfig: Readonly<Record<string, string>>;

  /** Callback invoked when a cron schedule fires. */
  private readonly dispatcher: TaskDispatcher;

  /**
   * @param scheduleConfig - Record mapping task names to cron expressions
   *   or "on_push". Comes from `config.schedule`.
   * @param dispatcher - Callback invoked with the task name when a cron fires.
   */
  constructor(
    scheduleConfig: Record<string, string>,
    dispatcher: TaskDispatcher,
  ) {
    this.scheduleConfig = scheduleConfig;
    this.dispatcher = dispatcher;
  }

  /**
   * Start all scheduled tasks from config.
   *
   * Validates all cron expressions first (fail fast).
   * Skips entries marked as "on_push".
   * Stops any existing jobs first to prevent orphaned cron jobs on double-start.
   *
   * @throws {ScheduleValidationError} If any cron expression is invalid.
   */
  start(): void {
    // Prevent orphaned cron jobs if start() is called while already running
    this.stop();

    // Phase 1: Validate all cron expressions before registering any [CLEAN-CODE]
    const cronEntries = this.filterCronEntries(this.scheduleConfig);
    this.validateAll(cronEntries);

    // Phase 2: Register all validated cron jobs
    for (const [taskName, expression] of cronEntries) {
      this.registerTask(taskName, expression);
    }
  }

  /**
   * Stop all active cron jobs and clear internal state.
   * Safe to call even if not started or already stopped.
   */
  stop(): void {
    for (const scheduled of this.tasks.values()) {
      scheduled.cronJob.stop();
    }
    this.tasks.clear();
  }

  /**
   * Get the current list of scheduled tasks.
   *
   * Note: `nextRun` returns the current timestamp as a placeholder.
   * node-cron v4 does not expose a getNextRun() method, so accurate
   * next-run computation would require an additional library (e.g., cron-parser).
   *
   * @returns Array of ScheduleEntry objects with task metadata.
   */
  getSchedule(): ScheduleEntry[] {
    return Array.from(this.tasks.values()).map((scheduled) => ({
      task: scheduled.task,
      cron: scheduled.cron,
      // TODO(#8): Compute actual next run time using cron-parser.
      // node-cron v4 does not expose ScheduledTask.nextRun().
      // Current value is a placeholder (current timestamp).
      nextRun: new Date().toISOString(),
      lastRun: scheduled.lastRun,
    }));
  }

  /**
   * Update or add a task's cron schedule at runtime.
   *
   * If the task already exists, stops the old cron job and replaces it.
   * If the task is new, adds it to the schedule.
   *
   * @param task - Name of the task.
   * @param cronExpression - New cron expression (5-field format).
   * @throws {ScheduleValidationError} If the cron expression is invalid.
   */
  updateSchedule(task: string, cronExpression: string): void {
    this.validateExpression(task, cronExpression);

    // Stop existing job if present
    const existing = this.tasks.get(task);
    if (existing) {
      existing.cronJob.stop();
    }

    this.registerTask(task, cronExpression);
  }

  /* ------------------------------------------------------------------ */
  /*  Private helpers                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * Filter out "on_push" entries, returning only cron-expression entries.
   *
   * @returns Array of [taskName, cronExpression] tuples.
   */
  private filterCronEntries(
    config: Readonly<Record<string, string>>,
  ): Array<[string, string]> {
    return Object.entries(config).filter(
      ([, expression]) => expression !== ON_PUSH,
    );
  }

  /**
   * Validate all cron expressions. Throws on the first invalid one.
   *
   * @throws {ScheduleValidationError} If any expression is invalid.
   */
  private validateAll(entries: Array<[string, string]>): void {
    for (const [taskName, expression] of entries) {
      this.validateExpression(taskName, expression);
    }
  }

  /**
   * Validate a single cron expression.
   *
   * @throws {ScheduleValidationError} If the expression is invalid.
   */
  private validateExpression(task: string, expression: string): void {
    if (!cron.validate(expression)) {
      throw new ScheduleValidationError(task, expression);
    }
  }

  /**
   * Register a single cron job with overlap prevention and error resilience.
   *
   * @param taskName - Name of the task.
   * @param expression - Validated cron expression.
   */
  private registerTask(taskName: string, expression: string): void {
    const scheduled: ScheduledTask = {
      task: taskName,
      cron: expression,
      cronJob: cron.schedule(expression, () => {
        void this.handleFire(taskName);
      }),
      lastRun: null,
      isRunning: false,
    };

    this.tasks.set(taskName, scheduled);
  }

  /**
   * Handle a cron fire event.
   *
   * - Prevents overlapping executions (skip if running)
   * - Catches dispatcher errors (log, don't crash)
   * - Updates lastRun timestamp on success
   *
   * @param taskName - Name of the task that fired.
   */
  private async handleFire(taskName: string): Promise<void> {
    const scheduled = this.tasks.get(taskName);
    if (!scheduled) return;

    // Overlap prevention: skip if previous invocation is still running
    if (scheduled.isRunning) {
      return;
    }

    scheduled.isRunning = true;

    try {
      await this.dispatcher(taskName);
      scheduled.lastRun = new Date().toISOString();
    } catch (error: unknown) {
      // Scheduler must survive dispatcher failures [CLEAN-CODE]
      // Error is caught but lastRun is NOT updated on failure
      console.error(
        `[Craig] Scheduler dispatch failed for task "${taskName}":`,
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      scheduled.isRunning = false;
    }
  }
}
