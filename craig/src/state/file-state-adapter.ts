/**
 * FileStateAdapter — filesystem-backed implementation of StatePort.
 *
 * Persists Craig's operational state to `.craig-state.json` with:
 * - Atomic writes (write to temp file, then rename) [CLEAN-CODE]
 * - Finding deduplication by file + issue [SPEC]
 * - Stale task cleanup on load (>30 min) [SPEC]
 * - Findings pruning on load (>90 days) [SPEC]
 * - Corrupted file recovery with backup [SPEC]
 * - Simple mutex for concurrent write protection [SPEC]
 *
 * [HEXAGONAL] This is the adapter that implements StatePort for the filesystem.
 * [SOLID/SRP] Each method has a single responsibility.
 * [CLEAN-CODE] Functions are small (<20 lines), names describe WHAT.
 *
 * @module state/file-state-adapter
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { StatePort } from "./state-port.js";
import type { CraigState, Finding, FindingFilter } from "./types.js";
import {
  createDefaultState,
  FINDINGS_MAX_AGE_DAYS,
  STALE_TASK_THRESHOLD_MINUTES,
} from "./defaults.js";

export class FileStateAdapter implements StatePort {
  private state: CraigState = createDefaultState();
  private readonly filePath: string;
  private saveLock: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  // ─── Loading ────────────────────────────────────────────────────

  /**
   * Load state from disk asynchronously.
   * Creates default state if file doesn't exist.
   * Backs up and recreates if file is corrupted.
   */
  async load(): Promise<void> {
    const fileContent = await this.readFileIfExists();

    if (fileContent === null) {
      this.state = createDefaultState();
      return;
    }

    const parsed = this.parseStateJson(fileContent);
    if (parsed === null) {
      await this.handleCorruptedFile(fileContent);
      return;
    }

    this.state = parsed;
    this.cleanupOnLoad();
  }

  /**
   * Load default state synchronously (for in-memory-only usage).
   * Does NOT read from disk — used when tests need state without I/O.
   */
  loadSync(): void {
    this.state = createDefaultState();
  }

  // ─── Saving ─────────────────────────────────────────────────────

  /**
   * Persist state to disk using atomic write (temp + rename).
   * Uses a simple mutex to serialize concurrent saves.
   * Isolates failures so subsequent saves are not poisoned. [CLEAN-CODE]
   */
  async save(): Promise<void> {
    // Queue saves to prevent concurrent file writes [SPEC: mutex]
    // .catch(() => {}) isolates prior failures so the chain never poisons
    this.saveLock = this.saveLock.catch(() => {}).then(() => this.atomicWrite());
    await this.saveLock;
  }

  // ─── Typed Accessors ────────────────────────────────────────────

  get<K extends keyof CraigState>(key: K): CraigState[K] {
    return this.state[key];
  }

  set<K extends keyof CraigState>(key: K, value: CraigState[K]): void {
    this.state = { ...this.state, [key]: value };
  }

  // ─── Findings ───────────────────────────────────────────────────

  /**
   * Add a finding with deduplication by file + issue.
   * If a duplicate exists, updates detected_at instead of adding.
   */
  addFinding(finding: Finding): void {
    const existingIndex = this.state.findings.findIndex(
      (f) => f.file === finding.file && f.issue === finding.issue,
    );

    if (existingIndex >= 0) {
      this.updateExistingFinding(existingIndex, finding.detected_at);
    } else {
      this.state = {
        ...this.state,
        findings: [...this.state.findings, finding],
      };
    }
  }

  /**
   * Query findings with optional filters.
   * All filters are combined with AND logic.
   */
  getFindings(filter?: FindingFilter): Finding[] {
    if (!filter) {
      return [...this.state.findings];
    }

    return this.state.findings.filter((finding) =>
      this.matchesFilter(finding, filter),
    );
  }

  // ─── Private: File I/O ──────────────────────────────────────────

  /**
   * Read the state file contents, returning null if it doesn't exist.
   */
  private async readFileIfExists(): Promise<string | null> {
    try {
      return await fs.readFile(this.filePath, "utf-8");
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  /**
   * Parse JSON string into CraigState, returning null on failure.
   * Merges parsed data with defaults to fill any missing fields. [CLEAN-CODE]
   */
  private parseStateJson(content: string): CraigState | null {
    try {
      if (!content.trim()) {
        return null;
      }
      const parsed: unknown = JSON.parse(content);
      if (!isValidStateShape(parsed)) {
        return null;
      }
      return mergeWithDefaults(parsed as Partial<CraigState>);
    } catch {
      return null;
    }
  }

  /**
   * Handle a corrupted state file: back up, log warning, create fresh.
   */
  private async handleCorruptedFile(content: string): Promise<void> {
    const bakPath = `${this.filePath}.bak`;
    await fs.writeFile(bakPath, content);

    console.warn(
      `[Craig] State file corrupted: ${this.filePath}. Backed up to ${bakPath}. Creating fresh state.`,
    );

    this.state = createDefaultState();
  }

  /**
   * Write state atomically: write to .tmp file, then rename.
   * Rename is atomic on POSIX systems — prevents partial writes.
   * Cleans up .tmp file on failure to avoid orphaned temp files. [CLEAN-CODE]
   */
  private async atomicWrite(): Promise<void> {
    const tmpPath = `${this.filePath}.tmp`;
    const content = JSON.stringify(this.state, null, 2) + "\n";

    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      await fs.writeFile(tmpPath, content, "utf-8");
      await fs.rename(tmpPath, this.filePath);
    } catch (error) {
      await fs.unlink(tmpPath).catch(() => {});
      throw error;
    }
  }

  // ─── Private: Cleanup on Load ──────────────────────────────────

  /**
   * Run all cleanup operations after loading state from disk.
   */
  private cleanupOnLoad(): void {
    this.pruneOldFindings();
    this.clearStaleTasks();
  }

  /**
   * Remove findings older than FINDINGS_MAX_AGE_DAYS.
   */
  private pruneOldFindings(): void {
    const cutoff = new Date(
      Date.now() - FINDINGS_MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
    );

    this.state = {
      ...this.state,
      findings: this.state.findings.filter(
        (f) => new Date(f.detected_at) >= cutoff,
      ),
    };
  }

  /**
   * Remove tasks from running_tasks that have been running > STALE_TASK_THRESHOLD_MINUTES.
   * Tasks with no last_run record are treated as stale.
   */
  private clearStaleTasks(): void {
    const cutoff = new Date(
      Date.now() - STALE_TASK_THRESHOLD_MINUTES * 60 * 1000,
    );

    this.state = {
      ...this.state,
      running_tasks: this.state.running_tasks.filter((task) => {
        const lastRun = this.state.last_runs[task];
        if (!lastRun) {
          return false; // No record → treat as stale
        }
        return new Date(lastRun) > cutoff;
      }),
    };
  }

  // ─── Private: Finding Helpers ──────────────────────────────────

  /**
   * Update an existing finding's detected_at timestamp.
   */
  private updateExistingFinding(index: number, detectedAt: string): void {
    const updated = [...this.state.findings];
    updated[index] = { ...updated[index]!, detected_at: detectedAt };
    this.state = { ...this.state, findings: updated };
  }

  /**
   * Check if a finding matches all filter criteria.
   */
  private matchesFilter(finding: Finding, filter: FindingFilter): boolean {
    if (filter.severity && finding.severity !== filter.severity) {
      return false;
    }

    if (filter.since && new Date(finding.detected_at) < new Date(filter.since)) {
      return false;
    }

    if (filter.task && finding.task !== filter.task) {
      return false;
    }

    return true;
  }
}

// ─── Type Guards ──────────────────────────────────────────────────

/** Check if an error is a Node.js system error with a code property. */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

/** Minimal shape validation for parsed state JSON. */
function isValidStateShape(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return "version" in obj && typeof obj.version === "number";
}

/**
 * Merge parsed state with defaults to fill missing fields.
 * Preserves existing values, fills gaps from createDefaultState(). [CLEAN-CODE]
 */
function mergeWithDefaults(partial: Partial<CraigState>): CraigState {
  const defaults = createDefaultState();
  return {
    ...defaults,
    ...partial,
    daily_stats: {
      ...defaults.daily_stats,
      ...(partial.daily_stats ?? {}),
      findings_by_severity: {
        ...defaults.daily_stats.findings_by_severity,
        ...(partial.daily_stats?.findings_by_severity ?? {}),
      },
    },
  };
}
