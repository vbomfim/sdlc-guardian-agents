/**
 * Shared mock factories for core component tests.
 *
 * Centralizes mock creation for StatePort, ConfigPort, and CopilotPort
 * to eliminate duplication across test files.
 *
 * @module core/__tests__/mock-factories
 */

import { vi } from "vitest";
import type { StatePort } from "../../state/index.js";
import type { ConfigPort } from "../../config/index.js";
import type { CopilotPort } from "../../copilot/index.js";

/**
 * Create a mock StatePort with sensible defaults.
 * All methods are vi.fn() mocks that can be overridden in individual tests.
 */
export function createMockState(): StatePort {
  return {
    load: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockReturnValue([]),
    set: vi.fn(),
    addFinding: vi.fn(),
    getFindings: vi.fn().mockReturnValue([]),
  };
}

/** Default CraigConfig shape used across all core tests. */
const DEFAULT_CONFIG = {
  repo: "owner/repo",
  branch: "main",
  capabilities: {
    merge_review: true,
    coverage_gaps: true,
    bug_detection: true,
    pattern_enforcement: true,
    po_audit: true,
    auto_fix: true,
    dependency_updates: true,
  },
  models: { default: "claude-sonnet-4.5" },
  autonomy: {
    create_issues: true,
    create_draft_prs: true,
    auto_merge: false as const,
  },
  guardians: { path: "~/.copilot/" },
};

/**
 * Create a mock ConfigPort with sensible defaults.
 *
 * @param scheduleOverride - Optional schedule object to use instead of default.
 *   Defaults to `{ coverage_scan: "0 8 * * *" }` for get() and `{}` for load().
 */
export function createMockConfig(
  scheduleOverride?: Record<string, string>,
): ConfigPort {
  const schedule = scheduleOverride ?? { coverage_scan: "0 8 * * *" };
  return {
    load: vi.fn().mockResolvedValue({
      ...DEFAULT_CONFIG,
      schedule: {},
    }),
    get: vi.fn().mockReturnValue({
      ...DEFAULT_CONFIG,
      schedule,
    }),
    update: vi.fn(),
    validate: vi.fn(),
  };
}

/**
 * Create a mock CopilotPort with sensible defaults.
 */
export function createMockCopilot(): CopilotPort {
  return {
    invoke: vi.fn().mockResolvedValue({
      success: true,
      output: "Review complete",
      duration_ms: 1500,
      model_used: "claude-sonnet-4.5",
    }),
    isAvailable: vi.fn().mockResolvedValue(true),
  };
}
