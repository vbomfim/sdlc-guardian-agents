/**
 * Craig Scheduler — lightweight cron-like timer for the CLI extension.
 *
 * Parses cron expressions from config, sets timers, and calls the
 * dispatch function when tasks are due. No external dependencies.
 *
 * Supports standard 5-field cron: minute hour day-of-month month day-of-week
 * Special value: "on_push" — not scheduled, only triggered by events.
 *
 * @module craig-scheduler
 */

/**
 * @callback TaskDispatcher
 * @param {string} taskName
 * @param {string} prompt — the built prompt for this task
 */

export class CraigScheduler {
  /**
   * @param {Record<string, string>} schedule — task name → cron expression or "once:ISO" or "on_push"
   * @param {TaskDispatcher} dispatch — called when a task is due
   * @param {(taskName: string) => void} [onOneShotComplete] — called after a one-shot task fires (for cleanup)
   */
  constructor(schedule, dispatch, onOneShotComplete) {
    /** @type {Record<string, string>} */
    this.schedule = schedule;

    /** @type {TaskDispatcher} */
    this.dispatch = dispatch;

    /** @type {((taskName: string) => void) | undefined} */
    this.onOneShotComplete = onOneShotComplete;

    /** @type {Map<string, ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>>} */
    this.timers = new Map();

    /** @type {Map<string, string>} last run ISO timestamp per task */
    this.lastRuns = new Map();

    /** @type {Map<string, boolean>} task currently running? */
    this.running = new Map();
  }

  get taskCount() {
    return this.timers.size;
  }

  /** Start all timers. Cron tasks check every 60s. One-shot tasks use setTimeout. */
  start() {
    for (const [taskName, expr] of Object.entries(this.schedule)) {
      if (expr === "on_push") continue;

      // One-shot: "once:2026-04-04T13:00" → setTimeout to that time
      if (expr.startsWith("once:")) {
        const targetTime = new Date(expr.slice(5).trim());
        const delayMs = targetTime.getTime() - Date.now();
        if (delayMs <= 0) {
          // Already past — fire immediately
          this.fireTask(taskName, true);
          continue;
        }
        const timer = setTimeout(() => this.fireTask(taskName, true), delayMs);
        this.timers.set(taskName, timer);
        continue;
      }

      // Cron: check every 60 seconds
      const timer = setInterval(() => {
        if (this.running.get(taskName)) return;
        if (cronMatchesNow(expr)) {
          this.fireTask(taskName, false);
        }
      }, 60_000);

      this.timers.set(taskName, timer);
    }
  }

  /**
   * Fire a task. If oneShot is true, clean up timer and notify for removal.
   * @param {string} taskName
   * @param {boolean} oneShot
   */
  fireTask(taskName, oneShot) {
    if (this.running.get(taskName)) return;
    this.running.set(taskName, true);
    const prompt = `[Craig scheduled task: ${taskName}]`;
    Promise.resolve(this.dispatch(taskName, prompt))
      .then(() => {
        this.lastRuns.set(taskName, new Date().toISOString());
        if (oneShot) {
          this.timers.delete(taskName);
          this.onOneShotComplete?.(taskName);
        }
      })
      .catch((err) => {
        console.error(`Craig: task '${taskName}' failed:`, err?.message ?? err);
      })
      .finally(() => {
        this.running.set(taskName, false);
      });
  }

  /** Stop all timers. */
  stop() {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
    this.running.clear();
  }

  /** @returns {string | undefined} ISO timestamp of last run, or undefined */
  getLastRun(taskName) {
    return this.lastRuns.get(taskName);
  }

  /** @returns {string | undefined} Human-readable next run, or undefined */
  getNextRun(taskName) {
    const expr = this.schedule[taskName];
    if (!expr || expr === "on_push") return undefined;
    if (expr.startsWith("once:")) return expr.slice(5).trim();
    return expr;
  }
}

/**
 * Check if a 5-field cron expression matches the current minute.
 *
 * Fields: minute hour day-of-month month day-of-week
 * Supports: numbers, '*', and '* /N' (step). Does NOT support ranges or lists.
 *
 * @param {string} cron
 * @returns {boolean}
 */
export function cronMatchesNow(cron) {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return false;

  const now = new Date();
  const values = [
    now.getMinutes(),
    now.getHours(),
    now.getDate(),
    now.getMonth() + 1,
    now.getDay(),
  ];

  for (let i = 0; i < 5; i++) {
    if (!fieldMatches(fields[i], values[i])) return false;
  }
  return true;
}

/**
 * Check if a single cron field matches a value.
 * @param {string} field — cron field (e.g., '*', '5', '* /2')
 * @param {number} value — current time value
 * @returns {boolean}
 */
function fieldMatches(field, value) {
  if (field === "*") return true;

  // Step: */N
  if (field.startsWith("*/")) {
    const step = parseInt(field.slice(2), 10);
    return !isNaN(step) && step > 0 && value % step === 0;
  }

  // Exact match
  const num = parseInt(field, 10);
  return !isNaN(num) && num === value;
}
