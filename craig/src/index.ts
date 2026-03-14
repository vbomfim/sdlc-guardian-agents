/**
 * Craig — Entry Point
 *
 * Bootstraps the Craig MCP server: loads config, initializes state,
 * creates component instances, wires them together, and connects
 * to the stdio transport.
 *
 * [HEXAGONAL] This is the composition root — the only place where
 * concrete implementations are instantiated and wired together.
 * [SECURITY] Never console.log() — MCP stdio uses stdout for JSON-RPC.
 * All logging goes to stderr via console.error().
 *
 * @module index
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ConfigLoader } from "./config/index.js";
import { FileStateAdapter } from "./state/index.js";
import { CopilotAdapter } from "./copilot/index.js";
import { createCraigServer } from "./core/index.js";

/**
 * Bootstrap and start the Craig MCP server.
 *
 * Sequence:
 * 1. Load config from craig.config.yaml
 * 2. Initialize state from .craig-state.json
 * 3. Create component adapters
 * 4. Wire dependencies into MCP server
 * 5. Connect via stdio transport
 *
 * Exits with code 1 on fatal errors (missing config, etc.).
 */
async function main(): Promise<void> {
  try {
    // 1. Load config
    const config = new ConfigLoader();
    await config.load();
    const cfg = config.get();

    // [SECURITY] Log to stderr — stdout is for MCP JSON-RPC
    console.error(`[Craig] Starting for repo: ${cfg.repo}`);

    // 2. Initialize state
    const state = new FileStateAdapter(".craig-state.json");
    await state.load();

    // 3. Create Copilot adapter
    const copilot = new CopilotAdapter({
      defaultModel: cfg.models.default,
      guardiansPath: cfg.guardians.path,
    });

    // 4. Create and configure MCP server
    const server = createCraigServer({ state, config, copilot });

    // 5. Connect via stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error("[Craig] MCP server connected via stdio");
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : String(error);
    console.error(`[Craig] Fatal: ${message}`);
    process.exit(1);
  }
}

main();
