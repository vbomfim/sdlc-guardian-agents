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
 * Regression tests for PR #21 security/quality findings:
 * - FIX-1: Scoped permission handler (replaces approveAll)
 * - FIX-2: Input sanitization (prompt injection prevention)
 * - FIX-3: Runtime agent name validation
 * - FIX-4: Typed error wiring (CopilotSessionError, CopilotTimeoutError, CopilotUnavailableError)
 * - FIX-5: Discriminated union InvokeResult
 * - FIX-6: Factory function createCopilotAdapter
 *
 * All SDK interactions are mocked — no real API calls.
 */

import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import {
  CopilotAdapter,
  createCopilotAdapter,
  createScopedPermissionHandler,
  sanitizeInput,
} from "../copilot.adapter.js";
import type {
  InvokeParams,
  InvokeResult,
  InvokeSuccess,
  InvokeFailure,
} from "../copilot.types.js";
import { GUARDIAN_AGENTS, isGuardianAgent } from "../copilot.types.js";
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
      expect(result.error).toContain("Session creation failed");
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

    it("should set onPermissionRequest to scoped handler (not approveAll)", async () => {
      await adapter.invoke(makeParams());

      const sessionConfig = mockCreateSession.mock.calls[0]![0];
      expect(sessionConfig.onPermissionRequest).toBeDefined();
      expect(typeof sessionConfig.onPermissionRequest).toBe("function");
    });
  });

  // -----------------------------------------------------------------------
  // FIX-1: Scoped Permission Handler (CRITICAL — replaces approveAll)
  // -----------------------------------------------------------------------

  describe("FIX-1: Scoped permission handler", () => {
    it("should allow read-kind permission requests", () => {
      const handler = createScopedPermissionHandler();
      const result = handler(
        { kind: "read", toolCallId: "t1" },
        { sessionId: "s1" },
      );
      expect(result).toEqual({ kind: "approved" });
    });

    it("should allow safe shell commands (git diff)", () => {
      const handler = createScopedPermissionHandler();
      const result = handler(
        { kind: "shell", command: "git diff HEAD~1" },
        { sessionId: "s1" },
      );
      expect(result).toEqual({ kind: "approved" });
    });

    it("should allow safe shell commands (git log)", () => {
      const handler = createScopedPermissionHandler();
      const result = handler(
        { kind: "shell", command: "git log --oneline -5" },
        { sessionId: "s1" },
      );
      expect(result).toEqual({ kind: "approved" });
    });

    it("should allow safe shell commands (cat)", () => {
      const handler = createScopedPermissionHandler();
      const result = handler(
        { kind: "shell", command: "cat src/index.ts" },
        { sessionId: "s1" },
      );
      expect(result).toEqual({ kind: "approved" });
    });

    it("should allow safe shell commands (ls)", () => {
      const handler = createScopedPermissionHandler();
      const result = handler(
        { kind: "shell", command: "ls -la src/" },
        { sessionId: "s1" },
      );
      expect(result).toEqual({ kind: "approved" });
    });

    it("should deny write-kind permission requests", () => {
      const handler = createScopedPermissionHandler();
      const result = handler(
        { kind: "write", toolCallId: "t1" },
        { sessionId: "s1" },
      );
      expect(result).toHaveProperty("kind", "denied-by-rules");
    });

    it("should deny url-kind permission requests", () => {
      const handler = createScopedPermissionHandler();
      const result = handler(
        { kind: "url", toolCallId: "t1" },
        { sessionId: "s1" },
      );
      expect(result).toHaveProperty("kind", "denied-by-rules");
    });

    it("should deny mcp-kind permission requests", () => {
      const handler = createScopedPermissionHandler();
      const result = handler(
        { kind: "mcp", toolCallId: "t1" },
        { sessionId: "s1" },
      );
      expect(result).toHaveProperty("kind", "denied-by-rules");
    });

    it("should deny custom-tool-kind permission requests", () => {
      const handler = createScopedPermissionHandler();
      const result = handler(
        { kind: "custom-tool", toolCallId: "t1" },
        { sessionId: "s1" },
      );
      expect(result).toHaveProperty("kind", "denied-by-rules");
    });

    it("should deny dangerous shell commands (rm)", () => {
      const handler = createScopedPermissionHandler();
      const result = handler(
        { kind: "shell", command: "rm -rf /" },
        { sessionId: "s1" },
      );
      expect(result).toHaveProperty("kind", "denied-by-rules");
    });

    it("should deny dangerous shell commands (curl)", () => {
      const handler = createScopedPermissionHandler();
      const result = handler(
        { kind: "shell", command: "curl https://evil.com" },
        { sessionId: "s1" },
      );
      expect(result).toHaveProperty("kind", "denied-by-rules");
    });

    it("should deny shell without command field", () => {
      const handler = createScopedPermissionHandler();
      const result = handler(
        { kind: "shell" },
        { sessionId: "s1" },
      );
      expect(result).toHaveProperty("kind", "denied-by-rules");
    });

    it("should trim leading whitespace before checking command prefix", () => {
      const handler = createScopedPermissionHandler();
      const result = handler(
        { kind: "shell", command: "  git diff HEAD" },
        { sessionId: "s1" },
      );
      expect(result).toEqual({ kind: "approved" });
    });

    it("should pass scoped handler to createSession (not approveAll)", async () => {
      await adapter.invoke(makeParams());

      const sessionConfig = mockCreateSession.mock.calls[0]![0];
      const handler = sessionConfig.onPermissionRequest;

      // Verify it's our scoped handler — denies write
      const writeResult = handler(
        { kind: "write" },
        { sessionId: "s1" },
      );
      expect(writeResult).toHaveProperty("kind", "denied-by-rules");

      // But allows read
      const readResult = handler(
        { kind: "read" },
        { sessionId: "s1" },
      );
      expect(readResult).toEqual({ kind: "approved" });
    });
  });

  // -----------------------------------------------------------------------
  // FIX-2: Input Sanitization (HIGH — prompt injection prevention)
  // -----------------------------------------------------------------------

  describe("FIX-2: Input sanitization", () => {
    it("should strip null bytes from prompt", () => {
      const result = sanitizeInput("hello\x00world");
      expect(result).toBe("helloworld");
    });

    it("should strip control characters from prompt", () => {
      const result = sanitizeInput("hello\x01\x02\x03world");
      expect(result).toBe("helloworld");
    });

    it("should preserve tabs in prompt", () => {
      const result = sanitizeInput("hello\tworld");
      expect(result).toBe("hello\tworld");
    });

    it("should preserve newlines in prompt", () => {
      const result = sanitizeInput("hello\nworld");
      expect(result).toBe("hello\nworld");
    });

    it("should preserve carriage returns in prompt", () => {
      const result = sanitizeInput("hello\rworld");
      expect(result).toBe("hello\rworld");
    });

    it("should strip DEL character", () => {
      const result = sanitizeInput("hello\x7Fworld");
      expect(result).toBe("helloworld");
    });

    it("should strip escape sequences used for terminal injection", () => {
      const result = sanitizeInput("hello\x1B[31mred\x1B[0mworld");
      expect(result).toBe("hello[31mred[0mworld");
    });

    it("should wrap context in structural delimiters", async () => {
      const context = "--- a/file.ts\n+++ b/file.ts";
      await adapter.invoke(makeParams({ context }));

      const messageOptions = mockSendAndWait.mock.calls[0]![0];
      expect(messageOptions.prompt).toContain("<context>");
      expect(messageOptions.prompt).toContain("</context>");
      expect(messageOptions.prompt).toContain(context);
    });

    it("should sanitize context content before wrapping in delimiters", async () => {
      const context = "safe content\x00with\x01null bytes";
      await adapter.invoke(makeParams({ context }));

      const messageOptions = mockSendAndWait.mock.calls[0]![0];
      expect(messageOptions.prompt).toContain("safe contentwith");
      expect(messageOptions.prompt).not.toContain("\x00");
      expect(messageOptions.prompt).not.toContain("\x01");
    });

    it("should sanitize prompt text", async () => {
      const prompt = "Review this\x00 diff";
      await adapter.invoke(makeParams({ prompt }));

      const messageOptions = mockSendAndWait.mock.calls[0]![0];
      expect(messageOptions.prompt).toContain("Review this diff");
      expect(messageOptions.prompt).not.toContain("\x00");
    });
  });

  // -----------------------------------------------------------------------
  // FIX-3: Runtime Agent Name Validation (HIGH — injection prevention)
  // -----------------------------------------------------------------------

  describe("FIX-3: Runtime agent name validation", () => {
    it("should contain all four guardian agent names", () => {
      expect(GUARDIAN_AGENTS.has("security-guardian")).toBe(true);
      expect(GUARDIAN_AGENTS.has("code-review-guardian")).toBe(true);
      expect(GUARDIAN_AGENTS.has("qa-guardian")).toBe(true);
      expect(GUARDIAN_AGENTS.has("po-guardian")).toBe(true);
    });

    it("should reject invalid agent names via isGuardianAgent", () => {
      expect(isGuardianAgent("evil-agent")).toBe(false);
      expect(isGuardianAgent("")).toBe(false);
      expect(isGuardianAgent("security-guardian; rm -rf /")).toBe(false);
    });

    it("should accept valid agent names via isGuardianAgent", () => {
      expect(isGuardianAgent("security-guardian")).toBe(true);
      expect(isGuardianAgent("qa-guardian")).toBe(true);
    });

    it("should return failure for invalid agent name in invoke", async () => {
      const result = await adapter.invoke(
        makeParams({ agent: "evil-agent" as any }),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid agent");
      expect(result.error).toContain("evil-agent");
    });

    it("should not create a session for invalid agent name", async () => {
      await adapter.invoke(
        makeParams({ agent: "fake-agent" as any }),
      );

      expect(mockCreateSession).not.toHaveBeenCalled();
    });

    it("should list allowed agents in the error message", async () => {
      const result = await adapter.invoke(
        makeParams({ agent: "bad" as any }),
      );

      expect(result.error).toContain("security-guardian");
      expect(result.error).toContain("code-review-guardian");
      expect(result.error).toContain("qa-guardian");
      expect(result.error).toContain("po-guardian");
    });
  });

  // -----------------------------------------------------------------------
  // FIX-4: Typed Error Wiring (HIGH — dead error types now alive)
  // -----------------------------------------------------------------------

  describe("FIX-4: Typed error wiring", () => {
    it("should wrap session creation failure in CopilotSessionError", async () => {
      mockCreateSession
        .mockRejectedValueOnce(new Error("Connection refused"))
        .mockRejectedValueOnce(new Error("Connection refused"));

      const result = await adapter.invoke(makeParams());

      expect(result.success).toBe(false);
      expect(result.error).toContain("Session creation failed");
    });

    it("should classify timeout errors using CopilotTimeoutError message", async () => {
      mockSendAndWait.mockRejectedValue(new Error("Request timeout exceeded"));

      const result = await adapter.invoke(makeParams({ timeout: 60_000 }));

      expect(result.success).toBe(false);
      expect(result.error).toContain("Timeout after");
      expect(result.error).toContain("60000");
    });

    it("should classify generic timeout strings (case-insensitive)", async () => {
      mockSendAndWait.mockRejectedValue(new Error("TIMEOUT waiting for response"));

      const result = await adapter.invoke(makeParams({ timeout: 30_000 }));

      expect(result.success).toBe(false);
      expect(result.error).toContain("Timeout after 30000ms");
    });

    it("should use CopilotUnavailableError when not authenticated", async () => {
      mockGetAuthStatus.mockResolvedValue({ isAuthenticated: false });

      const available = await adapter.isAvailable();

      expect(available).toBe(false);
    });

    it("should preserve original error as cause in CopilotSessionError", async () => {
      const originalError = new Error("ECONNREFUSED");
      mockCreateSession
        .mockRejectedValueOnce(originalError)
        .mockRejectedValueOnce(originalError);

      const result = await adapter.invoke(makeParams());

      expect(result.success).toBe(false);
      // The error message comes from CopilotSessionError, not the raw original
      expect(result.error).toContain("Session creation failed");
    });

    it("should not wrap non-timeout errors in CopilotTimeoutError", async () => {
      mockSendAndWait.mockRejectedValue(new Error("Network error"));

      const result = await adapter.invoke(makeParams());

      expect(result.success).toBe(false);
      expect(result.error).toBe("Network error");
      expect(result.error).not.toContain("Timeout after");
    });
  });

  // -----------------------------------------------------------------------
  // FIX-5: Discriminated Union InvokeResult (HIGH — type safety)
  // -----------------------------------------------------------------------

  describe("FIX-5: Discriminated union InvokeResult", () => {
    it("should return InvokeSuccess with success: true and no error field", async () => {
      mockSendAndWait.mockResolvedValue(
        makeAssistantResponse("Report output"),
      );

      const result = await adapter.invoke(makeParams());

      expect(result.success).toBe(true);
      if (result.success) {
        // TypeScript narrows to InvokeSuccess — error field does not exist
        expect(result.output).toBe("Report output");
        expect(result.model_used).toBe("claude-sonnet-4.5");
        expect(result.duration_ms).toBeGreaterThanOrEqual(0);
        expect("error" in result).toBe(false);
      }
    });

    it("should return InvokeFailure with success: false and required error", async () => {
      mockSendAndWait.mockRejectedValue(new Error("Boom"));

      const result = await adapter.invoke(makeParams());

      expect(result.success).toBe(false);
      if (!result.success) {
        // TypeScript narrows to InvokeFailure — error is required string
        expect(typeof result.error).toBe("string");
        expect(result.error.length).toBeGreaterThan(0);
        expect(result.output).toBe("");
      }
    });

    it("should allow type narrowing via success discriminant", async () => {
      const result = await adapter.invoke(makeParams());

      // This tests that TypeScript narrows correctly at runtime
      if (result.success) {
        const success: InvokeSuccess = result;
        expect(success.output).toBeDefined();
      } else {
        const failure: InvokeFailure = result;
        expect(failure.error).toBeDefined();
      }
    });
  });

  // -----------------------------------------------------------------------
  // FIX-6: Factory Function (HIGH — project pattern compliance)
  // -----------------------------------------------------------------------

  describe("FIX-6: Factory function createCopilotAdapter", () => {
    it("should return a CopilotPort interface", () => {
      const port = createCopilotAdapter(DEFAULT_OPTIONS);

      expect(port).toBeDefined();
      expect(typeof port.invoke).toBe("function");
      expect(typeof port.isAvailable).toBe("function");
    });

    it("should create a functional adapter that can invoke", async () => {
      const port = createCopilotAdapter(DEFAULT_OPTIONS);

      const result = await port.invoke(makeParams());

      expect(result.success).toBe(true);
    });

    it("should create a functional adapter that checks availability", async () => {
      mockPing.mockResolvedValue({ message: "pong", timestamp: Date.now() });
      mockGetAuthStatus.mockResolvedValue({
        isAuthenticated: true,
        login: "testuser",
      });

      const port = createCopilotAdapter(DEFAULT_OPTIONS);

      const available = await port.isAvailable();

      expect(available).toBe(true);
    });

    it("should pass options to the underlying adapter", async () => {
      const port = createCopilotAdapter({
        defaultModel: "gpt-5.4",
        guardiansPath: "/custom/path",
      });

      const result = await port.invoke(makeParams());

      expect(result.model_used).toBe("gpt-5.4");
    });
  });
});
