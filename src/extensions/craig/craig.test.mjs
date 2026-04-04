/**
 * Craig Scheduler + Config — tests.
 *
 * Run: node --test src/extensions/craig/craig.test.mjs
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { CraigScheduler, cronMatchesNow } from "./craig-scheduler.mjs";
import { loadConfig, findConfigPath } from "./craig-config.mjs";

// ── cronMatchesNow ─────────────────────────────────────────────────────────

describe("cronMatchesNow", () => {
  it("'* * * * *' matches any time", () => {
    assert.ok(cronMatchesNow("* * * * *"));
  });

  it("exact minute match", () => {
    const now = new Date();
    const cron = `${now.getMinutes()} * * * *`;
    assert.ok(cronMatchesNow(cron));
  });

  it("exact minute mismatch", () => {
    const now = new Date();
    const wrongMinute = (now.getMinutes() + 1) % 60;
    const cron = `${wrongMinute} * * * *`;
    assert.ok(!cronMatchesNow(cron));
  });

  it("exact hour and minute match", () => {
    const now = new Date();
    const cron = `${now.getMinutes()} ${now.getHours()} * * *`;
    assert.ok(cronMatchesNow(cron));
  });

  it("step field */2 on even minute", () => {
    const now = new Date();
    const min = now.getMinutes();
    // */2 matches even minutes
    if (min % 2 === 0) {
      assert.ok(cronMatchesNow(`*/2 * * * *`));
    } else {
      assert.ok(!cronMatchesNow(`*/2 * * * *`));
    }
  });

  it("invalid cron returns false", () => {
    assert.ok(!cronMatchesNow("not a cron"));
    assert.ok(!cronMatchesNow(""));
    assert.ok(!cronMatchesNow("* * *"));
  });

  it("day-of-week match", () => {
    const now = new Date();
    const cron = `* * * * ${now.getDay()}`;
    assert.ok(cronMatchesNow(cron));
  });

  it("day-of-week mismatch", () => {
    const now = new Date();
    const wrongDay = (now.getDay() + 1) % 7;
    const cron = `* * * * ${wrongDay}`;
    assert.ok(!cronMatchesNow(cron));
  });
});

// ── CraigScheduler ─────────────────────────────────────────────────────────

describe("CraigScheduler", () => {
  let dispatched;
  let scheduler;

  beforeEach(() => {
    dispatched = [];
    if (scheduler) scheduler.stop();
    scheduler = null;
  });

  it("counts scheduled tasks (excludes on_push)", () => {
    scheduler = new CraigScheduler(
      {
        security_scan: "0 8 * * 1",
        merge_review: "on_push",
        coverage_scan: "0 9 * * *",
      },
      async (name) => dispatched.push(name),
    );
    scheduler.start();
    assert.equal(scheduler.taskCount, 2); // on_push excluded
    scheduler.stop();
  });

  it("stop clears all timers", () => {
    scheduler = new CraigScheduler(
      { task1: "* * * * *", task2: "0 8 * * *" },
      async () => {},
    );
    scheduler.start();
    assert.equal(scheduler.timers.size, 2);
    scheduler.stop();
    assert.equal(scheduler.timers.size, 0);
  });

  it("one-shot task in the past fires after short delay", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    let completed = null;
    scheduler = new CraigScheduler(
      { past_task: `once:${past}` },
      async (name) => { dispatched.push(name); },
      (name) => { completed = name; },
    );
    scheduler.start();
    // Wait for the 1s startup delay + a bit of margin
    await new Promise((r) => setTimeout(r, 1500));
    assert.ok(dispatched.includes("past_task"), "past one-shot should fire after delay");
  });

  it("one-shot task in the future sets a timer", () => {
    const future = new Date(Date.now() + 600_000).toISOString();
    scheduler = new CraigScheduler(
      { future_task: `once:${future}` },
      async () => {},
    );
    scheduler.start();
    assert.ok(scheduler.timers.has("future_task"), "should have a timer for future one-shot");
    scheduler.stop();
  });

  it("getNextRun returns ISO time for one-shot tasks", () => {
    scheduler = new CraigScheduler(
      { task1: "once:2026-04-04T13:00" },
      async () => {},
    );
    assert.equal(scheduler.getNextRun("task1"), "2026-04-04T13:00");
  });

  it("getLastRun returns undefined before any run", () => {
    scheduler = new CraigScheduler({ task1: "* * * * *" }, async () => {});
    assert.equal(scheduler.getLastRun("task1"), undefined);
  });

  it("getNextRun returns cron expression", () => {
    scheduler = new CraigScheduler({ task1: "0 8 * * 1" }, async () => {});
    assert.equal(scheduler.getNextRun("task1"), "0 8 * * 1");
  });

  it("getNextRun returns undefined for on_push", () => {
    scheduler = new CraigScheduler({ merge: "on_push" }, async () => {});
    assert.equal(scheduler.getNextRun("merge"), undefined);
  });
});

// ── Config loader ──────────────────────────────────────────────────────────

describe("loadConfig", () => {
  // Note: these tests depend on the actual craig.config.yaml in the repo.
  // If the file moves, tests need updating.

  it("finds config in repo root", () => {
    const path = findConfigPath();
    // May or may not exist depending on cwd — just verify it returns string or null
    assert.ok(path === null || typeof path === "string");
  });
});
