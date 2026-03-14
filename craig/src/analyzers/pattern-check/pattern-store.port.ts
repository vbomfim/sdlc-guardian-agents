/**
 * PatternStore Port — Interface for pattern persistence.
 *
 * Abstracts the storage of learned patterns. The adapter
 * (FilePatternStore) persists to `.craig-patterns.json`,
 * but consumers depend only on this port.
 *
 * [HEXAGONAL] Inward-facing port. FilePatternStore is the adapter.
 *
 * @module analyzers/pattern-check/pattern-store-port
 */

import type { PatternSet } from "./types.js";

/**
 * Port interface for pattern storage operations.
 *
 * Consumers use this to learn, load, and save repository patterns.
 * The underlying storage mechanism (file, database, API) is hidden.
 */
export interface PatternStorePort {
  /**
   * Analyze the repository and learn coding patterns.
   *
   * Invokes the Code Review Guardian to analyze the codebase
   * and extract naming, structure, error handling, and import patterns.
   *
   * @param repoPath - Path to the repository root
   * @returns Learned patterns — never throws
   */
  learn(repoPath: string): Promise<PatternSet>;

  /**
   * Load previously learned patterns from storage.
   *
   * @returns The stored PatternSet, or null if no patterns have been learned
   */
  load(): Promise<PatternSet | null>;

  /**
   * Persist a PatternSet to storage.
   *
   * Uses atomic writes (write to temp file, then rename) to prevent corruption.
   *
   * @param patterns - The PatternSet to persist
   */
  save(patterns: PatternSet): Promise<void>;
}
