/**
 * CLI component — public API barrel export.
 *
 * All consumers import from here, never from internals.
 * This is the component boundary.
 *
 * @module cli
 */

export { parseCliArgs, CliParseError } from "./parse-args.js";
export type { CliOptions } from "./parse-args.js";
