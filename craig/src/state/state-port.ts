/**
 * StatePort — the public interface (port) for Craig's state component.
 *
 * All access to `.craig-state.json` MUST go through this interface.
 * No other component should read or write the state file directly.
 *
 * @module state/state-port
 */

import type { CraigState, Finding, FindingFilter } from "./types.js";

/**
 * Port for Craig's persistent state management.
 *
 * Provides typed get/set access to the state and specialized
 * methods for findings management. The port does NOT interpret
 * the state — consumers decide what to store and read.
 *
 * [HEXAGONAL] This is the inward-facing port. The adapter
 * (FileStateAdapter) implements the filesystem persistence.
 */
export interface StatePort {
  /**
   * Load state from persistent storage.
   * If no state file exists, creates a default empty state.
   * If the file is corrupted, backs it up and creates a fresh state.
   */
  load(): Promise<void>;

  /**
   * Persist the current in-memory state to storage.
   * Uses atomic writes (write to temp, then rename) to prevent corruption.
   */
  save(): Promise<void>;

  /**
   * Get a specific field from the current state.
   * @param key - The state field to retrieve
   * @returns The value of the requested field
   */
  get<K extends keyof CraigState>(key: K): CraigState[K];

  /**
   * Set a specific field in the current state (in-memory only).
   * Call `save()` to persist changes.
   * @param key - The state field to update
   * @param value - The new value
   */
  set<K extends keyof CraigState>(key: K, value: CraigState[K]): void;

  /**
   * Add a finding to the state.
   * Deduplicates by `file` + `issue` — if a match exists,
   * updates the existing finding's `detected_at` timestamp.
   * @param finding - The finding to add
   */
  addFinding(finding: Finding): void;

  /**
   * Query findings with optional filters.
   * @param filter - Optional filter criteria (severity, since, task)
   * @returns Array of matching findings
   */
  getFindings(filter?: FindingFilter): Finding[];
}
