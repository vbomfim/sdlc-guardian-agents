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
   * @param {Record<string, string>} schedule — task name → cron expression
   * @param {TaskDispatcher} dispatch — called when a task is due
   */
  constructor(schedule, dispatch) {
    /** @type {Record<string, string>} */
    this.schedule = schedule;

    /** @type {TaskDispatcher} */
    this.dispatch = dispatch;

    /** @type {Map<string, ReturnType<typeof setInterval>>} */
    this.timers = new Map();

    /** @type {Map<string, string>} last run ISO timestamp per task */
    this.lastRuns = new Map();

    /** @type {Map<string, boolean>} task currently running? */
    this.running = new Map();
  }

  get taskCount() {
    return this.timers.size;
  }

  /** Start all cron timers. Check every 60 seconds if any task is due. */
  start() {
    for (const [taskName, cron] of Object.entries(this.schedule)) {
      if (cron === "on_push") continue; // Event-driven, not scheduled

      // Check every 60 seconds if this task's cron matches the current time
      const timer = setInterval(() => {
        if (this.running.get(taskName)) return; // Skip if already running

        if (cronMatchesNow(cron)) {
          this.running.set(taskName, true);
          const prompt = `[Craig scheduled task: ${taskName}]`; // Extension builds the real prompt
          Promise.resolve(this.dispatch(taskName, prompt))
            .then(() => {
              this.lastRuns.set(taskName, new Date().toISOString());
            })
            .catch((err) => {
              console.error(`Craig: task '${taskName}' failed:`, err?.message ?? err);
            })
            .finally(() => {
              this.running.set(taskName, false);
            });
        }
      }, 60_000);

      this.timers.set(taskName, timer);
    }
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
    const cron = this.schedule[taskName];
    if (!cron || cron === "on_push") return undefined;
    // Simple approximation — return the cron expression itself
    return cron;
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
