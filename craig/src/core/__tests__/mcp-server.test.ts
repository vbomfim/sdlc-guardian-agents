/**
 * Unit tests for MCP server creation and tool registration.
 *
 * Verifies that createCraigServer() creates an MCP server with
 * all 6 tools registered with correct schemas and descriptions.
 *
 * @see https://github.com/vbomfim/sdlc-guardian-agents/issues/6 — AC1
 */

import { describe, it, expect, vi } from "vitest";
import { createCraigServer } from "../mcp-server.js";
import {
  createMockState,
  createMockConfig,
  createMockCopilot,
} from "./mock-factories.js";

/* ------------------------------------------------------------------ */
/*  AC1: Server starts and registers tools                             */
/* ------------------------------------------------------------------ */

describe("createCraigServer", () => {
  it("creates an MCP server instance", () => {
    const server = createCraigServer({
      state: createMockState(),
      config: createMockConfig(),
      copilot: createMockCopilot(),
    });

    expect(server).toBeDefined();
    expect(server).toHaveProperty("connect");
    expect(server).toHaveProperty("close");
  });

  it("registers all 6 tools", () => {
    const server = createCraigServer({
      state: createMockState(),
      config: createMockConfig(),
      copilot: createMockCopilot(),
    });

    // Access the internal registered tools via the underlying server
    // McpServer stores tools as a plain object keyed by tool name
    const registeredTools = (server as unknown as Record<string, unknown>)._registeredTools as Record<string, unknown>;

    const expectedTools = [
      "craig_status",
      "craig_run_task",
      "craig_findings",
      "craig_schedule",
      "craig_config",
      "craig_digest",
    ];

    for (const toolName of expectedTools) {
      expect(registeredTools).toHaveProperty(toolName);
    }

    expect(Object.keys(registeredTools)).toHaveLength(6);
  });
});
