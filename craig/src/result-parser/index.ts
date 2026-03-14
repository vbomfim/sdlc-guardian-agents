/**
 * Result Parser — Public API
 *
 * Barrel export for the result-parser component.
 * Consumers import from here, not from internal modules.
 *
 * @module result-parser
 */

export { createResultParser } from "./result-parser.js";
export type {
  ResultParserPort,
  ParsedReport,
  ParsedFinding,
  CoverageGap,
  GuardianType,
  Severity,
} from "./types.js";
