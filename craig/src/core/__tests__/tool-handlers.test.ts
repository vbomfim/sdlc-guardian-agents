/**
 * Unit tests for MCP tool handlers — the core component.
 *
 * Tests written FIRST per TDD — each acceptance criterion from issue #6
 * maps to one or more tests. Tool handlers are thin wrappers that delegate
 * to State, Config, and Copilot components.
 *
 * @see https://github.com/vbomfim/sdlc-guardian-agents/issues/6
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createStatusHandler,
  createRunTaskHandler,
  createFindingsHandler,
  createScheduleHandler,
  createConfigHandler,
  createDigestHandler,
} from "../tool-handlers.js";
import type { StatePort } from "../../state/index.js";
import type { ConfigPort } from "../../config/index.js";
import type { CopilotPort } from "../../copilot/index.js";
import {
  createMockState,
  createMockConfig,
  createMockCopilot,
} from "./mock-factories.js";

/* ------------------------------------------------------------------ */
/*  AC2: craig_status returns health                                   */
/* ------------------------------------------------------------------ */

describe("craig_status handler", () => {
  let state: StatePort;
  let handler: ReturnType<typeof createStatusHandler>;

  beforeEach(() => {
    state = createMockState();
    handler = createStatusHandler(state);
  });

  it("returns running_tasks, last_runs, and health from state", async () => {
    vi.mocked(state.get).mockImplementation(<K extends string>(key: K) => {
      if (key === "running_tasks") return [] as never;
      if (key === "last_runs")
        return { merge_review: "2025-07-10T08:00:00Z" } as never;
      return [] as never;
    });

    const result = await handler();

    expect(result).toEqual({
      running_tasks: [],
      last_runs: { merge_review: "2025-07-10T08:00:00Z" },
      health: "ok",
    });
  });

  it('returns health "ok" even when tasks are running (degraded reserved for future use)', async () => {
    vi.mocked(state.get).mockImplementation(<K extends string>(key: K) => {
      if (key === "running_tasks") return ["security_scan"] as never;
      if (key === "last_runs") return {} as never;
      return [] as never;
    });

    const result = await handler();

    expect(result.health).toBe("ok");
    expect(result.running_tasks).toEqual(["security_scan"]);
  });
});

/* ------------------------------------------------------------------ */
/*  AC3: craig_run_task triggers analyzer                              */
/* ------------------------------------------------------------------ */

describe("craig_run_task handler", () => {
  let state: StatePort;
  let copilot: CopilotPort;
  let handler: ReturnType<typeof createRunTaskHandler>;

  beforeEach(() => {
    state = createMockState();
    copilot = createMockCopilot();
    handler = createRunTaskHandler(state, copilot);
  });

  it("starts a valid task and returns task_id + started status", async () => {
    vi.mocked(state.get).mockReturnValue([] as never);

    const result = await handler({ task: "security_scan" });

    expect(result).toHaveProperty("task_id");
    expect(result.status).toBe("started");
    expect(typeof result.task_id).toBe("string");
    expect(result.task_id.length).toBeGreaterThan(0);
  });

  it("registers the task as running in state", async () => {
    vi.mocked(state.get).mockReturnValue([] as never);

    await handler({ task: "security_scan" });

    expect(state.set).toHaveBeenCalledWith(
      "running_tasks",
      expect.arrayContaining(["security_scan"]),
    );
    expect(state.save).toHaveBeenCalled();
  });

  it("returns error for unknown task name (AC5)", async () => {
    vi.mocked(state.get).mockReturnValue([] as never);

    const result = await handler({ task: "nonexistent" as never });

    expect(result).toEqual({
      error: "Unknown task: nonexistent",
      code: "INVALID_TASK",
    });
  });

  it("returns error when task is already running (edge case)", async () => {
    vi.mocked(state.get).mockReturnValue(["security_scan"] as never);

    const result = await handler({ task: "security_scan" });

    expect(result).toEqual({
      error: "Task already running: security_scan",
      code: "TASK_RUNNING",
    });
  });
});

/* ------------------------------------------------------------------ */
/*  AC4: craig_findings filters results                                */
/* ------------------------------------------------------------------ */

describe("craig_findings handler", () => {
  let state: StatePort;
  let handler: ReturnType<typeof createFindingsHandler>;

  const sampleFindings = [
    {
      id: "f1",
      severity: "critical" as const,
      category: "security",
      file: "src/db.ts",
      issue: "SQL injection",
      source: "security-guardian",
      detected_at: "2025-07-10T08:00:00Z",
      task: "security_scan",
    },
    {
      id: "f2",
      severity: "low" as const,
      category: "code-quality",
      file: "src/utils.ts",
      issue: "Unused variable",
      source: "code-review-guardian",
      detected_at: "2025-07-09T08:00:00Z",
      task: "coverage_scan",
    },
  ];

  beforeEach(() => {
    state = createMockState();
    handler = createFindingsHandler(state);
  });

  it("returns all findings when no filter is provided", async () => {
    vi.mocked(state.getFindings).mockReturnValue(sampleFindings);

    const result = await handler({});

    expect(result.findings).toHaveLength(2);
    expect(state.getFindings).toHaveBeenCalledWith({});
  });

  it("filters by severity when provided", async () => {
    vi.mocked(state.getFindings).mockReturnValue([sampleFindings[0]]);

    const result = await handler({ severity: "critical" });

    expect(state.getFindings).toHaveBeenCalledWith({ severity: "critical" });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe("critical");
  });

  it("filters by since date when provided", async () => {
    const since = "2025-07-10T00:00:00Z";
    vi.mocked(state.getFindings).mockReturnValue([sampleFindings[0]]);

    const result = await handler({ since });

    expect(state.getFindings).toHaveBeenCalledWith({ since });
    expect(result.findings).toHaveLength(1);
  });

  it("returns empty array when no findings match", async () => {
    vi.mocked(state.getFindings).mockReturnValue([]);

    const result = await handler({ severity: "critical" });

    expect(result.findings).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  craig_schedule handler                                             */
/* ------------------------------------------------------------------ */

describe("craig_schedule handler", () => {
  let config: ConfigPort;
  let handler: ReturnType<typeof createScheduleHandler>;

  beforeEach(() => {
    config = createMockConfig();
    handler = createScheduleHandler(config);
  });

  it("returns current schedule on view action", async () => {
    const result = await handler({ action: "view" });

    expect(result.schedule).toBeDefined();
    expect(config.get).toHaveBeenCalled();
  });

  it("updates schedule on update action", async () => {
    vi.mocked(config.update).mockResolvedValue({
      repo: "owner/repo",
      branch: "main",
      schedule: { coverage_scan: "0 9 * * *" },
      capabilities: {
        merge_review: true,
        coverage_gaps: true,
        bug_detection: true,
        pattern_enforcement: true,
        po_audit: true,
        auto_fix: true,
        dependency_updates: true,
      },
      models: { default: "claude-sonnet-4.5" },
      autonomy: {
        create_issues: true,
        create_draft_prs: true,
        auto_merge: false as const,
      },
      guardians: { path: "~/.copilot/" },
    });

    const result = await handler({
      action: "update",
      task: "coverage_scan",
      cron: "0 9 * * *",
    });

    expect(config.update).toHaveBeenCalledWith(
      "schedule.coverage_scan",
      "0 9 * * *",
    );
    expect(result.schedule).toBeDefined();
  });

  it("returns error when update is missing task or cron", async () => {
    const result = await handler({ action: "update" });

    expect(result).toHaveProperty("error");
    expect(result).toHaveProperty("code", "INVALID_PARAMS");
  });
});

/* ------------------------------------------------------------------ */
/*  craig_config handler                                               */
/* ------------------------------------------------------------------ */

describe("craig_config handler", () => {
  let config: ConfigPort;
  let handler: ReturnType<typeof createConfigHandler>;

  beforeEach(() => {
    config = createMockConfig();
    handler = createConfigHandler(config);
  });

  it("returns current config on view action", async () => {
    const result = await handler({ action: "view" });

    expect(result.config).toBeDefined();
    expect(config.get).toHaveBeenCalled();
  });

  it("updates config on update action", async () => {
    vi.mocked(config.update).mockResolvedValue({
      repo: "owner/repo",
      branch: "main",
      schedule: {},
      capabilities: {
        merge_review: true,
        coverage_gaps: true,
        bug_detection: true,
        pattern_enforcement: true,
        po_audit: true,
        auto_fix: false,
        dependency_updates: true,
      },
      models: { default: "claude-sonnet-4.5" },
      autonomy: {
        create_issues: true,
        create_draft_prs: true,
        auto_merge: false as const,
      },
      guardians: { path: "~/.copilot/" },
    });

    const result = await handler({
      action: "update",
      key: "capabilities.auto_fix",
      value: "false",
    });

    expect(config.update).toHaveBeenCalledWith("capabilities.auto_fix", false);
    expect(result.config).toBeDefined();
  });

  it("returns error when update is missing key or value", async () => {
    const result = await handler({ action: "update" });

    expect(result).toHaveProperty("error");
    expect(result).toHaveProperty("code", "INVALID_PARAMS");
  });
});

/* ------------------------------------------------------------------ */
/*  craig_digest handler                                               */
/* ------------------------------------------------------------------ */

describe("craig_digest handler", () => {
  let state: StatePort;
  let handler: ReturnType<typeof createDigestHandler>;

  beforeEach(() => {
    state = createMockState();
    handler = createDigestHandler(state);
  });

  it("returns daily stats from state for today period", async () => {
    vi.mocked(state.get).mockReturnValue({
      merges_reviewed: 5,
      issues_created: 3,
      prs_opened: 1,
      findings_by_severity: {
        critical: 1,
        high: 2,
        medium: 0,
        low: 0,
        info: 0,
      },
    } as never);

    const result = await handler({});

    expect(result).toHaveProperty("merges_reviewed", 5);
    expect(result).toHaveProperty("issues_created", 3);
    expect(result).toHaveProperty("prs_opened", 1);
    expect(result).toHaveProperty("findings_by_severity");
  });

  it("accepts a period parameter", async () => {
    vi.mocked(state.get).mockReturnValue({
      merges_reviewed: 10,
      issues_created: 7,
      prs_opened: 2,
      findings_by_severity: {
        critical: 0,
        high: 3,
        medium: 4,
        low: 0,
        info: 0,
      },
    } as never);

    const result = await handler({ period: "week" });

    expect(result).toHaveProperty("merges_reviewed");
    expect(result).toHaveProperty("period", "week");
  });
});

/* ------------------------------------------------------------------ */
/*  Error handling — tool handlers never throw                         */
/* ------------------------------------------------------------------ */

describe("error handling — handlers return sanitized errors, never throw", () => {
  it("craig_status returns sanitized error on state failure", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const state = createMockState();
    vi.mocked(state.get).mockImplementation(() => {
      throw new Error("State corrupted");
    });
    const handler = createStatusHandler(state);

    const result = await handler();

    expect(result).toHaveProperty("error", "An internal error occurred.");
    expect(result).toHaveProperty("code", "INTERNAL_ERROR");
    // Verify raw message is NOT leaked
    expect(result.error).not.toContain("State corrupted");
    errorSpy.mockRestore();
  });

  it("craig_findings returns sanitized error on state failure", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const state = createMockState();
    vi.mocked(state.getFindings).mockImplementation(() => {
      throw new Error("State corrupted");
    });
    const handler = createFindingsHandler(state);

    const result = await handler({});

    expect(result).toHaveProperty("error", "An internal error occurred.");
    expect(result).toHaveProperty("code", "INTERNAL_ERROR");
    expect(result.error).not.toContain("State corrupted");
    errorSpy.mockRestore();
  });

  it("craig_config returns sanitized error on config failure", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const config = createMockConfig();
    vi.mocked(config.get).mockImplementation(() => {
      throw new Error("Config not loaded");
    });
    const handler = createConfigHandler(config);

    const result = await handler({ action: "view" });

    expect(result).toHaveProperty("error", "An internal error occurred.");
    expect(result).toHaveProperty("code", "INTERNAL_ERROR");
    expect(result.error).not.toContain("Config not loaded");
    errorSpy.mockRestore();
  });
});

/* ------------------------------------------------------------------ */
/*  coerceValue — tested indirectly via config update handler          */
/* ------------------------------------------------------------------ */

describe("coerceValue (via craig_config update)", () => {
  let config: ConfigPort;
  let handler: ReturnType<typeof createConfigHandler>;

  beforeEach(() => {
    config = createMockConfig();
    vi.mocked(config.update).mockResolvedValue({
      repo: "owner/repo",
      branch: "main",
      schedule: {},
      capabilities: {
        merge_review: true,
        coverage_gaps: true,
        bug_detection: true,
        pattern_enforcement: true,
        po_audit: true,
        auto_fix: true,
        dependency_updates: true,
      },
      models: { default: "claude-sonnet-4.5" },
      autonomy: {
        create_issues: true,
        create_draft_prs: true,
        auto_merge: false as const,
      },
      guardians: { path: "~/.copilot/" },
    });
    handler = createConfigHandler(config);
  });

  it('coerces "true" string to boolean true', async () => {
    await handler({ action: "update", key: "capabilities.auto_fix", value: "true" });
    expect(config.update).toHaveBeenCalledWith("capabilities.auto_fix", true);
  });

  it('coerces "false" string to boolean false', async () => {
    await handler({ action: "update", key: "capabilities.auto_fix", value: "false" });
    expect(config.update).toHaveBeenCalledWith("capabilities.auto_fix", false);
  });

  it("coerces numeric string to number", async () => {
    await handler({ action: "update", key: "some.key", value: "42" });
    expect(config.update).toHaveBeenCalledWith("some.key", 42);
  });

  it("coerces zero string to number 0", async () => {
    await handler({ action: "update", key: "some.key", value: "0" });
    expect(config.update).toHaveBeenCalledWith("some.key", 0);
  });

  it("coerces float string to number", async () => {
    await handler({ action: "update", key: "some.key", value: "3.14" });
    expect(config.update).toHaveBeenCalledWith("some.key", 3.14);
  });

  it("keeps non-numeric, non-boolean strings as strings", async () => {
    await handler({ action: "update", key: "repo", value: "new-owner/new-repo" });
    expect(config.update).toHaveBeenCalledWith("repo", "new-owner/new-repo");
  });

  it("does not coerce empty string to number 0", async () => {
    await handler({ action: "update", key: "some.key", value: "" });
    expect(config.update).toHaveBeenCalledWith("some.key", "");
  });

  it("does not coerce whitespace-only string to number", async () => {
    await handler({ action: "update", key: "some.key", value: "  " });
    expect(config.update).toHaveBeenCalledWith("some.key", "  ");
  });
});

/* ------------------------------------------------------------------ */
/*  startTaskAsync — tested indirectly via craig_run_task handler      */
/* ------------------------------------------------------------------ */

describe("startTaskAsync (via craig_run_task)", () => {
  let state: StatePort;
  let copilot: CopilotPort;
  let handler: ReturnType<typeof createRunTaskHandler>;

  beforeEach(() => {
    state = createMockState();
    copilot = createMockCopilot();
    handler = createRunTaskHandler(state, copilot);
  });

  it("records last_run timestamp after async task completion", async () => {
    vi.mocked(state.get).mockImplementation(<K extends string>(key: K) => {
      if (key === "running_tasks") return [] as never;
      if (key === "last_runs") return {} as never;
      return [] as never;
    });

    const result = await handler({ task: "security_scan" });

    expect(result).toHaveProperty("status", "started");

    // Wait for the fire-and-forget async to complete
    await vi.waitFor(() => {
      expect(state.set).toHaveBeenCalledWith(
        "last_runs",
        expect.objectContaining({ security_scan: expect.any(String) }),
      );
    });
  });

  it("removes task from running_tasks after async completion", async () => {
    let currentRunningTasks: string[] = [];
    vi.mocked(state.get).mockImplementation(<K extends string>(key: K) => {
      if (key === "running_tasks") return currentRunningTasks as never;
      if (key === "last_runs") return {} as never;
      return [] as never;
    });
    vi.mocked(state.set).mockImplementation(
      <K extends string>(key: K, value: unknown) => {
        if (key === "running_tasks") {
          currentRunningTasks = value as string[];
        }
      },
    );

    await handler({ task: "coverage_scan" });

    // Wait for async completion
    await vi.waitFor(() => {
      expect(state.save).toHaveBeenCalled();
    });

    // Task should have been removed from running_tasks
    expect(state.set).toHaveBeenCalledWith(
      "running_tasks",
      expect.not.arrayContaining(["coverage_scan"]),
    );
  });

  it("logs to stderr on async task failure, does not crash", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    vi.mocked(state.get).mockImplementation(<K extends string>(key: K) => {
      if (key === "running_tasks") return [] as never;
      if (key === "last_runs") {
        throw new Error("State read failed");
      }
      return [] as never;
    });

    // The handler should still return "started" (fire-and-forget)
    const result = await handler({ task: "security_scan" });
    expect(result).toHaveProperty("status", "started");

    // Wait for the async error handling
    await vi.waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[Craig] Task security_scan failed"),
      );
    });

    errorSpy.mockRestore();
  });
});
