/**
 * Craig — Entry Point
 *
 * Bootstraps the Craig MCP server: loads config, initializes state,
 * creates component instances, wires them together, and connects
 * to either stdio transport (default) or daemon mode (SSE transport).
 *
 * Usage:
 *   node dist/index.js                    # Stdio mode (MCP child process)
 *   node dist/index.js --daemon --port 3001  # Daemon mode (SSE over HTTP)
 *
 * [HEXAGONAL] This is the composition root — the only place where
 * concrete implementations are instantiated and wired together.
 * [SECURITY] Never console.log() in stdio mode — stdout is JSON-RPC.
 * All logging goes to stderr via console.error().
 *
 * @module index
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ConfigLoader } from "./config/index.js";
import { FileStateAdapter } from "./state/index.js";
import { CopilotAdapter } from "./copilot/index.js";
import { createCraigServer } from "./core/index.js";
import { parseCliArgs } from "./cli/index.js";
import { startDaemonServer } from "./daemon/index.js";

/**
 * Bootstrap and start the Craig MCP server.
 *
 * Sequence:
 * 1. Parse CLI args to determine transport mode
 * 2. Load config from craig.config.yaml
 * 3. Initialize state from .craig-state.json
 * 4. Create component adapters
 * 5. Wire dependencies into MCP server
 * 6a. Stdio mode: connect via StdioServerTransport (default)
 * 6b. Daemon mode: start HTTP server with SSE transport
 *
 * Exits with code 1 on fatal errors (missing config, etc.).
 */
async function main(): Promise<void> {
  try {
    // 1. Parse CLI args
    const args = parseCliArgs(process.argv.slice(2));

    // 2. Load config
    const config = new ConfigLoader();
    await config.load();
    const cfg = config.get();

    // [SECURITY] Log to stderr — stdout is for MCP JSON-RPC in stdio mode
    console.error(`[Craig] Starting for repo: ${cfg.repo}`);

    // 3. Initialize state
    const state = new FileStateAdapter(".craig-state.json");
    await state.load();

    // 4. Create Copilot adapter
    const copilot = new CopilotAdapter({
      defaultModel: cfg.models.default,
      guardiansPath: cfg.guardians.path,
    });

    // 5. Create and configure MCP server
    const server = createCraigServer({ state, config, copilot });

    if (args.daemon) {
      // 6b. Daemon mode: SSE transport over HTTP
      const { shutdown } = await startDaemonServer(server, {
        port: args.port,
      });

      console.error(
        `[Craig] Daemon mode: listening on http://127.0.0.1:${args.port}`,
      );
      console.error(`[Craig] SSE endpoint: http://127.0.0.1:${args.port}/sse`);
      console.error(
        `[Craig] Health check: http://127.0.0.1:${args.port}/health`,
      );

      // Graceful shutdown on SIGTERM/SIGINT (systemd, pm2, Ctrl+C)
      const handleShutdown = (): void => {
        console.error("[Craig] Shutting down daemon...");
        void shutdown().then(() => {
          console.error("[Craig] Daemon stopped.");
          process.exit(0);
        });
      };

      process.on("SIGTERM", handleShutdown);
      process.on("SIGINT", handleShutdown);
    } else {
      // 6a. Stdio mode: standard MCP child process transport (default)
      const transport = new StdioServerTransport();
      await server.connect(transport);

      console.error("[Craig] MCP server connected via stdio");
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : String(error);
    console.error(`[Craig] Fatal: ${message}`);
    process.exit(1);
  }
}

main();
