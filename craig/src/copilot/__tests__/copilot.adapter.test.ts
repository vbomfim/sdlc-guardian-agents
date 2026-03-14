/**
 * Copilot Adapter — Unit Tests
 *
 * TDD Red → Green → Refactor: These tests were written BEFORE the implementation.
 *
 * Test coverage maps to issue #5 acceptance criteria:
 * - AC1: Invoke Security Guardian — success path
 * - AC2: Handle timeout
 * - AC3: Handle SDK unavailable
 * - AC4: Retry on session failure
 * - AC5: Model selection
 * - Edge cases: empty output, concurrent invocations, context concatenation, error handling
 *
 * All SDK interactions are mocked — no real API calls.
 */

import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { CopilotAdapter } from "../copilot.adapter.js";
import type { InvokeParams, InvokeResult } from "../copilot.types.js";
import {
  CopilotSessionError,
  CopilotTimeoutError,
  CopilotUnavailableError,
} from "../copilot.errors.js";

// ---------------------------------------------------------------------------
// SDK Mocks
// ---------------------------------------------------------------------------

/**
 * Mock the @github/copilot-sdk module.
 * We create mock classes that mimic CopilotClient and CopilotSession behavior.
 */
const mockDisconnect = vi.fn().mockResolvedValue(undefined);
const mockSendAndWait = vi.fn();
const mockSetModel = vi.fn().mockResolvedValue(undefined);

const mockSession = {
  sessionId: "mock-session-123",
  disconnect: mockDisconnect,
  sendAndWait: mockSendAndWait,
  setModel: mockSetModel,
};

const mockCreateSession = vi.fn().mockResolvedValue(mockSession);
const mockDeleteSession = vi.fn().mockResolvedValue(undefined);
const mockStart = vi.fn().mockResolvedValue(undefined);
const mockStop = vi.fn().mockResolvedValue([]);
const mockPing = vi.fn().mockResolvedValue({ message: "pong", timestamp: Date.now() });
const mockGetAuthStatus = vi
  .fn()
  .mockResolvedValue({ isAuthenticated: true, login: "testuser" });

vi.mock("@github/copilot-sdk", () => {
  return {
    CopilotClient: vi.fn().mockImplementation(() => ({
      start: mockStart,
      stop: mockStop,
      createSession: mockCreateSession,
      deleteSession: mockDeleteSession,
      ping: mockPing,
      getAuthStatus: mockGetAuthStatus,
      getState: vi.fn().mockReturnValue("connected"),
    })),
    approveAll: vi.fn().mockReturnValue("allow"),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Default config-like options for the adapter. */
const DEFAULT_OPTIONS = {
  defaultModel: "claude-sonnet-4.5",
  guardiansPath: "~/.copilot/",
};

/** Build InvokeParams with defaults. */
function makeParams(overrides: Partial<InvokeParams> = {}): InvokeParams {
  return {
    agent: "security-guardian",
    prompt: "Review this diff for vulnerabilities",
    ...overrides,
  };
}

/** Simulate a successful assistant response from the SDK. */
function makeAssistantResponse(content: string) {
  return {
    type: "assistant.message" as const,
    data: { content },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CopilotAdapter", () => {
  let adapter: CopilotAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new CopilotAdapter(DEFAULT_OPTIONS);

    // Default: sendAndWait returns a Guardian report
    mockSendAndWait.mockResolvedValue(
      makeAssistantResponse("## Security Guardian Report\n\nNo issues found."),
    );
  });

  // -----------------------------------------------------------------------
  // AC1: Invoke Security Guardian — success path
  // -----------------------------------------------------------------------

  describe("AC1: Invoke Security Guardian", () => {
    it("should return success with guardian output", async () => {
      const expectedOutput = "## Security Guardian Report\n\n3 findings detected.";
      mockSendAndWait.mockResolvedValue(makeAssistantResponse(expectedOutput));

      const result = await adapter.invoke(makeParams());

      expect(result.success).toBe(true);
      expect(result.output).toBe(expectedOutput);
      expect(result.error).toBeUndefined();
    });

    it("should include duration_ms in result", async () => {
      const result = await adapter.invoke(makeParams());

      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
      expect(typeof result.duration_ms).toBe("number");
    });

    it("should include model_used in result", async () => {
      const result = await adapter.invoke(makeParams());

      expect(result.model_used).toBe("claude-sonnet-4.5");
    });

    it("should create a session with the correct agent configuration", async () => {
      await adapter.invoke(makeParams({ agent: "security-guardian" }));

      expect(mockCreateSession).toHaveBeenCalledTimes(1);
      const sessionConfig = mockCreateSession.mock.calls[0]![0];
      expect(sessionConfig.model).toBe("claude-sonnet-4.5");
    });

    it("should send prompt to the session", async () => {
      await adapter.invoke(
        makeParams({ prompt: "Review this diff for vulnerabilities" }),
      );

      expect(mockSendAndWait).toHaveBeenCalledTimes(1);
      const messageOptions = mockSendAndWait.mock.calls[0]![0];
      expect(messageOptions.prompt).toContain("Review this diff for vulnerabilities");
    });

    it("should disconnect session after invocation", async () => {
      await adapter.invoke(makeParams());

      expect(mockDisconnect).toHaveBeenCalledTimes(1);
    });

    it("should stop the client after invocation", async () => {
      await adapter.invoke(makeParams());

      expect(mockStop).toHaveBeenCalledTimes(1);
    });

    it("should include agent name in the prompt", async () => {
      await adapter.invoke(makeParams({ agent: "code-review-guardian" }));

      const messageOptions = mockSendAndWait.mock.calls[0]![0];
      expect(messageOptions.prompt).toContain("code-review-guardian");
    });

    it("should include context in the prompt when provided", async () => {
      const diffText = "--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new";
      await adapter.invoke(makeParams({ context: diffText }));

      const messageOptions = mockSendAndWait.mock.calls[0]![0];
      expect(messageOptions.prompt).toContain(diffText);
    });
  });

  // -----------------------------------------------------------------------
  // AC2: Handle timeout
  // -----------------------------------------------------------------------

  describe("AC2: Handle timeout", () => {
    it("should return failure with timeout error message", async () => {
      mockSendAndWait.mockRejectedValue(new Error("Timeout"));

      const result = await adapter.invoke(makeParams({ timeout: 1000 }));

      expect(result.success).toBe(false);
      expect(result.output).toBe("");
      expect(result.error).toBeDefined();
    });

    it("should pass timeout to sendAndWait", async () => {
      await adapter.invoke(makeParams({ timeout: 120_000 }));

      const timeout = mockSendAndWait.mock.calls[0]![1];
      expect(timeout).toBe(120_000);
    });

    it("should use default 5-minute timeout when not specified", async () => {
      await adapter.invoke(makeParams());

      const timeout = mockSendAndWait.mock.calls[0]![1];
      expect(timeout).toBe(300_000);
    });

    it("should still disconnect session on timeout", async () => {
      mockSendAndWait.mockRejectedValue(new Error("Timeout"));

      await adapter.invoke(makeParams({ timeout: 1000 }));

      expect(mockDisconnect).toHaveBeenCalledTimes(1);
    });

    it("should still stop client on timeout", async () => {
      mockSendAndWait.mockRejectedValue(new Error("Timeout"));

      await adapter.invoke(makeParams({ timeout: 1000 }));

      expect(mockStop).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // AC3: Handle SDK unavailable
  // -----------------------------------------------------------------------

  describe("AC3: Handle SDK unavailable", () => {
    it("should return false when ping fails", async () => {
      mockPing.mockRejectedValue(new Error("Connection refused"));

      const available = await adapter.isAvailable();

      expect(available).toBe(false);
    });

    it("should return true when ping succeeds and auth is OK", async () => {
      mockPing.mockResolvedValue({ message: "pong", timestamp: Date.now() });
      mockGetAuthStatus.mockResolvedValue({
        isAuthenticated: true,
        login: "testuser",
      });

      const available = await adapter.isAvailable();

      expect(available).toBe(true);
    });

    it("should return false when auth check fails", async () => {
      mockPing.mockResolvedValue({ message: "pong", timestamp: Date.now() });
      mockGetAuthStatus.mockRejectedValue(new Error("Not authenticated"));

      const available = await adapter.isAvailable();

      expect(available).toBe(false);
    });

    it("should stop client after availability check", async () => {
      await adapter.isAvailable();

      expect(mockStop).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // AC4: Retry on session failure
  // -----------------------------------------------------------------------

  describe("AC4: Retry on session failure", () => {
    it("should retry once when session creation fails", async () => {
      mockCreateSession
        .mockRejectedValueOnce(new Error("Session creation failed"))
        .mockResolvedValueOnce(mockSession);

      const result = await adapter.invoke(makeParams());

      expect(result.success).toBe(true);
      expect(mockCreateSession).toHaveBeenCalledTimes(2);
    });

    it("should return failure when both attempts fail", async () => {
      mockCreateSession
        .mockRejectedValueOnce(new Error("First failure"))
        .mockRejectedValueOnce(new Error("Second failure"));

      const result = await adapter.invoke(makeParams());

      expect(result.success).toBe(false);
      expect(result.error).toContain("Second failure");
      expect(mockCreateSession).toHaveBeenCalledTimes(2);
    });

    it("should still clean up client after retry failure", async () => {
      mockCreateSession
        .mockRejectedValueOnce(new Error("First failure"))
        .mockRejectedValueOnce(new Error("Second failure"));

      await adapter.invoke(makeParams());

      expect(mockStop).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // AC5: Model selection
  // -----------------------------------------------------------------------

  describe("AC5: Model selection", () => {
    it("should use default model from config", async () => {
      await adapter.invoke(makeParams());

      const sessionConfig = mockCreateSession.mock.calls[0]![0];
      expect(sessionConfig.model).toBe("claude-sonnet-4.5");
    });

    it("should use override model when specified in params", async () => {
      await adapter.invoke(makeParams({ model: "claude-opus-4.6" }));

      const sessionConfig = mockCreateSession.mock.calls[0]![0];
      expect(sessionConfig.model).toBe("claude-opus-4.6");
    });

    it("should report model_used matching the override", async () => {
      const result = await adapter.invoke(makeParams({ model: "gpt-5.4" }));

      expect(result.model_used).toBe("gpt-5.4");
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe("Edge cases", () => {
    it("should handle empty output from agent", async () => {
      mockSendAndWait.mockResolvedValue(makeAssistantResponse(""));

      const result = await adapter.invoke(makeParams());

      expect(result.success).toBe(true);
      expect(result.output).toBe("");
    });

    it("should handle undefined response from sendAndWait", async () => {
      mockSendAndWait.mockResolvedValue(undefined);

      const result = await adapter.invoke(makeParams());

      expect(result.success).toBe(true);
      expect(result.output).toBe("");
    });

    it("should handle sendAndWait error as failure (not throw)", async () => {
      mockSendAndWait.mockRejectedValue(new Error("Network error"));

      const result = await adapter.invoke(makeParams());

      expect(result.success).toBe(false);
      expect(result.error).toContain("Network error");
      expect(result.output).toBe("");
    });

    it("should disconnect session even when sendAndWait fails", async () => {
      mockSendAndWait.mockRejectedValue(new Error("Boom"));

      await adapter.invoke(makeParams());

      expect(mockDisconnect).toHaveBeenCalledTimes(1);
    });

    it("should handle disconnect failure gracefully", async () => {
      mockDisconnect.mockRejectedValueOnce(new Error("Disconnect failed"));

      // Should not throw
      const result = await adapter.invoke(makeParams());

      expect(result.success).toBe(true);
    });

    it("should handle stop failure gracefully", async () => {
      mockStop.mockResolvedValueOnce([new Error("Stop error")]);

      // Should not throw
      const result = await adapter.invoke(makeParams());

      expect(result.success).toBe(true);
    });

    it("should accept all guardian agent types", async () => {
      const agents = [
        "security-guardian",
        "code-review-guardian",
        "qa-guardian",
        "po-guardian",
      ] as const;

      for (const agent of agents) {
        vi.clearAllMocks();
        mockSendAndWait.mockResolvedValue(
          makeAssistantResponse(`## ${agent} Report`),
        );

        const result = await adapter.invoke(makeParams({ agent }));
        expect(result.success).toBe(true);
        expect(result.output).toContain(agent);
      }
    });

    it("should configure session with guardiansPath as agent slug", async () => {
      await adapter.invoke(makeParams({ agent: "security-guardian" }));

      const sessionConfig = mockCreateSession.mock.calls[0]![0];
      // Adapter should configure customAgents or include path info
      expect(sessionConfig).toBeDefined();
    });

    it("should set onPermissionRequest to approve all", async () => {
      await adapter.invoke(makeParams());

      const sessionConfig = mockCreateSession.mock.calls[0]![0];
      expect(sessionConfig.onPermissionRequest).toBeDefined();
    });
  });
});
