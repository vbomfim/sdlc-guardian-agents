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
import { RepoManager } from "./repo-manager/index.js";
import type { StateFactory } from "./repo-manager/index.js";
import type { AnalyzerPort } from "./analyzers/analyzer.port.js";
import { createAnalyzerRegistry } from "./core/analyzer-registry.js";
import { createMergeReviewAnalyzer } from "./analyzers/merge-review/index.js";
import { createSecurityScanAnalyzer } from "./analyzers/security-scan/index.js";
import { createCoverageScanAnalyzer } from "./analyzers/coverage-scan/index.js";
import { createTechDebtAnalyzer } from "./analyzers/tech-debt/index.js";
import { createPrReviewAnalyzer } from "./analyzers/pr-review/index.js";
import { createPlatformAuditAnalyzer } from "./analyzers/platform-audit/index.js";
import { createDeliveryAuditAnalyzer } from "./analyzers/delivery-audit/index.js";
import { createResultParser } from "./result-parser/index.js";
import { GitHubAdapter } from "./github/index.js";

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
    const repoNames = cfg.repos
      ? cfg.repos.map((r) => r.repo).join(", ")
      : cfg.repo ?? "unknown";
    console.error(`[Craig] Starting for repo(s): ${repoNames}`);

    // 3. Initialize multi-repo manager
    //    In single-repo mode (no repos[]), creates one state with default path.
    //    In multi-repo mode, creates separate state files per repo.
    const stateFactory: StateFactory = (filePath: string) =>
      new FileStateAdapter(filePath);
    const repoManager = new RepoManager(cfg, stateFactory);
    await repoManager.initialize();

    // 4. Default state for backward-compatible handler fallback
    const defaultRepo = repoManager.getDefaultRepo();
    const state = repoManager.getState(defaultRepo);

    // 5. Create Copilot adapter
    const copilot = new CopilotAdapter({
      defaultModel: cfg.models.default,
      guardiansPath: cfg.guardians.path,
    });

    // 6. Create GitHub adapter for analyzers
    //    Try GITHUB_TOKEN env var first, then fall back to gh CLI auth
    let githubToken = process.env["GITHUB_TOKEN"] || process.env["GH_TOKEN"] || "";
    if (!githubToken) {
      try {
        const { execSync } = await import("node:child_process");
        githubToken = execSync("gh auth token", { encoding: "utf-8" }).trim();
        console.error("[Craig] Using GitHub token from gh CLI auth");
      } catch {
        console.error("[Craig] Warning: No GITHUB_TOKEN and gh CLI not authenticated. GitHub operations will fail.");
      }
    }
    const repoFullName = cfg.repo ?? defaultRepo;
    const [owner = "", repo = ""] = repoFullName.split("/");
    const github = githubToken
      ? GitHubAdapter.create({ token: githubToken, owner, repo })
      : null;

    // 7. Create result parser
    const resultParser = createResultParser();

    // 8. Build analyzer registry (requires GitHub adapter)
    const analyzers: AnalyzerPort[] = [];

    if (github) {
      if (cfg.capabilities.merge_review) {
        analyzers.push(createMergeReviewAnalyzer({
          copilot, github, parser: resultParser, state,
        }));
      }
      if (cfg.capabilities.bug_detection) {
        analyzers.push(createSecurityScanAnalyzer({
          copilot, github, parser: resultParser, state,
        }));
      }
      if (cfg.capabilities.coverage_gaps) {
        analyzers.push(createCoverageScanAnalyzer({
          copilot, github, parser: resultParser, state,
        }));
      }
      if (cfg.capabilities.po_audit) {
        analyzers.push(createTechDebtAnalyzer({
          copilot, github, parser: resultParser, state,
        }));
      }
      if (cfg.capabilities.pr_monitor) {
        analyzers.push(createPrReviewAnalyzer({
          copilot, github, parser: resultParser, state,
        }));
      }
      if ((cfg.capabilities as Record<string, unknown>).auto_develop) {
        // Auto-develop needs GitOpsPort adapter (not yet built) — skip for now
        console.error("[Craig] auto_develop capability requires GitOpsPort — skipping (follow-up ticket)");
      }
      if ((cfg.capabilities as Record<string, unknown>).platform_audit) {
        analyzers.push(createPlatformAuditAnalyzer({
          copilot, git: github, parser: resultParser, state,
        }));
      }
      if (cfg.capabilities.delivery_audit) {
        analyzers.push(createDeliveryAuditAnalyzer({
          copilot, github, parser: resultParser, state,
        }));
      }
    } else {
      console.error("[Craig] No GitHub token — analyzers disabled");
    }

    const registry = createAnalyzerRegistry(analyzers);
    console.error(`[Craig] ${registry.size} analyzers registered`);

    // 9. Create and configure MCP server
    const server = createCraigServer({ state, config, copilot, repoManager, registry });

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
      let isShuttingDown = false;

      const handleShutdown = (): void => {
        if (isShuttingDown) return;
        isShuttingDown = true;

        console.error("[Craig] Shutting down daemon...");

        // Safety net: force exit if graceful shutdown hangs
        const forceExitTimer = setTimeout(() => {
          console.error("[Craig] Shutdown timed out — forcing exit");
          process.exit(0);
        }, 5_000);

        void shutdown()
          .catch((err: unknown) => {
            console.error(
              "[Craig] Shutdown error:",
              err instanceof Error ? err.message : String(err),
            );
          })
          .finally(() => {
            clearTimeout(forceExitTimer);
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
