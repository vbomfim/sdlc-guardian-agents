/**
 * MCP tool handler factories for Craig.
 *
 * Each factory creates a thin handler function that delegates to the
 * appropriate component (State, Config, Copilot). Handlers are pure
 * functions of their dependencies — no global state, no side effects
 * beyond calling the injected ports.
 *
 * [HEXAGONAL] These are the adapter functions that bridge MCP tool calls
 * to Craig's internal ports. Business logic lives in the components.
 * [CLEAN-CODE] Each handler is < 20 lines. Error handling returns
 * structured error objects — handlers never throw.
 * [SOLID/SRP] One handler per tool, one concern per handler.
 *
 * @module core/tool-handlers
 */

import type { StatePort, FindingFilter, Severity } from "../state/index.js";
import type { ConfigPort } from "../config/index.js";
import type { CopilotPort } from "../copilot/index.js";
import type { AnalyzerContext } from "../analyzers/index.js";
import type { AnalyzerRegistry } from "./analyzer-registry.js";
import type {
  StatusResult,
  RunTaskSuccess,
  FindingsResult,
  ScheduleResult,
  ConfigResult,
  DigestResult,
  ToolError,
  RunTaskParams,
  FindingsParams,
  ScheduleParams,
  ConfigParams,
  DigestParams,
} from "./core.types.js";
import { isValidTask } from "./core.types.js";

/* ------------------------------------------------------------------ */
/*  craig_status                                                       */
/* ------------------------------------------------------------------ */

/**
 * Create the handler for the craig_status tool.
 *
 * Delegates to State component to read running_tasks and last_runs.
 * Returns health "ok" always (degraded is reserved for future use
 * when background services are implemented).
 *
 * [HEXAGONAL] Adapter layer — reads from StatePort, formats for MCP.
 */
export function createStatusHandler(
  state: StatePort,
): () => Promise<StatusResult | ToolError> {
  return async () => {
    try {
      const runningTasks = state.get("running_tasks");
      const lastRuns = state.get("last_runs");

      return {
        running_tasks: runningTasks,
        last_runs: lastRuns,
        health: "ok" as const,
      };
    } catch (error: unknown) {
      return createToolError(error);
    }
  };
}

/* ------------------------------------------------------------------ */
/*  craig_run_task                                                     */
/* ------------------------------------------------------------------ */

/**
 * Create the handler for the craig_run_task tool.
 *
 * Validates the task name, checks for duplicate runs, registers
 * the task in state, and starts the analyzer asynchronously.
 * Returns immediately with a task_id.
 *
 * [HEXAGONAL] Adapter layer — validates, delegates to StatePort + AnalyzerRegistry.
 * [CLEAN-CODE] Fail-fast validation, then happy path.
 * [SOLID/OCP] New analyzers are added via registry — no handler changes needed.
 */
export function createRunTaskHandler(
  state: StatePort,
  copilot: CopilotPort,
  registry?: AnalyzerRegistry,
): (params: RunTaskParams) => Promise<RunTaskSuccess | ToolError> {
  return async (params) => {
    try {
      // Validate task name [AC5]
      if (!isValidTask(params.task)) {
        return {
          error: `Unknown task: ${params.task}`,
          code: "INVALID_TASK",
        };
      }

      // Check if already running [Edge case]
      const runningTasks = state.get("running_tasks");
      if (runningTasks.includes(params.task)) {
        return {
          error: `Task already running: ${params.task}`,
          code: "TASK_RUNNING",
        };
      }

      // Generate task ID
      const taskId = generateTaskId();

      // Register as running
      state.set("running_tasks", [...runningTasks, params.task]);
      await state.save();

      // Start analyzer asynchronously (fire-and-forget)
      // The task will update state when complete.
      startTaskAsync(params.task, taskId, state, copilot, registry);

      return {
        task_id: taskId,
        status: "started" as const,
      };
    } catch (error: unknown) {
      return createToolError(error);
    }
  };
}

/* ------------------------------------------------------------------ */
/*  craig_findings                                                     */
/* ------------------------------------------------------------------ */

/**
 * Create the handler for the craig_findings tool.
 *
 * Delegates filtering entirely to StatePort.getFindings().
 * The state component owns the filter logic.
 *
 * [HEXAGONAL] Thin adapter — maps MCP params to FindingFilter, returns findings.
 */
export function createFindingsHandler(
  state: StatePort,
): (params: FindingsParams) => Promise<FindingsResult | ToolError> {
  return async (params) => {
    try {
      const filter: FindingFilter = {
        ...(params.severity
          ? { severity: params.severity as Severity }
          : {}),
        ...(params.since ? { since: params.since } : {}),
      };

      const findings = state.getFindings(filter);

      return { findings };
    } catch (error: unknown) {
      return createToolError(error);
    }
  };
}

/* ------------------------------------------------------------------ */
/*  craig_schedule                                                     */
/* ------------------------------------------------------------------ */

/**
 * Create the handler for the craig_schedule tool.
 *
 * View action reads schedule from Config. Update action modifies
 * the schedule entry via Config.update().
 *
 * [HEXAGONAL] Adapter layer — delegates to ConfigPort.
 */
export function createScheduleHandler(
  config: ConfigPort,
): (params: ScheduleParams) => Promise<ScheduleResult | ToolError> {
  return async (params) => {
    try {
      if (params.action === "view") {
        const cfg = config.get();
        return { schedule: cfg.schedule };
      }

      if (params.action === "update") {
        if (!params.task || !params.cron) {
          return {
            error: "Both 'task' and 'cron' are required for schedule update",
            code: "INVALID_PARAMS",
          };
        }

        const updated = await config.update(
          `schedule.${params.task}`,
          params.cron,
        );
        return { schedule: updated.schedule };
      }

      return {
        error: `Unknown action: ${params.action}`,
        code: "INVALID_PARAMS",
      };
    } catch (error: unknown) {
      return createToolError(error);
    }
  };
}

/* ------------------------------------------------------------------ */
/*  craig_config                                                       */
/* ------------------------------------------------------------------ */

/**
 * Create the handler for the craig_config tool.
 *
 * View action returns the full config. Update action modifies
 * a single key via Config.update(). Values are coerced from
 * string to boolean/number when appropriate.
 *
 * [HEXAGONAL] Adapter layer — delegates to ConfigPort.
 * [CLEAN-CODE] Value coercion is explicit and contained.
 */
export function createConfigHandler(
  config: ConfigPort,
): (params: ConfigParams) => Promise<ConfigResult | ToolError> {
  return async (params) => {
    try {
      if (params.action === "view") {
        const cfg = config.get();
        return { config: cfg as unknown as Record<string, unknown> };
      }

      if (params.action === "update") {
        if (!params.key || params.value === undefined) {
          return {
            error: "Both 'key' and 'value' are required for config update",
            code: "INVALID_PARAMS",
          };
        }

        const coerced = coerceValue(params.value);
        const updated = await config.update(params.key, coerced);
        return { config: updated as unknown as Record<string, unknown> };
      }

      return {
        error: `Unknown action: ${params.action}`,
        code: "INVALID_PARAMS",
      };
    } catch (error: unknown) {
      return createToolError(error);
    }
  };
}

/* ------------------------------------------------------------------ */
/*  craig_digest                                                       */
/* ------------------------------------------------------------------ */

/**
 * Create the handler for the craig_digest tool.
 *
 * Returns daily stats from State. The period parameter is passed
 * through but currently only "today" stats are available (daily_stats).
 * Week/month aggregation is deferred to a future Digest Reporter component.
 *
 * [HEXAGONAL] Adapter layer — reads from StatePort.
 * [YAGNI] Returns what's available now; aggregation comes with Digest Reporter.
 */
export function createDigestHandler(
  state: StatePort,
): (params: DigestParams) => Promise<DigestResult | ToolError> {
  return async (params) => {
    try {
      const dailyStats = state.get("daily_stats");
      const period = params.period ?? "today";

      return {
        merges_reviewed: dailyStats.merges_reviewed,
        issues_created: dailyStats.issues_created,
        prs_opened: dailyStats.prs_opened,
        findings_by_severity: dailyStats.findings_by_severity,
        period,
      };
    } catch (error: unknown) {
      return createToolError(error);
    }
  };
}

/* ------------------------------------------------------------------ */
/*  Private Helpers                                                    */
/* ------------------------------------------------------------------ */

/**
 * Create a standard tool error response.
 * Extracts message from Error objects, uses String() for others.
 *
 * [CLEAN-CODE] Error responses are structured, never crash the server.
 */
function createToolError(error: unknown): ToolError {
  const message =
    error instanceof Error ? error.message : String(error);
  return { error: message, code: "INTERNAL_ERROR" };
}

/**
 * Generate a unique task ID using crypto.randomUUID().
 */
function generateTaskId(): string {
  return crypto.randomUUID();
}

/**
 * Coerce a string value to the appropriate JavaScript type.
 * - "true"/"false" → boolean
 * - Numeric strings → number
 * - Everything else → string (unchanged)
 *
 * [CLEAN-CODE] Explicit coercion prevents implicit type confusion.
 */
function coerceValue(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;

  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && value.trim() !== "") {
    return asNumber;
  }

  return value;
}

/**
 * Start a task asynchronously (fire-and-forget).
 *
 * Looks up the analyzer in the registry and executes it if found.
 * When an analyzer produces findings, they are persisted to state
 * via state.addFinding(). After execution (or if no analyzer is
 * registered), updates last_runs and removes from running_tasks.
 *
 * [SOLID/OCP] New analyzers require zero changes here — just register.
 * [CLEAN-CODE] Fire-and-forget pattern — caller gets immediate response.
 * [SECURITY] Logs to stderr to avoid corrupting MCP JSON-RPC on stdout.
 */
function startTaskAsync(
  task: string,
  taskId: string,
  state: StatePort,
  _copilot: CopilotPort,
  registry?: AnalyzerRegistry,
): void {
  // Fire-and-forget: task completes in background
  void (async () => {
    try {
      // Dispatch to registered analyzer if available [SOLID/OCP]
      const analyzer = registry?.get(task);
      if (analyzer) {
        const context: AnalyzerContext = {
          task,
          taskId,
          timestamp: new Date().toISOString(),
        };

        const result = await analyzer.execute(context);

        // Persist findings to state
        for (const finding of result.findings) {
          state.addFinding({
            id: crypto.randomUUID(),
            severity: finding.severity,
            category: finding.category,
            file: finding.file,
            issue: finding.issue,
            source: finding.source,
            detected_at: new Date().toISOString(),
            task,
          });
        }
      }

      // Record last run timestamp
      const lastRuns = state.get("last_runs");
      state.set("last_runs", {
        ...lastRuns,
        [task]: new Date().toISOString(),
      });

      // Remove from running tasks
      const runningTasks = state.get("running_tasks");
      state.set(
        "running_tasks",
        runningTasks.filter((t: string) => t !== task),
      );

      await state.save();
    } catch (error: unknown) {
      // [SECURITY] Log to stderr, not stdout — MCP uses stdout for JSON-RPC
      const message =
        error instanceof Error ? error.message : String(error);
      console.error(`[Craig] Task ${task} failed: ${message}`);
    }
  })();
}
