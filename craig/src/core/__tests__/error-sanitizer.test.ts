/**
 * Unit tests for error sanitizer — written FIRST per TDD.
 *
 * Acceptance criteria from issue #41:
 * - AC1: Known error types map to safe, generic messages (no internals)
 * - AC2: Unknown errors return a generic "internal error" message
 * - AC3: Detailed error info is logged to stderr for debugging
 * - AC4: Safe messages never contain file paths or API details
 * - AC5: Error codes are granular (not always INTERNAL_ERROR)
 *
 * @see https://github.com/vbomfim/sdlc-guardian-agents/issues/41
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { sanitizeError } from "../error-sanitizer.js";
import type { SanitizedError } from "../error-sanitizer.js";

// Import all known error classes to test mapping
import { StateCorruptedError } from "../../state/errors.js";
import {
  ConfigNotFoundError,
  ConfigValidationError,
  ConfigParseError,
} from "../../config/config.errors.js";
import {
  GitHubRateLimitError,
  GitHubAuthError,
  GitHubNotFoundError,
  GitHubAPIError,
} from "../../github/github.errors.js";
import {
  CopilotSessionError,
  CopilotTimeoutError,
  CopilotUnavailableError,
} from "../../copilot/copilot.errors.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Patterns that must NEVER appear in safe messages. */
const FORBIDDEN_PATTERNS = [
  /\/Users\//i,
  /\/home\//i,
  /\/tmp\//i,
  /\.yaml$/i,
  /\.json$/i,
  /\.ts$/i,
  /node_modules/i,
  /Error\(/i,
  /at\s+\w+\s+\(/i, // stack trace fragments
];

function assertNoLeakedInternals(message: string): void {
  for (const pattern of FORBIDDEN_PATTERNS) {
    expect(message).not.toMatch(pattern);
  }
}

/* ------------------------------------------------------------------ */
/*  AC1: Known error types map to safe, generic messages               */
/* ------------------------------------------------------------------ */

describe("sanitizeError — known error types", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    errorSpy?.mockRestore();
  });

  it("maps StateCorruptedError to a safe state error message", () => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new StateCorruptedError(
      "/Users/vbomfim/.craig/state.json",
      new SyntaxError("Unexpected token"),
    );

    const result = sanitizeError(error);

    expect(result.message).toBe(
      "State storage error. Craig will attempt recovery.",
    );
    expect(result.code).toBe("STATE_ERROR");
    assertNoLeakedInternals(result.message);
  });

  it("maps ConfigNotFoundError to a safe config message", () => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new ConfigNotFoundError("/Users/vbomfim/.craig/craig.yaml");

    const result = sanitizeError(error);

    expect(result.message).toBe(
      "Configuration not found. Run craig_config to set up.",
    );
    expect(result.code).toBe("CONFIG_ERROR");
    assertNoLeakedInternals(result.message);
  });

  it("maps ConfigValidationError to a safe config message", () => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new ConfigValidationError(
      "Invalid schema: missing field 'repo'",
      ["repo is required"],
    );

    const result = sanitizeError(error);

    expect(result.message).toBe(
      "Configuration is invalid. Check your craig.yaml.",
    );
    expect(result.code).toBe("CONFIG_ERROR");
  });

  it("maps ConfigParseError to a safe config message", () => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new ConfigParseError(
      "YAML parse error at line 12: unexpected indent",
    );

    const result = sanitizeError(error);

    expect(result.message).toBe("Configuration file could not be parsed.");
    expect(result.code).toBe("CONFIG_ERROR");
  });

  it("maps GitHubRateLimitError to a safe rate limit message", () => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new GitHubRateLimitError(new Date("2025-07-15T10:00:00Z"));

    const result = sanitizeError(error);

    expect(result.message).toBe(
      "GitHub API rate limit exceeded. Try again later.",
    );
    expect(result.code).toBe("RATE_LIMIT");
  });

  it("maps GitHubAuthError to a safe auth message", () => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new GitHubAuthError(
      "Bad credentials: token ghp_abc123... is revoked",
    );

    const result = sanitizeError(error);

    expect(result.message).toBe(
      "GitHub authentication failed. Check your token.",
    );
    expect(result.code).toBe("AUTH_ERROR");
    assertNoLeakedInternals(result.message);
  });

  it("maps GitHubNotFoundError to a safe not-found message", () => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new GitHubNotFoundError("repos/vbomfim/private-project");

    const result = sanitizeError(error);

    expect(result.message).toBe(
      "Requested GitHub resource was not found.",
    );
    expect(result.code).toBe("NOT_FOUND");
    assertNoLeakedInternals(result.message);
  });

  it("maps GitHubAPIError to a safe API error message", () => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new GitHubAPIError(
      500,
      "Internal Server Error: database connection timeout on shard-3",
    );

    const result = sanitizeError(error);

    expect(result.message).toBe("GitHub API request failed.");
    expect(result.code).toBe("GITHUB_ERROR");
    assertNoLeakedInternals(result.message);
  });

  it("maps CopilotSessionError to a safe copilot message", () => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new CopilotSessionError(
      "Session ID abc-123 expired at /tmp/copilot/sessions/abc-123.json",
    );

    const result = sanitizeError(error);

    expect(result.message).toBe(
      "Copilot session failed. Retry the operation.",
    );
    expect(result.code).toBe("COPILOT_ERROR");
    assertNoLeakedInternals(result.message);
  });

  it("maps CopilotTimeoutError to a safe timeout message", () => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new CopilotTimeoutError(30000);

    const result = sanitizeError(error);

    expect(result.message).toBe("Copilot operation timed out. Try again.");
    expect(result.code).toBe("TIMEOUT");
  });

  it("maps CopilotUnavailableError to a safe unavailable message", () => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new CopilotUnavailableError(
      "Binary not found at /usr/local/bin/copilot-cli",
    );

    const result = sanitizeError(error);

    expect(result.message).toBe(
      "Copilot is not available. Check your installation.",
    );
    expect(result.code).toBe("COPILOT_ERROR");
    assertNoLeakedInternals(result.message);
  });
});

/* ------------------------------------------------------------------ */
/*  AC2: Unknown errors return a generic message                       */
/* ------------------------------------------------------------------ */

describe("sanitizeError — unknown error types", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    errorSpy?.mockRestore();
  });

  it("returns generic message for a plain Error", () => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error(
      "ENOENT: no such file or directory, open '/Users/vbomfim/.craig/secrets.json'",
    );

    const result = sanitizeError(error);

    expect(result.message).toBe("An internal error occurred.");
    expect(result.code).toBe("INTERNAL_ERROR");
    assertNoLeakedInternals(result.message);
  });

  it("returns generic message for a non-Error thrown value", () => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = sanitizeError("some string error with path /etc/passwd");

    expect(result.message).toBe("An internal error occurred.");
    expect(result.code).toBe("INTERNAL_ERROR");
  });

  it("returns generic message for null/undefined thrown values", () => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(sanitizeError(null).message).toBe("An internal error occurred.");
    expect(sanitizeError(undefined).message).toBe(
      "An internal error occurred.",
    );
  });
});

/* ------------------------------------------------------------------ */
/*  AC3: Detailed error info is logged to stderr                       */
/* ------------------------------------------------------------------ */

describe("sanitizeError — stderr logging", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    errorSpy?.mockRestore();
  });

  it("logs full error message to stderr for known errors", () => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new ConfigNotFoundError("/Users/vbomfim/.craig/craig.yaml");

    sanitizeError(error);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Craig] ConfigNotFoundError"),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("/Users/vbomfim/.craig/craig.yaml"),
    );
  });

  it("logs full error message to stderr for unknown errors", () => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("Unexpected failure in module X");

    sanitizeError(error);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Craig] Error"),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Unexpected failure in module X"),
    );
  });

  it("logs stringified value for non-Error thrown values", () => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    sanitizeError(42);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Craig] Non-error thrown: 42"),
    );
  });
});

/* ------------------------------------------------------------------ */
/*  AC4: Safe messages never contain file paths or API details         */
/* ------------------------------------------------------------------ */

describe("sanitizeError — no information leakage", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    errorSpy?.mockRestore();
  });

  it("never leaks file paths from StateCorruptedError", () => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new StateCorruptedError(
      "/home/ci/app/.craig/state.json",
      new Error("parse failed"),
    );

    const result = sanitizeError(error);

    expect(result.message).not.toContain("/home");
    expect(result.message).not.toContain(".json");
    expect(result.message).not.toContain("parse failed");
  });

  it("never leaks GitHub token fragments from GitHubAuthError", () => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new GitHubAuthError(
      "Bad credentials for token ghp_A1B2C3D4E5F6",
    );

    const result = sanitizeError(error);

    expect(result.message).not.toContain("ghp_");
    expect(result.message).not.toContain("Bad credentials");
    expect(result.message).not.toContain("A1B2C3");
  });

  it("never leaks server internals from GitHubAPIError", () => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new GitHubAPIError(
      503,
      "Service unavailable: upstream proxy shard-12.internal.github.com timed out",
    );

    const result = sanitizeError(error);

    expect(result.message).not.toContain("shard");
    expect(result.message).not.toContain("internal.github.com");
    expect(result.message).not.toContain("503");
  });
});

/* ------------------------------------------------------------------ */
/*  AC5: Return type is well-typed                                     */
/* ------------------------------------------------------------------ */

describe("sanitizeError — return type", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    errorSpy?.mockRestore();
  });

  it("returns a SanitizedError with message and code fields", () => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result: SanitizedError = sanitizeError(new Error("test"));

    expect(result).toHaveProperty("message");
    expect(result).toHaveProperty("code");
    expect(typeof result.message).toBe("string");
    expect(typeof result.code).toBe("string");
  });
});
