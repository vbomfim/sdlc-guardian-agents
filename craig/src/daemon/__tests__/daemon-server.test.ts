/**
 * Unit tests for the daemon HTTP server.
 *
 * Tests the HTTP server that provides SSE transport and health
 * endpoint for Craig's daemon mode.
 *
 * @see https://github.com/vbomfim/sdlc-guardian-agents/issues/36 — AC1, AC2, AC3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import http from "node:http";
import {
  createRequestHandler,
  startDaemonServer,
  type DaemonServerOptions,
} from "../daemon-server.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Make an HTTP request to localhost and return status + body.
 */
async function httpRequest(
  port: number,
  path: string,
  method = "GET",
  body?: string,
): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path, method, headers: body ? { "content-type": "application/json" } : {} },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, body: data, headers: res.headers });
        });
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

/**
 * Create a minimal mock McpServer for testing.
 *
 * The connect mock calls transport.start() to simulate real MCP behavior.
 * Without this, SSE connections would hang because the transport never
 * sends the initial endpoint event.
 */
function createMockMcpServer() {
  return {
    connect: vi.fn().mockImplementation(async (transport: { start?: () => Promise<void> }) => {
      if (transport.start) {
        await transport.start();
      }
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

/* ------------------------------------------------------------------ */
/*  AC: Health endpoint                                                */
/* ------------------------------------------------------------------ */

describe("daemon server /health endpoint", () => {
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    const mockMcpServer = createMockMcpServer();
    const result = await startDaemonServer(
      mockMcpServer as unknown as Parameters<typeof startDaemonServer>[0],
      { port: 0 }, // port 0 = OS picks random available port
    );
    server = result.httpServer;
    const addr = server.address();
    port = typeof addr === "object" && addr !== null ? addr.port : 0;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("returns 200 with status JSON on GET /health", async () => {
    const res = await httpRequest(port, "/health");

    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as Record<string, unknown>;
    expect(body).toHaveProperty("status", "ok");
    expect(body).toHaveProperty("mode", "daemon");
    expect(body).toHaveProperty("uptime");
    expect(typeof body.uptime).toBe("number");
  });

  it("returns 404 for unknown paths", async () => {
    const res = await httpRequest(port, "/unknown");

    expect(res.status).toBe(404);
  });

  it("returns 405 for non-GET on /health", async () => {
    const res = await httpRequest(port, "/health", "POST");

    expect(res.status).toBe(405);
  });
});

/* ------------------------------------------------------------------ */
/*  AC: SSE transport                                                  */
/* ------------------------------------------------------------------ */

describe("daemon server SSE transport", () => {
  let server: http.Server;
  let port: number;
  let mockMcpServer: ReturnType<typeof createMockMcpServer>;

  beforeEach(async () => {
    mockMcpServer = createMockMcpServer();
    const result = await startDaemonServer(
      mockMcpServer as unknown as Parameters<typeof startDaemonServer>[0],
      { port: 0 },
    );
    server = result.httpServer;
    const addr = server.address();
    port = typeof addr === "object" && addr !== null ? addr.port : 0;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("GET /sse returns SSE content-type and connects MCP server", async () => {
    // SSE connections don't complete normally (they stream),
    // so we need to handle this carefully
    const result = await new Promise<{
      status: number;
      headers: http.IncomingHttpHeaders;
      firstChunk: string;
    }>((resolve, reject) => {
      const req = http.get(
        { hostname: "127.0.0.1", port, path: "/sse" },
        (res) => {
          let firstChunk = "";
          res.once("data", (chunk: Buffer) => {
            firstChunk = chunk.toString();
            req.destroy(); // Close connection after first chunk
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              firstChunk,
            });
          });
          // Timeout if no data comes within 2 seconds
          setTimeout(() => {
            req.destroy();
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              firstChunk: "",
            });
          }, 2000);
        },
      );
      req.on("error", (err) => {
        // Ignore connection reset errors from our req.destroy()
        if ((err as NodeJS.ErrnoException).code !== "ECONNRESET") {
          reject(err);
        }
      });
    });

    expect(result.status).toBe(200);
    expect(result.headers["content-type"]).toContain("text/event-stream");
    // MCP SSE transport sends an endpoint event as the first message
    expect(result.firstChunk).toContain("event: endpoint");
    // MCP server should have been connected
    expect(mockMcpServer.connect).toHaveBeenCalled();
  });

  it("POST /messages without valid sessionId returns 400", async () => {
    const res = await httpRequest(
      port,
      "/messages?sessionId=nonexistent",
      "POST",
      JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
    );

    expect(res.status).toBe(400);
  });
});

/* ------------------------------------------------------------------ */
/*  AC: Request routing (unit test for createRequestHandler)           */
/* ------------------------------------------------------------------ */

describe("createRequestHandler routing", () => {
  it("is a function that returns a request handler", () => {
    const mockMcpServer = createMockMcpServer();
    const handler = createRequestHandler(
      mockMcpServer as unknown as Parameters<typeof createRequestHandler>[0],
    );

    expect(typeof handler).toBe("function");
  });
});

/* ------------------------------------------------------------------ */
/*  AC: Server lifecycle                                               */
/* ------------------------------------------------------------------ */

describe("startDaemonServer", () => {
  it("returns httpServer and shutdown function", async () => {
    const mockMcpServer = createMockMcpServer();
    const result = await startDaemonServer(
      mockMcpServer as unknown as Parameters<typeof startDaemonServer>[0],
      { port: 0 },
    );

    expect(result).toHaveProperty("httpServer");
    expect(result).toHaveProperty("shutdown");
    expect(typeof result.shutdown).toBe("function");

    // Cleanup
    await result.shutdown();
  });

  it("shutdown closes the HTTP server", async () => {
    const mockMcpServer = createMockMcpServer();
    const result = await startDaemonServer(
      mockMcpServer as unknown as Parameters<typeof startDaemonServer>[0],
      { port: 0 },
    );

    await result.shutdown();

    // After shutdown, server should not accept connections
    const addr = result.httpServer.address();
    expect(addr).toBeNull(); // Server unref'd after close
  });
});
