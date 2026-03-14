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
import type { RepoManagerPort } from "../repo-manager/index.js";
import type {
  StatusResult,
  RunTaskSuccess,
  FindingsResult,
  ScheduleResult,
  ConfigResult,
  DigestResult,
  ShutdownResult,
  ToolError,
  RunTaskParams,
  FindingsParams,
  ScheduleParams,
  ConfigParams,
  DigestParams,
  StatusParams,
  ShutdownParams,
} from "./core.types.js";
import { isValidTask } from "./core.types.js";
import { sanitizeError } from "./error-sanitizer.js";

/* ------------------------------------------------------------------ */
/*  craig_status                                                       */
/* ------------------------------------------------------------------ */

/**
 * Create the handler for the craig_status tool.
 *
 * Delegates to State component to read running_tasks and last_runs.
 * When a RepoManager is provided, routes to the correct repo's state.
 *
 * [HEXAGONAL] Adapter layer — reads from StatePort, formats for MCP.
 * [AC3] Optional repo param routes to specific repo state.
 */
export function createStatusHandler(
  state: StatePort,
  repoManager?: RepoManagerPort,
): (params?: StatusParams) => Promise<StatusResult | ToolError> {
  return async (params) => {
    try {
      const targetState = resolveState(state, repoManager, params?.repo);
      const runningTasks = targetState.get("running_tasks");
      const lastRuns = targetState.get("last_runs");

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
 * When a RepoManager is provided, routes to the correct repo's state.
 *
 * [HEXAGONAL] Adapter layer — validates, delegates to StatePort + AnalyzerRegistry.
 * [CLEAN-CODE] Fail-fast validation, then happy path.
 * [SOLID/OCP] New analyzers are added via registry — no handler changes needed.
 */
export function createRunTaskHandler(
  state: StatePort,
  copilot: CopilotPort,
  registry?: AnalyzerRegistry,
  repoManager?: RepoManagerPort,
  notify?: (level: string, data: string) => void,
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

      // Resolve state for the target repo
      const targetState = resolveState(state, repoManager, params.repo);

      // Check if already running [Edge case]
      const runningTasks = targetState.get("running_tasks");
      if (runningTasks.includes(params.task)) {
        return {
          error: `Task already running: ${params.task}`,
          code: "TASK_RUNNING",
        };
      }

      // Generate task ID
      const taskId = generateTaskId();

      // Register as running
      targetState.set("running_tasks", [...runningTasks, params.task]);
      await targetState.save();

      // Start analyzer asynchronously (fire-and-forget)
      startTaskAsync(params.task, taskId, targetState, copilot, registry, notify);

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
 * When repo="all" and RepoManager is present, aggregates across all repos.
 *
 * [HEXAGONAL] Thin adapter — maps MCP params to FindingFilter, returns findings.
 * [AC3] When repo param provided, filter by repo.
 */
export function createFindingsHandler(
  state: StatePort,
  repoManager?: RepoManagerPort,
): (params: FindingsParams) => Promise<FindingsResult | ToolError> {
  return async (params) => {
    try {
      const filter: FindingFilter = {
        ...(params.severity
          ? { severity: params.severity as Severity }
          : {}),
        ...(params.since ? { since: params.since } : {}),
      };

      // Aggregate across all repos when "all" is specified
      if (params.repo === "all" && repoManager) {
        const findings = repoManager.getAllFindings(filter);
        return { findings };
      }

      // Route to specific repo or default
      const targetState = resolveState(state, repoManager, params.repo);
      const findings = targetState.getFindings(filter);

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
 * Returns daily stats from State. In multi-repo mode, aggregates
 * across all repos when no specific repo is requested.
 * When a specific repo is provided, returns that repo's stats only.
 *
 * [HEXAGONAL] Adapter layer — reads from StatePort or RepoManager.
 * [AC6] Digest aggregates across all repos.
 */
export function createDigestHandler(
  state: StatePort,
  repoManager?: RepoManagerPort,
): (params: DigestParams) => Promise<DigestResult | ToolError> {
  return async (params) => {
    try {
      const period = params.period ?? "today";

      // Multi-repo aggregation: when repo manager exists and no specific repo
      if (repoManager && !params.repo) {
        const aggregated = repoManager.getAggregatedDailyStats();
        return {
          merges_reviewed: aggregated.merges_reviewed,
          issues_created: aggregated.issues_created,
          prs_opened: aggregated.prs_opened,
          findings_by_severity: aggregated.findings_by_severity,
          period,
        };
      }

      // Specific repo or single-repo mode
      const targetState = resolveState(state, repoManager, params.repo);
      const dailyStats = targetState.get("daily_stats");

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
/*  craig_shutdown                                                     */
/* ------------------------------------------------------------------ */

/**
 * Minimal interface for components that can be stopped.
 *
 * [SOLID/ISP] Handlers depend only on what they need — a stop() method.
 * Both SchedulerPort and MergeWatcherPort satisfy this interface.
 */
export interface Stoppable {
  stop(): void;
}

/**
 * Options for the shutdown handler.
 *
 * [HEXAGONAL] These are injected dependencies — the handler doesn't
 * know about concrete adapters.
 */
export interface ShutdownHandlerOpts {
  /** Transport mode: "daemon" or "stdio". */
  readonly mode: "daemon" | "stdio";
  /** Scheduler to stop on shutdown. */
  readonly scheduler?: Stoppable;
  /** Merge watcher to stop on shutdown. */
  readonly mergeWatcher?: Stoppable;
  /** Callback to shut down the daemon HTTP server. */
  readonly onShutdown?: () => Promise<void>;
}

/** Maximum time (ms) to wait for running tasks to drain. */
const DRAIN_TIMEOUT_MS = 30_000;

/** Polling interval (ms) to check for running tasks during drain. */
const DRAIN_POLL_MS = 1_000;

/**
 * Create the handler for the craig_shutdown tool.
 *
 * In stdio mode: logs a warning and returns "ignored" — the CLI manages
 * the process lifecycle.
 *
 * In daemon mode: initiates graceful shutdown asynchronously:
 * 1. Stops scheduler and merge watcher
 * 2. Waits up to 30s for pending tasks to complete
 * 3. Flushes state to disk
 * 4. Calls onShutdown callback (HTTP server teardown)
 * 5. Exits the process
 *
 * The response is returned immediately so the MCP client receives
 * the acknowledgement before the process exits.
 *
 * [HEXAGONAL] Adapter layer — orchestrates shutdown via injected ports.
 * [CLEAN-CODE] Fire-and-forget async shutdown, same pattern as run_task.
 * [AC1] Daemon mode: stops all background services, exits cleanly.
 * [AC2] Stdio mode: logs warning, no action.
 * [AC3] Waits up to 30s for pending tasks before force exit.
 *
 * @param state - State port for flushing and checking running tasks.
 * @param opts - Shutdown dependencies (mode, stoppables, callback).
 */
export function createShutdownHandler(
  state: StatePort,
  opts: ShutdownHandlerOpts,
): (params?: ShutdownParams) => Promise<ShutdownResult | ToolError> {
  return async (params) => {
    try {
      const reason = params?.reason;
      const reasonSuffix = reason ? ` (reason: ${reason})` : "";

      // Stdio mode: lifecycle managed by CLI — warn and return [AC2]
      if (opts.mode === "stdio") {
        const message =
          `Shutdown ignored in stdio mode — lifecycle is managed by the CLI.${reasonSuffix}`;
        console.error(`[Craig] ${message}`);
        return { status: "ignored" as const, message };
      }

      // Daemon mode: initiate graceful shutdown [AC1]
      const message = `Graceful shutdown initiated.${reasonSuffix}`;
      console.error(`[Craig] Shutting down...${reasonSuffix}`);

      // Fire-and-forget: shutdown runs asynchronously after response
      void performGracefulShutdown(state, opts, reason);

      return { status: "shutting_down" as const, message };
    } catch (error: unknown) {
      return createToolError(error);
    }
  };
}

/**
 * Execute the graceful shutdown sequence.
 *
 * Order:
 * 1. Stop scheduler and merge watcher (stop accepting new work)
 * 2. Drain running tasks (wait up to 30s) [AC3]
 * 3. Flush state to disk
 * 4. Call onShutdown callback (HTTP server teardown + process exit)
 *
 * Each step is resilient — errors are caught and logged,
 * and the sequence continues to the next step.
 *
 * [HEXAGONAL] Does NOT call process.exit() — the composition root
 * provides an onShutdown callback that handles process termination.
 * [CLEAN-CODE] Each step isolated, errors don't cascade.
 * [SECURITY] Logs to stderr — stdout is MCP JSON-RPC.
 */
async function performGracefulShutdown(
  state: StatePort,
  opts: ShutdownHandlerOpts,
  _reason?: string,
): Promise<void> {
  try {
    // 1. Stop background services
    stopSafely(opts.scheduler, "scheduler");
    stopSafely(opts.mergeWatcher, "merge watcher");

    // 2. Wait for running tasks to drain [AC3]
    await drainRunningTasks(state);

    // 3. Flush state
    try {
      await state.save();
      console.error("[Craig] State flushed to disk.");
    } catch (error: unknown) {
      console.error(
        "[Craig] State flush failed:",
        error instanceof Error ? error.message : String(error),
      );
    }

    // 4. Tear down HTTP server + exit (delegated to composition root)
    if (opts.onShutdown) {
      try {
        await opts.onShutdown();
      } catch (error: unknown) {
        console.error(
          "[Craig] onShutdown callback failed:",
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    console.error("[Craig] Shutdown complete.");
  } catch (error: unknown) {
    // Catch-all: prevent unhandled rejections during shutdown
    console.error(
      "[Craig] Shutdown error:",
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * Stop a component safely — catch and log errors.
 *
 * [CLEAN-CODE] Never let a stop() failure prevent the rest of shutdown.
 */
function stopSafely(component: Stoppable | undefined, name: string): void {
  if (!component) return;
  try {
    component.stop();
    console.error(`[Craig] Stopped ${name}.`);
  } catch (error: unknown) {
    console.error(
      `[Craig] Failed to stop ${name}:`,
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * Wait for all running tasks to complete, up to DRAIN_TIMEOUT_MS.
 *
 * Polls state.get("running_tasks") every DRAIN_POLL_MS. If tasks
 * are still running after the timeout, logs a warning and proceeds.
 *
 * [AC3] Waits up to 30s for completion before force exit.
 */
async function drainRunningTasks(state: StatePort): Promise<void> {
  const runningTasks = state.get("running_tasks");
  if (runningTasks.length === 0) return;

  console.error(
    `[Craig] Waiting for ${runningTasks.length} running task(s) to complete...`,
  );

  const deadline = Date.now() + DRAIN_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const current = state.get("running_tasks");
    if (current.length === 0) {
      console.error("[Craig] All tasks completed.");
      return;
    }
    await sleep(DRAIN_POLL_MS);
  }

  const remaining = state.get("running_tasks");
  console.error(
    `[Craig] Drain timed out — ${remaining.length} task(s) still running. Proceeding with shutdown.`,
  );
}

/**
 * Sleep for the specified number of milliseconds.
 * Extracted for testability with fake timers.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ------------------------------------------------------------------ */
/*  Private Helpers                                                    */
/* ------------------------------------------------------------------ */

/**
 * Resolve the target StatePort for a tool handler.
 *
 * When a RepoManager is available and a repo is specified (or defaulted),
 * returns the state for that specific repo. Otherwise falls back to
 * the injected state (single-repo backward compatibility).
 *
 * [AC4] Backward compatible — works without RepoManager.
 * [AC3] Routes to specific repo when provided.
 */
function resolveState(
  fallbackState: StatePort,
  repoManager?: RepoManagerPort,
  repo?: string,
): StatePort {
  if (!repoManager) {
    return fallbackState;
  }
  const resolved = repoManager.resolveRepo(repo);
  return repoManager.getState(resolved);
}

/**
 * Create a standard tool error response.
 *
 * Sanitizes the error message before returning to the MCP client.
 * Detailed error information is logged to stderr for debugging.
 * Raw error.message is never exposed to MCP clients.
 *
 * [SECURITY] Prevents information disclosure via error messages.
 * [CLEAN-CODE] Delegates to sanitizeError() for mapping logic.
 *
 * @see https://github.com/vbomfim/sdlc-guardian-agents/issues/41
 */
function createToolError(error: unknown): ToolError {
  const sanitized = sanitizeError(error);
  return { error: sanitized.message, code: sanitized.code };
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
  notify?: (level: string, data: string) => void,
): void {
  const log = (msg: string, level = "info") => {
    console.error(msg);
    notify?.(level, msg);
  };

  // Fire-and-forget: task completes in background
  void (async () => {
    try {
      // Dispatch to registered analyzer if available [SOLID/OCP]
      const analyzer = registry?.get(task);
      if (analyzer) {
        log(`[Craig] Running analyzer: ${task} (${taskId})`);
        const context: AnalyzerContext = {
          task,
          taskId,
          timestamp: new Date().toISOString(),
        };

        const result = await analyzer.execute(context);
        const statusMsg = `[Craig] Analyzer ${task} completed: ${result.findings.length} findings, success=${String(result.success)}${result.success ? '' : `, error: ${result.summary}`}`;
        log(statusMsg, result.success ? "info" : "warning");

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
      } else {
        log(`[Craig] No analyzer registered for task: ${task}`, "warning");
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
