/**
 * Unit tests for the Scheduler component — CronSchedulerAdapter.
 *
 * Tests written FIRST per TDD — these define the expected behavior.
 * Each acceptance criterion from issue #8 maps to one or more tests.
 *
 * node-cron is mocked — tests never wait for real cron triggers.
 *
 * Acceptance criteria tested:
 *   AC1: Schedule tasks from config (cron expressions)
 *   AC2: Skip "on_push" tasks
 *   AC3: Fire triggers task dispatcher
 *   AC4: Update schedule at runtime
 *   AC5: View schedule
 *
 * Edge cases:
 *   - Invalid cron expression → ScheduleValidationError
 *   - Task fires while previous instance is running → skip
 *   - Stop/start lifecycle
 *   - Dispatcher failure does not crash scheduler
 *
 * @see https://github.com/vbomfim/sdlc-guardian-agents/issues/8
 * @module scheduler/__tests__
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { TaskDispatcher } from "../scheduler.port.js";
import { ScheduleValidationError } from "../scheduler.errors.js";

/* ------------------------------------------------------------------ */
/*  node-cron mock                                                     */
/* ------------------------------------------------------------------ */

/**
 * Mock cron task that simulates node-cron's ScheduledTask interface.
 * Stores the callback so tests can fire it manually.
 */
interface MockCronTask {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  callback: () => void | Promise<void>;
}

/** Registry of all created mock cron tasks, keyed by expression. */
const mockTasks: Map<string, MockCronTask> = new Map();

/** Track all tasks in creation order for multi-task scenarios. */
const mockTasksList: MockCronTask[] = [];

/**
 * Mock node-cron module.
 *
 * - `schedule()` creates a fake task and stores the callback
 * - `validate()` accepts standard 5-field expressions only
 */
vi.mock("node-cron", () => ({
  schedule: vi.fn(
    (
      expression: string,
      callback: () => void | Promise<void>,
      _options?: unknown,
    ) => {
      const task: MockCronTask = {
        start: vi.fn(),
        stop: vi.fn(),
        callback,
      };
      mockTasks.set(expression, task);
      mockTasksList.push(task);
      return task;
    },
  ),
  validate: vi.fn((expression: string): boolean => {
    if (typeof expression !== "string") return false;
    const parts = expression.trim().split(/\s+/);
    return parts.length === 5;
  }),
}));

/* ------------------------------------------------------------------ */
/*  Fixtures & helpers                                                 */
/* ------------------------------------------------------------------ */

/** Minimal config schedule for testing. */
function makeScheduleConfig(): Record<string, string> {
  return {
    coverage_scan: "0 8 * * *",
    tech_debt_audit: "0 9 * * 1",
    merge_monitor: "on_push",
  };
}

/** Create a spy dispatcher. */
function makeDispatcher(): TaskDispatcher & ReturnType<typeof vi.fn> {
  return vi.fn();
}

/* ------------------------------------------------------------------ */
/*  Import adapter (after mock is set up)                              */
/* ------------------------------------------------------------------ */

// Dynamic import ensures the mock is in place before the module loads.
const { CronSchedulerAdapter } = await import("../scheduler.adapter.js");

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("CronSchedulerAdapter", () => {
  let dispatcher: TaskDispatcher & ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockTasks.clear();
    mockTasksList.length = 0;
    dispatcher = makeDispatcher();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /* ---------------------------------------------------------------- */
  /*  AC1: Schedule tasks from config                                  */
  /* ---------------------------------------------------------------- */

  describe("AC1: Schedule tasks from config", () => {
    it("should register cron jobs for all cron-expression tasks in config", () => {
      const schedule = makeScheduleConfig();
      const adapter = new CronSchedulerAdapter(schedule, dispatcher);

      adapter.start();

      // coverage_scan and tech_debt_audit should be scheduled
      // merge_monitor (on_push) should NOT
      const entries = adapter.getSchedule();
      const taskNames = entries.map((e) => e.task);

      expect(taskNames).toContain("coverage_scan");
      expect(taskNames).toContain("tech_debt_audit");
      expect(taskNames).not.toContain("merge_monitor");
    });

    it("should store the correct cron expression for each task", () => {
      const schedule = makeScheduleConfig();
      const adapter = new CronSchedulerAdapter(schedule, dispatcher);

      adapter.start();

      const entries = adapter.getSchedule();
      const coverageScan = entries.find((e) => e.task === "coverage_scan");
      const techDebt = entries.find((e) => e.task === "tech_debt_audit");

      expect(coverageScan?.cron).toBe("0 8 * * *");
      expect(techDebt?.cron).toBe("0 9 * * 1");
    });

    it("should handle empty schedule config without errors", () => {
      const adapter = new CronSchedulerAdapter({}, dispatcher);

      expect(() => adapter.start()).not.toThrow();
      expect(adapter.getSchedule()).toEqual([]);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  AC2: Skip "on_push" tasks                                        */
  /* ---------------------------------------------------------------- */

  describe("AC2: Skip on_push tasks", () => {
    it("should not create a cron job for on_push tasks", () => {
      const schedule = { merge_monitor: "on_push" };
      const adapter = new CronSchedulerAdapter(schedule, dispatcher);

      adapter.start();

      expect(adapter.getSchedule()).toEqual([]);
      expect(mockTasks.size).toBe(0);
    });

    it("should schedule cron tasks and skip on_push tasks in mixed config", () => {
      const schedule = {
        coverage_scan: "0 8 * * *",
        merge_monitor: "on_push",
        tech_debt_audit: "0 9 * * 1",
        another_push: "on_push",
      };
      const adapter = new CronSchedulerAdapter(schedule, dispatcher);

      adapter.start();

      const entries = adapter.getSchedule();
      expect(entries).toHaveLength(2);
      expect(entries.map((e) => e.task).sort()).toEqual([
        "coverage_scan",
        "tech_debt_audit",
      ]);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  AC3: Fire triggers task dispatcher                               */
  /* ---------------------------------------------------------------- */

  describe("AC3: Fire triggers task dispatcher", () => {
    it("should call dispatcher with task name when cron fires", async () => {
      const schedule = { coverage_scan: "0 8 * * *" };
      const adapter = new CronSchedulerAdapter(schedule, dispatcher);

      adapter.start();

      // Simulate cron fire by calling the stored callback
      const task = mockTasks.get("0 8 * * *");
      expect(task).toBeDefined();

      await task!.callback();

      expect(dispatcher).toHaveBeenCalledTimes(1);
      expect(dispatcher).toHaveBeenCalledWith("coverage_scan");
    });

    it("should update lastRun after successful dispatch", async () => {
      const now = new Date("2025-03-14T08:00:00Z");
      vi.setSystemTime(now);

      const schedule = { coverage_scan: "0 8 * * *" };
      const adapter = new CronSchedulerAdapter(schedule, dispatcher);

      adapter.start();

      const beforeFire = adapter.getSchedule();
      expect(beforeFire[0]?.lastRun).toBeNull();

      // Fire the cron
      const task = mockTasks.get("0 8 * * *");
      await task!.callback();

      const afterFire = adapter.getSchedule();
      expect(afterFire[0]?.lastRun).toBe(now.toISOString());

      vi.useRealTimers();
    });

    it("should handle async dispatchers", async () => {
      const asyncDispatcher = vi.fn().mockResolvedValue(undefined);
      const schedule = { coverage_scan: "0 8 * * *" };
      const adapter = new CronSchedulerAdapter(schedule, asyncDispatcher);

      adapter.start();

      const task = mockTasks.get("0 8 * * *");
      await task!.callback();

      expect(asyncDispatcher).toHaveBeenCalledWith("coverage_scan");
    });
  });

  /* ---------------------------------------------------------------- */
  /*  AC4: Update schedule at runtime                                  */
  /* ---------------------------------------------------------------- */

  describe("AC4: Update schedule at runtime", () => {
    it("should replace an existing task's cron schedule", () => {
      const schedule = { coverage_scan: "0 8 * * *" };
      const adapter = new CronSchedulerAdapter(schedule, dispatcher);

      adapter.start();

      // Update to 6 AM
      adapter.updateSchedule("coverage_scan", "0 6 * * *");

      const entries = adapter.getSchedule();
      expect(entries).toHaveLength(1);
      expect(entries[0]?.cron).toBe("0 6 * * *");
    });

    it("should stop the old cron job when updating", () => {
      const schedule = { coverage_scan: "0 8 * * *" };
      const adapter = new CronSchedulerAdapter(schedule, dispatcher);

      adapter.start();

      const oldTask = mockTasks.get("0 8 * * *");

      adapter.updateSchedule("coverage_scan", "0 6 * * *");

      expect(oldTask?.stop).toHaveBeenCalled();
    });

    it("should add a new task that was not in the original config", () => {
      const adapter = new CronSchedulerAdapter({}, dispatcher);

      adapter.start();

      adapter.updateSchedule("new_task", "30 12 * * *");

      const entries = adapter.getSchedule();
      expect(entries).toHaveLength(1);
      expect(entries[0]?.task).toBe("new_task");
      expect(entries[0]?.cron).toBe("30 12 * * *");
    });

    it("should throw ScheduleValidationError for invalid cron on update", () => {
      const adapter = new CronSchedulerAdapter({}, dispatcher);
      adapter.start();

      expect(() =>
        adapter.updateSchedule("bad_task", "not-a-cron"),
      ).toThrow(ScheduleValidationError);
    });

    it("should fire dispatcher with task name after update", async () => {
      const schedule = { coverage_scan: "0 8 * * *" };
      const adapter = new CronSchedulerAdapter(schedule, dispatcher);

      adapter.start();
      adapter.updateSchedule("coverage_scan", "0 6 * * *");

      // Fire the new cron
      const task = mockTasks.get("0 6 * * *");
      await task!.callback();

      expect(dispatcher).toHaveBeenCalledWith("coverage_scan");
    });
  });

  /* ---------------------------------------------------------------- */
  /*  AC5: View schedule                                               */
  /* ---------------------------------------------------------------- */

  describe("AC5: View schedule", () => {
    it("should return all scheduled entries with task, cron, nextRun, lastRun", () => {
      const schedule = {
        coverage_scan: "0 8 * * *",
        tech_debt_audit: "0 9 * * 1",
      };
      const adapter = new CronSchedulerAdapter(schedule, dispatcher);

      adapter.start();

      const entries = adapter.getSchedule();
      expect(entries).toHaveLength(2);

      for (const entry of entries) {
        expect(entry).toHaveProperty("task");
        expect(entry).toHaveProperty("cron");
        expect(entry).toHaveProperty("nextRun");
        expect(entry).toHaveProperty("lastRun");
        expect(typeof entry.task).toBe("string");
        expect(typeof entry.cron).toBe("string");
        expect(typeof entry.nextRun).toBe("string");
        expect(entry.lastRun).toBeNull(); // Never run yet
      }
    });

    it("should return empty array when no tasks are scheduled", () => {
      const adapter = new CronSchedulerAdapter({}, dispatcher);
      adapter.start();

      expect(adapter.getSchedule()).toEqual([]);
    });

    it("should return empty array before start is called", () => {
      const schedule = { coverage_scan: "0 8 * * *" };
      const adapter = new CronSchedulerAdapter(schedule, dispatcher);

      expect(adapter.getSchedule()).toEqual([]);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Edge case: Invalid cron expression                               */
  /* ---------------------------------------------------------------- */

  describe("Edge: Invalid cron expression at startup", () => {
    it("should throw ScheduleValidationError for invalid cron in config", () => {
      const schedule = {
        coverage_scan: "0 8 * * *",
        bad_task: "this-is-not-cron",
      };
      const adapter = new CronSchedulerAdapter(schedule, dispatcher);

      expect(() => adapter.start()).toThrow(ScheduleValidationError);
    });

    it("should include task name and expression in the error", () => {
      const schedule = { bad_task: "invalid" };
      const adapter = new CronSchedulerAdapter(schedule, dispatcher);

      try {
        adapter.start();
        expect.fail("Expected ScheduleValidationError");
      } catch (error) {
        expect(error).toBeInstanceOf(ScheduleValidationError);
        const schedError = error as ScheduleValidationError;
        expect(schedError.task).toBe("bad_task");
        expect(schedError.expression).toBe("invalid");
      }
    });

    it("should not register any tasks if one expression is invalid (fail fast)", () => {
      const schedule = {
        good_task: "0 8 * * *",
        bad_task: "invalid",
      };
      const adapter = new CronSchedulerAdapter(schedule, dispatcher);

      expect(() => adapter.start()).toThrow(ScheduleValidationError);
      expect(adapter.getSchedule()).toEqual([]);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Edge case: Overlap prevention                                    */
  /* ---------------------------------------------------------------- */

  describe("Edge: Overlap prevention (task still running)", () => {
    it("should skip dispatch if previous invocation is still running", async () => {
      // Create a dispatcher that takes time (never resolves in this test)
      let resolveDispatch: (() => void) | undefined;
      const slowDispatcher = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveDispatch = resolve;
          }),
      );

      const schedule = { coverage_scan: "0 8 * * *" };
      const adapter = new CronSchedulerAdapter(schedule, slowDispatcher);

      adapter.start();

      const task = mockTasks.get("0 8 * * *");

      // First fire — starts running
      const firstFirePromise = task!.callback();

      // Second fire — should be skipped (task still running)
      await task!.callback();

      expect(slowDispatcher).toHaveBeenCalledTimes(1);

      // Resolve the first fire
      resolveDispatch!();
      await firstFirePromise;
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Edge case: Dispatcher failure resilience                         */
  /* ---------------------------------------------------------------- */

  describe("Edge: Dispatcher failure does not crash scheduler", () => {
    it("should catch and not re-throw dispatcher errors", async () => {
      const failingDispatcher = vi
        .fn()
        .mockRejectedValue(new Error("Dispatch failed"));
      const schedule = { coverage_scan: "0 8 * * *" };
      const adapter = new CronSchedulerAdapter(schedule, failingDispatcher);

      adapter.start();

      const task = mockTasks.get("0 8 * * *");

      // Should not throw — scheduler must survive dispatch failures
      await task!.callback();

      // Should still be able to fire again (scheduler is resilient)
      await task!.callback();
      expect(failingDispatcher).toHaveBeenCalledTimes(2);
    });

    it("should NOT update lastRun when dispatcher throws (sync error)", async () => {
      const now = new Date("2025-03-14T08:00:00Z");
      vi.setSystemTime(now);

      const failingDispatcher = vi.fn(() => {
        throw new Error("Sync dispatch failure");
      });
      const schedule = { coverage_scan: "0 8 * * *" };
      const adapter = new CronSchedulerAdapter(schedule, failingDispatcher);

      adapter.start();

      const task = mockTasks.get("0 8 * * *");
      await task!.callback();

      // lastRun should NOT be updated on failure
      const entries = adapter.getSchedule();
      expect(entries[0]?.lastRun).toBeNull();

      vi.useRealTimers();
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Lifecycle: stop() and start()/stop() cycles                      */
  /* ---------------------------------------------------------------- */

  describe("Lifecycle: start/stop", () => {
    it("should stop all cron jobs when stop() is called", () => {
      const schedule = {
        coverage_scan: "0 8 * * *",
        tech_debt_audit: "0 9 * * 1",
      };
      const adapter = new CronSchedulerAdapter(schedule, dispatcher);

      adapter.start();

      const tasks = [...mockTasksList];
      expect(tasks).toHaveLength(2);

      adapter.stop();

      for (const task of tasks) {
        expect(task.stop).toHaveBeenCalled();
      }

      // Schedule should be empty after stop
      expect(adapter.getSchedule()).toEqual([]);
    });

    it("should be safe to call stop() without start()", () => {
      const adapter = new CronSchedulerAdapter({}, dispatcher);

      expect(() => adapter.stop()).not.toThrow();
    });

    it("should be safe to call stop() multiple times", () => {
      const schedule = { coverage_scan: "0 8 * * *" };
      const adapter = new CronSchedulerAdapter(schedule, dispatcher);

      adapter.start();
      adapter.stop();

      expect(() => adapter.stop()).not.toThrow();
    });

    it("should allow restart after stop", () => {
      const schedule = { coverage_scan: "0 8 * * *" };
      const adapter = new CronSchedulerAdapter(schedule, dispatcher);

      adapter.start();
      adapter.stop();

      // Clear mocks to track new registrations
      mockTasks.clear();
      mockTasksList.length = 0;

      adapter.start();

      expect(adapter.getSchedule()).toHaveLength(1);
      expect(adapter.getSchedule()[0]?.task).toBe("coverage_scan");
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Regression: Double-start orphaned cron jobs                      */
  /* ---------------------------------------------------------------- */

  describe("Regression: double-start does not create orphaned cron jobs", () => {
    it("should stop existing jobs before creating new ones on double-start", () => {
      const schedule = { coverage_scan: "0 8 * * *" };
      const adapter = new CronSchedulerAdapter(schedule, dispatcher);

      adapter.start();

      const firstTask = mockTasksList[0];
      expect(firstTask).toBeDefined();

      // Call start() again without stop()
      adapter.start();

      // The first cron job should have been stopped
      expect(firstTask!.stop).toHaveBeenCalled();

      // Only one task should be registered (not two)
      expect(adapter.getSchedule()).toHaveLength(1);

      adapter.stop();
    });

    it("should not create duplicate cron callbacks on double-start", async () => {
      const schedule = { coverage_scan: "0 8 * * *" };
      const adapter = new CronSchedulerAdapter(schedule, dispatcher);

      adapter.start();
      adapter.start();

      // Only the latest cron job should fire the dispatcher
      const latestTask = mockTasks.get("0 8 * * *");
      await latestTask!.callback();

      // Dispatcher should only be called once, not twice
      expect(dispatcher).toHaveBeenCalledTimes(1);

      adapter.stop();
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Regression: nextRun is a placeholder (known limitation)          */
  /* ---------------------------------------------------------------- */

  describe("Regression: nextRun is documented as placeholder", () => {
    it("should return an ISO 8601 string for nextRun (placeholder behavior)", () => {
      const now = new Date("2025-03-14T08:00:00Z");
      vi.setSystemTime(now);

      const schedule = { coverage_scan: "0 8 * * *" };
      const adapter = new CronSchedulerAdapter(schedule, dispatcher);

      adapter.start();

      const entries = adapter.getSchedule();
      // nextRun returns a valid ISO timestamp (currently a placeholder)
      expect(entries[0]?.nextRun).toBe(now.toISOString());

      adapter.stop();
      vi.useRealTimers();
    });
  });
});
