/**
 * WorkflowOrchestratorPort — Public interface for the Workflow component.
 *
 * The workflow orchestrator chains the full SDLC pipeline:
 * Finding → Developer fix → QA + Security + Code Review → Draft PR
 *
 * It implements AnalyzerPort so it can be registered in the AnalyzerRegistry
 * and triggered via `craig_run_task({ task: "autonomous_workflow" })`.
 *
 * [HEXAGONAL] Inward-facing port — consumers depend on this, not the impl.
 * [SOLID/LSP] Interchangeable with any AnalyzerPort through the registry.
 *
 * @module workflow
 * @see https://github.com/vbomfim/sdlc-guardian-agents/issues/59
 */

import type { AnalyzerPort } from "../analyzers/analyzer.port.js";
import type { CopilotPort } from "../copilot/index.js";
import type { GitPort } from "../git-port/index.js";
import type { StatePort } from "../state/index.js";
import type { ConfigPort } from "../config/index.js";
import type { GitOpsPort } from "../analyzers/auto-fix/auto-fix.ports.js";
import type { ResultParserPort } from "../result-parser/types.js";

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

/**
 * Dependencies required by the Workflow Orchestrator.
 *
 * [SOLID/DIP] All dependencies are ports (interfaces), not implementations.
 */
export interface WorkflowOrchestratorDeps {
  /** Copilot SDK for invoking Guardian agents. */
  readonly copilot: CopilotPort;

  /** Git platform operations (create PRs, issues). */
  readonly git: GitPort;

  /** Application state (findings, running tasks). */
  readonly state: StatePort;

  /** Craig configuration (capabilities, models, autonomy). */
  readonly config: ConfigPort;

  /** Local git operations (branch, commit, push). */
  readonly gitOps: GitOpsPort;

  /** Guardian report parser (markdown → structured data). */
  readonly resultParser: ResultParserPort;
}

// ---------------------------------------------------------------------------
// Port re-export
// ---------------------------------------------------------------------------

/**
 * The WorkflowOrchestrator IS an AnalyzerPort.
 *
 * This type alias exists for documentation clarity — the orchestrator
 * implements the standard analyzer interface and is registered in the
 * AnalyzerRegistry under the name "autonomous_workflow".
 *
 * [SOLID/LSP] — same interface, different behavior.
 */
export type WorkflowOrchestratorPort = AnalyzerPort;
