/**
 * Unit tests for the craig_shutdown tool handler.
 *
 * Tests written FIRST per TDD — each acceptance criterion from issue #54
 * maps to one or more tests.
 *
 * AC1: Daemon mode — stops scheduler, merge watcher, flushes state, exits cleanly
 * AC2: Stdio mode — logs warning, does not exit
 * AC3: Pending tasks — waits up to 30s for completion before force exit
 *
 * @see https://github.com/vbomfim/sdlc-guardian-agents/issues/54
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createShutdownHandler } from "../tool-handlers.js";
import type { StatePort } from "../../state/index.js";
import type { ShutdownResult, ToolError } from "../core.types.js";
import { createMockState } from "./mock-factories.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Create a minimal mock object with a stop() method. */
function createMockStoppable(): { stop: ReturnType<typeof vi.fn> } {
  return { stop: vi.fn() };
}

/* ------------------------------------------------------------------ */
/*  AC2: Stdio mode — logs warning, lifecycle managed by CLI           */
/* ------------------------------------------------------------------ */

describe("craig_shutdown handler — stdio mode", () => {
  let state: StatePort;
  let handler: ReturnType<typeof createShutdownHandler>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    state = createMockState();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    handler = createShutdownHandler(state, { mode: "stdio" });
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('returns status "ignored" with warning message', async () => {
    const result = (await handler()) as ShutdownResult;

    expect(result.status).toBe("ignored");
    expect(result.message).toContain("stdio");
  });

  it("logs a warning to stderr", async () => {
    await handler();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("stdio"),
    );
  });

  it("does not stop scheduler or merge watcher", async () => {
    const scheduler = createMockStoppable();
    const mergeWatcher = createMockStoppable();
    handler = createShutdownHandler(state, {
      mode: "stdio",
      scheduler,
      mergeWatcher,
    });

    await handler();

    expect(scheduler.stop).not.toHaveBeenCalled();
    expect(mergeWatcher.stop).not.toHaveBeenCalled();
  });

  it("does not flush state", async () => {
    await handler();

    expect(state.save).not.toHaveBeenCalled();
  });

  it("includes reason in warning log when provided", async () => {
    await handler({ reason: "user requested" });

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("user requested"),
    );
  });
});

/* ------------------------------------------------------------------ */
/*  AC1: Daemon mode — graceful shutdown                               */
/* ------------------------------------------------------------------ */

describe("craig_shutdown handler — daemon mode", () => {
  let state: StatePort;
  let scheduler: ReturnType<typeof createMockStoppable>;
  let mergeWatcher: ReturnType<typeof createMockStoppable>;
  let onShutdown: ReturnType<typeof vi.fn>;
  let handler: ReturnType<typeof createShutdownHandler>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    state = createMockState();
    vi.mocked(state.get).mockReturnValue([] as never);
    scheduler = createMockStoppable();
    mergeWatcher = createMockStoppable();
    onShutdown = vi.fn().mockResolvedValue(undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    handler = createShutdownHandler(state, {
      mode: "daemon",
      scheduler,
      mergeWatcher,
      onShutdown,
    });
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('returns status "shutting_down" immediately', async () => {
    const result = (await handler()) as ShutdownResult;

    expect(result.status).toBe("shutting_down");
    expect(result.message).toBeDefined();
  });

  it("stops the scheduler", async () => {
    await handler();

    await vi.waitFor(() => {
      expect(scheduler.stop).toHaveBeenCalled();
    });
  });

  it("stops the merge watcher", async () => {
    await handler();

    await vi.waitFor(() => {
      expect(mergeWatcher.stop).toHaveBeenCalled();
    });
  });

  it("flushes state to disk", async () => {
    await handler();

    await vi.waitFor(() => {
      expect(state.save).toHaveBeenCalled();
    });
  });

  it("calls onShutdown callback", async () => {
    await handler();

    await vi.waitFor(() => {
      expect(onShutdown).toHaveBeenCalled();
    });
  });

  it("includes reason in the response message when provided", async () => {
    const result = (await handler({ reason: "maintenance" })) as ShutdownResult;

    expect(result.message).toContain("maintenance");
  });

  it("logs the shutdown reason to stderr", async () => {
    await handler({ reason: "deployment" });

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("deployment"),
    );
  });

  it("works without optional scheduler", async () => {
    handler = createShutdownHandler(state, {
      mode: "daemon",
      mergeWatcher,
      onShutdown,
    });

    const result = (await handler()) as ShutdownResult;

    expect(result.status).toBe("shutting_down");
  });

  it("works without optional merge watcher", async () => {
    handler = createShutdownHandler(state, {
      mode: "daemon",
      scheduler,
      onShutdown,
    });

    const result = (await handler()) as ShutdownResult;

    expect(result.status).toBe("shutting_down");
  });

  it("works without onShutdown callback", async () => {
    handler = createShutdownHandler(state, {
      mode: "daemon",
      scheduler,
      mergeWatcher,
    });

    const result = (await handler()) as ShutdownResult;

    expect(result.status).toBe("shutting_down");
    await vi.waitFor(() => {
      expect(state.save).toHaveBeenCalled();
    });
  });
});

/* ------------------------------------------------------------------ */
/*  AC3: Pending tasks — wait up to 30s before force exit              */
/* ------------------------------------------------------------------ */

describe("craig_shutdown handler — pending task drain", () => {
  let state: StatePort;
  let onShutdown: ReturnType<typeof vi.fn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    state = createMockState();
    onShutdown = vi.fn().mockResolvedValue(undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    errorSpy.mockRestore();
  });

  it("waits for running tasks to complete before flushing", async () => {
    // First call: tasks running. Second call: tasks done.
    let callCount = 0;
    vi.mocked(state.get).mockImplementation(<K extends string>(key: K) => {
      if (key === "running_tasks") {
        callCount++;
        return (callCount <= 2 ? ["security_scan"] : []) as never;
      }
      return [] as never;
    });

    const handler = createShutdownHandler(state, {
      mode: "daemon",
      onShutdown,
    });

    const resultPromise = handler();
    const result = await resultPromise;

    expect((result as ShutdownResult).status).toBe("shutting_down");

    // Advance time to allow the drain loop to run
    await vi.advanceTimersByTimeAsync(3_000);

    await vi.waitFor(() => {
      expect(state.save).toHaveBeenCalled();
    });
  });

  it("force-exits after 30s timeout when tasks never complete", async () => {
    // Tasks never clear
    vi.mocked(state.get).mockReturnValue(["stuck_task"] as never);

    const handler = createShutdownHandler(state, {
      mode: "daemon",
      onShutdown,
    });

    await handler();

    // Advance past the 30s timeout
    await vi.advanceTimersByTimeAsync(31_000);

    await vi.waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("timed out"),
      );
    });

    // State should still be flushed even on timeout
    expect(state.save).toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/*  Error handling — shutdown handler never throws                     */
/* ------------------------------------------------------------------ */

describe("craig_shutdown handler — error resilience", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("returns shutting_down even when state.get throws during async shutdown", async () => {
    const state = createMockState();
    vi.mocked(state.get).mockImplementation(() => {
      throw new Error("State corrupted");
    });

    const handler = createShutdownHandler(state, {
      mode: "daemon",
    });

    // The handler returns immediately — errors in async shutdown are logged, not returned
    const result = (await handler()) as ShutdownResult;

    expect(result.status).toBe("shutting_down");
  });

  it("continues shutdown even if scheduler.stop() throws", async () => {
    const state = createMockState();
    vi.mocked(state.get).mockReturnValue([] as never);
    const scheduler = { stop: vi.fn().mockImplementation(() => { throw new Error("Cron error"); }) };
    const onShutdown = vi.fn().mockResolvedValue(undefined);

    const handler = createShutdownHandler(state, {
      mode: "daemon",
      scheduler,
      onShutdown,
    });

    const result = (await handler()) as ShutdownResult;

    expect(result.status).toBe("shutting_down");

    // Shutdown should still proceed despite scheduler error
    await vi.waitFor(() => {
      expect(state.save).toHaveBeenCalled();
    });
  });

  it("continues shutdown even if state.save() rejects", async () => {
    const state = createMockState();
    vi.mocked(state.get).mockReturnValue([] as never);
    vi.mocked(state.save).mockRejectedValue(new Error("Write failed"));
    const onShutdown = vi.fn().mockResolvedValue(undefined);

    const handler = createShutdownHandler(state, {
      mode: "daemon",
      onShutdown,
    });

    const result = (await handler()) as ShutdownResult;

    expect(result.status).toBe("shutting_down");

    await vi.waitFor(() => {
      expect(onShutdown).toHaveBeenCalled();
    });
  });
});
