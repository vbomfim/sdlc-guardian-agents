/**
 * CopilotPort — Public interface for the Copilot component.
 *
 * All consumers depend on this port, never on the implementation.
 * This boundary ensures the copilot adapter (SDK-based) is rewritable
 * without changing any downstream component.
 *
 * Could be reimplemented with:
 * - Copilot CLI `-p` flag (subprocess invocation)
 * - Mock adapter for testing
 * - Alternative LLM SDK
 *
 * @module copilot
 */

import type { InvokeParams, InvokeResult } from "./copilot.types.js";

/**
 * Port (interface) for Copilot SDK interaction.
 *
 * Consumers depend on this contract. The adapter behind it
 * can be swapped (SDK, CLI, mock) without changing consumer code.
 *
 * [HEXAGONAL] Inward-facing port. Adapters implement this.
 */
export interface CopilotPort {
  /**
   * Invoke a Guardian agent and capture its output.
   *
   * Creates a session, sends the prompt, waits for the response,
   * and cleans up the session. Each invocation is independent.
   *
   * @param params - Invocation parameters (agent, prompt, context, model, timeout)
   * @returns The invocation result with raw markdown output
   */
  invoke(params: InvokeParams): Promise<InvokeResult>;

  /**
   * Check whether the Copilot SDK / CLI is available and authenticated.
   *
   * @returns true if Copilot is ready for invocations, false otherwise
   */
  isAvailable(): Promise<boolean>;
}
