/**
 * Custom error types for the Scheduler component.
 *
 * Each error type maps to a specific failure mode,
 * giving consumers precise control over error handling.
 *
 * @module scheduler
 */

/**
 * Thrown when a cron expression is invalid.
 *
 * Validation happens at registration time (fail fast),
 * not at fire time — prevents silent schedule failures.
 */
export class ScheduleValidationError extends Error {
  /** The invalid cron expression that caused the error. */
  public readonly expression: string;
  /** The task name associated with the invalid expression. */
  public readonly task: string;

  constructor(task: string, expression: string, options?: ErrorOptions) {
    super(
      `Invalid cron expression for task "${task}": "${expression}". Expected 5-field cron format.`,
      options,
    );
    this.name = "ScheduleValidationError";
    this.task = task;
    this.expression = expression;
  }
}
