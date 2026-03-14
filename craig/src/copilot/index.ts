/**
 * Copilot component — public API barrel export.
 *
 * All consumers import from here, never from internals.
 * This is the component boundary.
 *
 * @module copilot
 */

export {
  CopilotAdapter,
  createCopilotAdapter,
  createScopedPermissionHandler,
  sanitizeInput,
} from "./copilot.adapter.js";
export type { CopilotAdapterOptions } from "./copilot.adapter.js";
export type { CopilotPort } from "./copilot.port.js";
export type {
  InvokeParams,
  InvokeResult,
  InvokeSuccess,
  InvokeFailure,
  GuardianAgent,
} from "./copilot.types.js";
export { GUARDIAN_AGENTS, isGuardianAgent } from "./copilot.types.js";
export {
  CopilotSessionError,
  CopilotTimeoutError,
  CopilotUnavailableError,
} from "./copilot.errors.js";
