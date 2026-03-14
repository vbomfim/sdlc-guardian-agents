/**
 * CLI argument parser for Craig.
 *
 * Parses process.argv-style arrays to extract --daemon and --port flags.
 * Pure function — no side effects, no I/O, fully testable.
 *
 * [CLEAN-CODE] Single responsibility: only parses CLI args.
 * [YAGNI] Only supports the flags we need — no framework dependency.
 *
 * @module cli/parse-args
 */

/** Parsed CLI options. */
export interface CliOptions {
  /** Whether to run in daemon mode (SSE transport). */
  readonly daemon: boolean;
  /** Port number for the daemon HTTP server. */
  readonly port: number;
}

/** Default port for daemon mode. */
const DEFAULT_PORT = 3001;

/** Minimum valid TCP port. */
const MIN_PORT = 1;

/** Maximum valid TCP port. */
const MAX_PORT = 65535;

/**
 * Error thrown when CLI arguments are invalid.
 */
export class CliParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliParseError";
  }
}

/**
 * Parse CLI arguments into typed options.
 *
 * Supports:
 *   --daemon           Enable daemon mode (SSE transport)
 *   --port <number>    HTTP server port (default: 3001)
 *   --port=<number>    Alternate syntax with equals sign
 *
 * @param argv - Arguments array (typically process.argv.slice(2))
 * @returns Parsed CLI options
 * @throws {CliParseError} If port is invalid (non-numeric, out of range)
 */
export function parseCliArgs(argv: readonly string[]): CliOptions {
  let daemon = false;
  let port = DEFAULT_PORT;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--daemon") {
      daemon = true;
      continue;
    }

    if (arg === "--port") {
      const nextArg = argv[i + 1];
      if (nextArg === undefined || nextArg.startsWith("--")) {
        throw new CliParseError(
          "Invalid port: --port requires a numeric value",
        );
      }
      port = validatePort(nextArg);
      i++; // Skip the value argument
      continue;
    }

    if (arg?.startsWith("--port=")) {
      const value = arg.slice("--port=".length);
      port = validatePort(value);
      continue;
    }

    // Unknown flags are silently ignored for forward compatibility
  }

  return { daemon, port };
}

/**
 * Validate and parse a port string into a number.
 *
 * @param value - String representation of the port
 * @returns Valid port number
 * @throws {CliParseError} If the value is not a valid port (1–65535)
 */
function validatePort(value: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < MIN_PORT || parsed > MAX_PORT) {
    throw new CliParseError(
      `Invalid port "${value}": must be an integer between ${MIN_PORT} and ${MAX_PORT}`,
    );
  }

  return parsed;
}
