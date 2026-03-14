/**
 * Coverage Scan Analyzer — type definitions.
 *
 * Types specific to the coverage-scan analyzer component.
 *
 * @module analyzers/coverage-scan
 */

import type { CopilotPort } from "../../copilot/index.js";
import type { GitHubPort } from "../../github/index.js";
import type { ResultParserPort } from "../../result-parser/index.js";
import type { StatePort } from "../../state/index.js";

/**
 * Dependencies required by the CoverageScanAnalyzer.
 *
 * [HEXAGONAL] All dependencies are ports (interfaces), never
 * concrete implementations. Enables testing with mocks and
 * swapping adapters.
 */
export interface CoverageScanDeps {
  readonly copilot: CopilotPort;
  readonly github: GitHubPort;
  readonly parser: ResultParserPort;
  readonly state: StatePort;
}
