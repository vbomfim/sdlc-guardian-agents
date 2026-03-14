/**
 * Daemon HTTP server for Craig — SSE transport + health endpoint.
 *
 * Provides an HTTP server that exposes:
 *   GET  /sse              — SSE transport for MCP clients
 *   POST /messages          — MCP JSON-RPC message endpoint
 *   GET  /health            — Liveness check for process managers
 *
 * Uses Node.js built-in `http` module — no Express dependency.
 * The SSE transport comes from @modelcontextprotocol/sdk.
 *
 * [HEXAGONAL] This is a transport adapter — translates HTTP to MCP.
 * [CLEAN-CODE] Small functions, clear request routing.
 * [SECURITY] Binds to 127.0.0.1 by default (localhost only).
 *
 * @module daemon/daemon-server
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type http from "node:http";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Options for starting the daemon server. */
export interface DaemonServerOptions {
  /** Port to listen on. Default: 3001. */
  readonly port: number;
  /** Hostname to bind to. Default: "127.0.0.1" (localhost only). */
  readonly hostname?: string;
}

/** Result of starting the daemon server. */
export interface DaemonServerResult {
  /** The underlying Node.js HTTP server instance. */
  readonly httpServer: http.Server;
  /** Gracefully shut down the daemon server and all SSE transports. */
  readonly shutdown: () => Promise<void>;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Default hostname — localhost only for security. */
const DEFAULT_HOSTNAME = "127.0.0.1";

/** Timestamp when the daemon started, for uptime calculation. */
let startTime: number = Date.now();

/* ------------------------------------------------------------------ */
/*  Request Handler Factory                                            */
/* ------------------------------------------------------------------ */

/**
 * Create the HTTP request handler that routes to SSE, messages, or health.
 *
 * [CLEAN-CODE] Pure routing logic — each path delegates to a focused handler.
 * [SECURITY] Unknown paths return 404 — no information leakage.
 *
 * @param mcpServer - The configured McpServer instance to connect SSE transports to
 * @returns HTTP request handler function
 */
export function createRequestHandler(
  mcpServer: McpServer,
): (req: IncomingMessage, res: ServerResponse) => void {
  /**
   * Active SSE transports keyed by session ID.
   * Each SSE connection gets its own transport instance.
   */
  const transports = new Map<string, SSEServerTransport>();

  return (req: IncomingMessage, res: ServerResponse): void => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const pathname = url.pathname;
    const method = req.method ?? "GET";

    // Route: GET /health — Liveness check
    if (pathname === "/health") {
      handleHealth(method, res);
      return;
    }

    // Route: GET /sse — Establish SSE connection
    if (pathname === "/sse" && method === "GET") {
      void handleSseConnection(mcpServer, transports, res);
      return;
    }

    // Route: POST /messages — MCP JSON-RPC messages
    if (pathname === "/messages" && method === "POST") {
      void handleMessage(transports, req, res, url);
      return;
    }

    // Unknown route
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  };
}

/* ------------------------------------------------------------------ */
/*  Route Handlers                                                     */
/* ------------------------------------------------------------------ */

/**
 * Handle GET /health — returns daemon status for liveness probes.
 *
 * Used by systemd, launchd, pm2, or Kubernetes to verify Craig is alive.
 */
function handleHealth(method: string, res: ServerResponse): void {
  if (method !== "GET") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const uptimeMs = Date.now() - startTime;

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      status: "ok",
      mode: "daemon",
      uptime: Math.floor(uptimeMs / 1000),
      timestamp: new Date().toISOString(),
    }),
  );
}

/**
 * Handle GET /sse — establish a new SSE connection.
 *
 * Creates a new SSEServerTransport per connection, stores it by session ID,
 * and connects the MCP server to serve tools over this transport.
 *
 * [SECURITY] Transports are cleaned up on connection close to prevent leaks.
 */
async function handleSseConnection(
  mcpServer: McpServer,
  transports: Map<string, SSEServerTransport>,
  res: ServerResponse,
): Promise<void> {
  try {
    const transport = new SSEServerTransport("/messages", res);
    transports.set(transport.sessionId, transport);

    // Clean up transport when client disconnects
    res.on("close", () => {
      transports.delete(transport.sessionId);
    });

    await mcpServer.connect(transport);
  } catch (error: unknown) {
    console.error(
      "[Craig] SSE connection failed:",
      error instanceof Error ? error.message : String(error),
    );
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  }
}

/**
 * Handle POST /messages — route MCP JSON-RPC messages to the correct transport.
 *
 * The sessionId query parameter identifies which SSE transport to use.
 * The request body is parsed as JSON and forwarded to the transport.
 */
async function handleMessage(
  transports: Map<string, SSEServerTransport>,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const sessionId = url.searchParams.get("sessionId");

  if (!sessionId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing sessionId query parameter" }));
    return;
  }

  const transport = transports.get(sessionId);

  if (!transport) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "No active session for this sessionId" }));
    return;
  }

  try {
    // Parse request body
    const body = await readRequestBody(req);
    const parsed: unknown = JSON.parse(body);
    await transport.handlePostMessage(req, res, parsed);
  } catch (error: unknown) {
    console.error(
      "[Craig] Message handling failed:",
      error instanceof Error ? error.message : String(error),
    );
    if (!res.headersSent) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Read the full request body as a string.
 * [SECURITY] Limits body size to 1MB to prevent memory exhaustion.
 */
function readRequestBody(req: IncomingMessage): Promise<string> {
  const MAX_BODY_SIZE = 1_048_576; // 1MB

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf-8"));
    });

    req.on("error", reject);
  });
}

/* ------------------------------------------------------------------ */
/*  Server Lifecycle                                                   */
/* ------------------------------------------------------------------ */

/**
 * Start the daemon HTTP server.
 *
 * Creates an HTTP server with SSE transport and health endpoint,
 * binds to the specified port and hostname, and returns handles
 * for the server and a shutdown function.
 *
 * @param mcpServer - Configured McpServer instance
 * @param options - Server options (port, hostname)
 * @returns Server instance and shutdown function
 */
export async function startDaemonServer(
  mcpServer: McpServer,
  options: DaemonServerOptions,
): Promise<DaemonServerResult> {
  const hostname = options.hostname ?? DEFAULT_HOSTNAME;
  startTime = Date.now();

  const handler = createRequestHandler(mcpServer);
  const httpServer = createServer(handler);

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(options.port, hostname, () => {
      httpServer.removeListener("error", reject);
      resolve();
    });
  });

  const shutdown = async (): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  };

  return { httpServer, shutdown };
}
