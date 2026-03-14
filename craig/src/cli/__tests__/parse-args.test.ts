/**
 * Unit tests for CLI argument parsing.
 *
 * Verifies that parseCliArgs() correctly extracts --daemon and --port
 * flags from process.argv-style arrays.
 *
 * @see https://github.com/vbomfim/sdlc-guardian-agents/issues/36 — AC1
 */

import { describe, it, expect } from "vitest";
import { parseCliArgs, CliParseError } from "../parse-args.js";

/* ------------------------------------------------------------------ */
/*  AC1: --daemon --port flag parsing                                  */
/* ------------------------------------------------------------------ */

describe("parseCliArgs", () => {
  it("returns daemon=false with defaults when no args given", () => {
    const result = parseCliArgs([]);

    expect(result).toEqual({
      daemon: false,
      port: 3001,
    });
  });

  it("parses --daemon --port 3001", () => {
    const result = parseCliArgs(["--daemon", "--port", "3001"]);

    expect(result).toEqual({
      daemon: true,
      port: 3001,
    });
  });

  it("parses --daemon --port 8080 with custom port", () => {
    const result = parseCliArgs(["--daemon", "--port", "8080"]);

    expect(result).toEqual({
      daemon: true,
      port: 8080,
    });
  });

  it("parses --daemon without --port using default port 3001", () => {
    const result = parseCliArgs(["--daemon"]);

    expect(result).toEqual({
      daemon: true,
      port: 3001,
    });
  });

  it("parses --port without --daemon", () => {
    const result = parseCliArgs(["--port", "4000"]);

    expect(result).toEqual({
      daemon: false,
      port: 4000,
    });
  });

  it("handles --port=VALUE format (equals sign)", () => {
    const result = parseCliArgs(["--daemon", "--port=9090"]);

    expect(result).toEqual({
      daemon: true,
      port: 9090,
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Error cases                                                      */
  /* ---------------------------------------------------------------- */

  it("throws CliParseError for non-numeric port", () => {
    expect(() => parseCliArgs(["--port", "abc"])).toThrow(CliParseError);
    expect(() => parseCliArgs(["--port", "abc"])).toThrow(
      /Invalid port/,
    );
  });

  it("throws CliParseError for port below 1", () => {
    expect(() => parseCliArgs(["--port", "0"])).toThrow(CliParseError);
    expect(() => parseCliArgs(["--port", "-1"])).toThrow(CliParseError);
  });

  it("throws CliParseError for port above 65535", () => {
    expect(() => parseCliArgs(["--port", "70000"])).toThrow(CliParseError);
  });

  it("throws CliParseError when --port is last arg with no value", () => {
    expect(() => parseCliArgs(["--port"])).toThrow(CliParseError);
  });

  it("ignores unknown flags without crashing", () => {
    const result = parseCliArgs(["--daemon", "--verbose", "--port", "3001"]);

    expect(result).toEqual({
      daemon: true,
      port: 3001,
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Edge cases                                                       */
  /* ---------------------------------------------------------------- */

  it("handles flags in any order", () => {
    const result = parseCliArgs(["--port", "5000", "--daemon"]);

    expect(result).toEqual({
      daemon: true,
      port: 5000,
    });
  });

  it("uses the last --port value when specified multiple times", () => {
    const result = parseCliArgs(["--port", "3000", "--port", "4000"]);

    expect(result.port).toBe(4000);
  });
});
