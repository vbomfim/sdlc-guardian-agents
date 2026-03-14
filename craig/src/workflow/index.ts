/**
 * Workflow component — public API barrel export.
 *
 * Re-exports the WorkflowOrchestrator factory, port, and types.
 * External consumers import from here, not from internal modules.
 *
 * @module workflow
 * @see https://github.com/vbomfim/sdlc-guardian-agents/issues/59
 */

export { createWorkflowOrchestrator } from "./workflow-orchestrator.js";
export type {
  WorkflowOrchestratorDeps,
  WorkflowOrchestratorPort,
} from "./workflow.port.js";
export type {
  ReviewResult,
  WorkflowIteration,
  WorkflowResult,
  WorkflowVerdict,
} from "./workflow.types.js";
export {
  MAX_PASSES,
  WORKFLOW_QUALIFYING_SEVERITIES,
  REVIEW_AGENTS,
} from "./workflow.types.js";
