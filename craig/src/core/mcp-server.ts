/**
 * Craig MCP Server — Factory and tool registration.
 *
 * Creates an MCP server with 6 tools registered, each delegating
 * to the appropriate component via thin handler functions.
 *
 * [HEXAGONAL] The MCP server is an adapter — it adapts the MCP protocol
 * to Craig's internal ports. No business logic lives here.
 * [CLEAN-CODE] Registration is declarative: name, description, schema, handler.
 * [SECURITY] Never console.log() — MCP stdio uses stdout for JSON-RPC.
 *
 * @module core/mcp-server
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { StatePort } from "../state/index.js";
import type { ConfigPort } from "../config/index.js";
import type { CopilotPort } from "../copilot/index.js";
import {
  createStatusHandler,
  createRunTaskHandler,
  createFindingsHandler,
  createScheduleHandler,
  createConfigHandler,
  createDigestHandler,
} from "./tool-handlers.js";

/* ------------------------------------------------------------------ */
/*  Dependencies Interface                                             */
/* ------------------------------------------------------------------ */

/**
 * Dependencies required by the Craig MCP server.
 *
 * [SOLID/DIP] Depends on port interfaces, not concrete implementations.
 * All components are injected — the server has no knowledge of adapters.
 */
export interface CraigServerDeps {
  readonly state: StatePort;
  readonly config: ConfigPort;
  readonly copilot: CopilotPort;
}

/* ------------------------------------------------------------------ */
/*  Server Factory                                                     */
/* ------------------------------------------------------------------ */

/**
 * Create and configure the Craig MCP server with all 6 tools registered.
 *
 * The server is ready to be connected to a transport (StdioServerTransport
 * for CLI usage). Does NOT start the server — caller decides transport.
 *
 * [HEXAGONAL] Factory creates the adapter, wires dependencies.
 * [CLEAN-CODE] Declarative tool registration — easy to read and extend.
 *
 * @param deps - Injected component dependencies (state, config, copilot)
 * @returns Configured McpServer instance ready for transport connection
 */
export function createCraigServer(deps: CraigServerDeps): McpServer {
  const server = new McpServer({
    name: "craig",
    version: "0.1.0",
  });

  registerStatusTool(server, deps);
  registerRunTaskTool(server, deps);
  registerFindingsTool(server, deps);
  registerScheduleTool(server, deps);
  registerConfigTool(server, deps);
  registerDigestTool(server, deps);

  return server;
}

/* ------------------------------------------------------------------ */
/*  Tool Registration — one function per tool                          */
/* ------------------------------------------------------------------ */

/**
 * Register craig_status — returns current health, running tasks, last runs.
 * No parameters required.
 */
function registerStatusTool(server: McpServer, deps: CraigServerDeps): void {
  const handler = createStatusHandler(deps.state);

  server.tool(
    "craig_status",
    "Current state: running tasks, last run times, health",
    async () => {
      const result = await handler();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    },
  );
}

/**
 * Register craig_run_task — triggers a specific analyzer task on demand.
 * Validates task name and checks for duplicate runs.
 */
function registerRunTaskTool(server: McpServer, deps: CraigServerDeps): void {
  const handler = createRunTaskHandler(deps.state, deps.copilot);

  server.tool(
    "craig_run_task",
    "Trigger a specific task on demand",
    {
      task: z.enum([
        "merge_review",
        "coverage_scan",
        "security_scan",
        "tech_debt_audit",
        "dependency_check",
        "pattern_check",
        "auto_fix",
      ]),
    },
    async (args) => {
      const result = await handler(args);
      const isError = "error" in result;
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        isError,
      };
    },
  );
}

/**
 * Register craig_findings — get recent findings filtered by severity or date.
 */
function registerFindingsTool(server: McpServer, deps: CraigServerDeps): void {
  const handler = createFindingsHandler(deps.state);

  server.tool(
    "craig_findings",
    "Get recent findings by severity or category",
    {
      severity: z
        .enum(["critical", "high", "medium", "low"])
        .optional(),
      since: z.string().optional(),
    },
    async (args) => {
      const result = await handler(args);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    },
  );
}

/**
 * Register craig_schedule — view or modify the task schedule.
 */
function registerScheduleTool(server: McpServer, deps: CraigServerDeps): void {
  const handler = createScheduleHandler(deps.config);

  server.tool(
    "craig_schedule",
    "View or modify the task schedule",
    {
      action: z.enum(["view", "update"]),
      task: z.string().optional(),
      cron: z.string().optional(),
    },
    async (args) => {
      const result = await handler(args);
      const isError = "error" in result;
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        isError,
      };
    },
  );
}

/**
 * Register craig_config — view or update Craig's configuration.
 */
function registerConfigTool(server: McpServer, deps: CraigServerDeps): void {
  const handler = createConfigHandler(deps.config);

  server.tool(
    "craig_config",
    "View or update Craig's configuration",
    {
      action: z.enum(["view", "update"]),
      key: z.string().optional(),
      value: z.string().optional(),
    },
    async (args) => {
      const result = await handler(args);
      const isError = "error" in result;
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        isError,
      };
    },
  );
}

/**
 * Register craig_digest — get the daily/weekly digest summary.
 */
function registerDigestTool(server: McpServer, deps: CraigServerDeps): void {
  const handler = createDigestHandler(deps.state);

  server.tool(
    "craig_digest",
    "Get the daily/weekly digest summary",
    {
      period: z.enum(["today", "week", "month"]).optional(),
    },
    async (args) => {
      const result = await handler(args);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    },
  );
}
