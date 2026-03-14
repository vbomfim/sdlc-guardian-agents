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
import type { StatePort } from "../../state/index.js";
import type { ConfigPort } from "../../config/index.js";
import type { CopilotPort } from "../../copilot/index.js";

/* ------------------------------------------------------------------ */
/*  Mock Factories                                                     */
/* ------------------------------------------------------------------ */

function createMockState(): StatePort {
  return {
    load: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockReturnValue([]),
    set: vi.fn(),
    addFinding: vi.fn(),
    getFindings: vi.fn().mockReturnValue([]),
  };
}

function createMockConfig(): ConfigPort {
  return {
    load: vi.fn().mockResolvedValue({
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
    }),
    get: vi.fn().mockReturnValue({
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
    }),
    update: vi.fn(),
    validate: vi.fn(),
  };
}

function createMockCopilot(): CopilotPort {
  return {
    invoke: vi.fn().mockResolvedValue({
      success: true,
      output: "Review complete",
      duration_ms: 1500,
      model_used: "claude-sonnet-4.5",
    }),
    isAvailable: vi.fn().mockResolvedValue(true),
  };
}

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
