/**
 * Unit tests for FileStateAdapter — Craig's state persistence.
 *
 * Tests cover all 6 acceptance criteria from issue #2:
 *   AC1: Load existing state
 *   AC2: Initialize fresh state
 *   AC3: Persist on save (atomic writes)
 *   AC4: Add finding with deduplication
 *   AC5: Filter findings
 *   AC6: Handle corrupted state
 *
 * Plus edge cases:
 *   - Stale running_tasks cleanup (>30 min)
 *   - Findings pruning (>90 days)
 *   - Concurrent write protection (mutex)
 *   - Schema version field
 *
 * @module tests/state
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { FileStateAdapter } from "../../src/state/file-state-adapter.js";
import { createDefaultState } from "../../src/state/defaults.js";
import type { CraigState, Finding } from "../../src/state/types.js";

/** Helper: create a temp directory for test isolation. */
async function createTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "craig-state-test-"));
}

/** Helper: build a Finding with sensible defaults. */
function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: overrides.id ?? "finding-1",
    severity: overrides.severity ?? "medium",
    category: overrides.category ?? "security",
    file: overrides.file ?? "src/app.ts",
    issue: overrides.issue ?? "SQL injection risk",
    source: overrides.source ?? "security-guardian",
    detected_at: overrides.detected_at ?? new Date().toISOString(),
    task: overrides.task ?? "security_scan",
    ...(overrides.github_issue_url
      ? { github_issue_url: overrides.github_issue_url }
      : {}),
  };
}

describe("FileStateAdapter", () => {
  let tempDir: string;
  let stateFilePath: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    stateFilePath = path.join(tempDir, ".craig-state.json");
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // ─── AC1: Load existing state ───────────────────────────────────

  describe("AC1: Load existing state", () => {
    it("should load state from an existing valid JSON file", async () => {
      const existingState: CraigState = {
        ...createDefaultState(),
        last_processed_sha: "abc123def456",
        last_runs: { security_scan: "2025-01-15T10:00:00Z" },
      };
      await fs.writeFile(stateFilePath, JSON.stringify(existingState, null, 2));

      const adapter = new FileStateAdapter(stateFilePath);
      await adapter.load();

      expect(adapter.get("last_processed_sha")).toBe("abc123def456");
      expect(adapter.get("last_runs")).toEqual({
        security_scan: "2025-01-15T10:00:00Z",
      });
    });

    it("should preserve all fields when loading", async () => {
      const finding = makeFinding({ id: "f-1", severity: "critical" });
      const existingState: CraigState = {
        version: 1,
        last_processed_sha: "sha-789",
        last_runs: { merge_review: "2025-03-01T08:00:00Z" },
        running_tasks: [],
        findings: [finding],
        daily_stats: {
          merges_reviewed: 5,
          issues_created: 2,
          prs_opened: 1,
          findings_by_severity: {
            critical: 1,
            high: 0,
            medium: 0,
            low: 0,
            info: 0,
          },
        },
      };
      await fs.writeFile(stateFilePath, JSON.stringify(existingState, null, 2));

      const adapter = new FileStateAdapter(stateFilePath);
      await adapter.load();

      expect(adapter.get("version")).toBe(1);
      expect(adapter.get("findings")).toHaveLength(1);
      expect(adapter.get("findings")[0].severity).toBe("critical");
      expect(adapter.get("daily_stats").merges_reviewed).toBe(5);
    });
  });

  // ─── AC2: Initialize fresh state ────────────────────────────────

  describe("AC2: Initialize fresh state", () => {
    it("should create a default empty state when no file exists", async () => {
      const adapter = new FileStateAdapter(stateFilePath);
      await adapter.load();

      expect(adapter.get("last_processed_sha")).toBeNull();
      expect(adapter.get("findings")).toEqual([]);
      expect(adapter.get("running_tasks")).toEqual([]);
      expect(adapter.get("last_runs")).toEqual({});
      expect(adapter.get("daily_stats").merges_reviewed).toBe(0);
      expect(adapter.get("daily_stats").issues_created).toBe(0);
      expect(adapter.get("daily_stats").prs_opened).toBe(0);
    });

    it("should include a version field in the default state", async () => {
      const adapter = new FileStateAdapter(stateFilePath);
      await adapter.load();

      expect(adapter.get("version")).toBe(1);
    });

    it("should have zeroed findings_by_severity in default state", async () => {
      const adapter = new FileStateAdapter(stateFilePath);
      await adapter.load();

      const stats = adapter.get("daily_stats");
      expect(stats.findings_by_severity).toEqual({
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        info: 0,
      });
    });
  });

  // ─── AC3: Persist on save (atomic writes) ───────────────────────

  describe("AC3: Persist on save", () => {
    it("should write state to disk on save", async () => {
      const adapter = new FileStateAdapter(stateFilePath);
      await adapter.load();

      adapter.set("last_processed_sha", "new-sha-999");
      await adapter.save();

      const raw = await fs.readFile(stateFilePath, "utf-8");
      const saved = JSON.parse(raw) as CraigState;
      expect(saved.last_processed_sha).toBe("new-sha-999");
    });

    it("should write valid JSON with indentation", async () => {
      const adapter = new FileStateAdapter(stateFilePath);
      await adapter.load();
      await adapter.save();

      const raw = await fs.readFile(stateFilePath, "utf-8");
      // Should be pretty-printed (contains newlines)
      expect(raw).toContain("\n");
      // Should be valid JSON
      expect(() => JSON.parse(raw)).not.toThrow();
    });

    it("should use atomic writes (temp file + rename)", async () => {
      const adapter = new FileStateAdapter(stateFilePath);
      await adapter.load();
      adapter.set("last_processed_sha", "atomic-test");
      await adapter.save();

      // The temp file should not remain after save
      const files = await fs.readdir(tempDir);
      const tmpFiles = files.filter((f) => f.endsWith(".tmp"));
      expect(tmpFiles).toHaveLength(0);

      // The state file should exist with correct content
      const raw = await fs.readFile(stateFilePath, "utf-8");
      const saved = JSON.parse(raw) as CraigState;
      expect(saved.last_processed_sha).toBe("atomic-test");
    });

    it("should round-trip state through save and load", async () => {
      const adapter1 = new FileStateAdapter(stateFilePath);
      await adapter1.load();
      adapter1.set("last_processed_sha", "roundtrip-sha");
      adapter1.addFinding(makeFinding({ id: "rt-1", issue: "test issue" }));
      await adapter1.save();

      const adapter2 = new FileStateAdapter(stateFilePath);
      await adapter2.load();
      expect(adapter2.get("last_processed_sha")).toBe("roundtrip-sha");
      expect(adapter2.get("findings")).toHaveLength(1);
      expect(adapter2.get("findings")[0].issue).toBe("test issue");
    });
  });

  // ─── AC4: Add finding with deduplication ────────────────────────

  describe("AC4: Add finding with deduplication", () => {
    it("should add a new finding to the list", () => {
      const adapter = new FileStateAdapter(stateFilePath);
      // Use sync defaults — no need to load from disk for in-memory ops
      adapter.loadSync();

      const finding = makeFinding({ id: "f-new" });
      adapter.addFinding(finding);

      expect(adapter.get("findings")).toHaveLength(1);
      expect(adapter.get("findings")[0].id).toBe("f-new");
    });

    it("should deduplicate by file + issue, updating detected_at", () => {
      const adapter = new FileStateAdapter(stateFilePath);
      adapter.loadSync();

      const original = makeFinding({
        id: "f-orig",
        file: "src/auth.ts",
        issue: "Missing input validation",
        detected_at: "2025-01-01T00:00:00Z",
      });
      adapter.addFinding(original);

      const duplicate = makeFinding({
        id: "f-dup",
        file: "src/auth.ts",
        issue: "Missing input validation",
        detected_at: "2025-03-15T12:00:00Z",
      });
      adapter.addFinding(duplicate);

      const findings = adapter.get("findings");
      expect(findings).toHaveLength(1);
      // Should keep original ID but update detected_at
      expect(findings[0].id).toBe("f-orig");
      expect(findings[0].detected_at).toBe("2025-03-15T12:00:00Z");
    });

    it("should NOT deduplicate findings with different files", () => {
      const adapter = new FileStateAdapter(stateFilePath);
      adapter.loadSync();

      adapter.addFinding(
        makeFinding({ id: "f-1", file: "src/a.ts", issue: "Same issue" }),
      );
      adapter.addFinding(
        makeFinding({ id: "f-2", file: "src/b.ts", issue: "Same issue" }),
      );

      expect(adapter.get("findings")).toHaveLength(2);
    });

    it("should NOT deduplicate findings with different issues", () => {
      const adapter = new FileStateAdapter(stateFilePath);
      adapter.loadSync();

      adapter.addFinding(
        makeFinding({ id: "f-1", file: "src/a.ts", issue: "Issue A" }),
      );
      adapter.addFinding(
        makeFinding({ id: "f-2", file: "src/a.ts", issue: "Issue B" }),
      );

      expect(adapter.get("findings")).toHaveLength(2);
    });

    it("should deduplicate findings with no file (both undefined)", () => {
      const adapter = new FileStateAdapter(stateFilePath);
      adapter.loadSync();

      adapter.addFinding(
        makeFinding({
          id: "f-1",
          file: undefined,
          issue: "Global config issue",
          detected_at: "2025-01-01T00:00:00Z",
        }),
      );
      adapter.addFinding(
        makeFinding({
          id: "f-2",
          file: undefined,
          issue: "Global config issue",
          detected_at: "2025-02-01T00:00:00Z",
        }),
      );

      expect(adapter.get("findings")).toHaveLength(1);
      expect(adapter.get("findings")[0].detected_at).toBe(
        "2025-02-01T00:00:00Z",
      );
    });
  });

  // ─── AC5: Filter findings ──────────────────────────────────────

  describe("AC5: Filter findings", () => {
    let adapter: FileStateAdapter;

    beforeEach(() => {
      adapter = new FileStateAdapter(stateFilePath);
      adapter.loadSync();

      // Seed 6 findings across severities and dates
      adapter.addFinding(
        makeFinding({
          id: "f-1",
          severity: "critical",
          task: "security_scan",
          detected_at: "2025-01-15T00:00:00Z",
        }),
      );
      adapter.addFinding(
        makeFinding({
          id: "f-2",
          severity: "critical",
          task: "merge_review",
          detected_at: "2025-03-01T00:00:00Z",
          file: "src/b.ts",
        }),
      );
      adapter.addFinding(
        makeFinding({
          id: "f-3",
          severity: "high",
          task: "security_scan",
          detected_at: "2025-02-10T00:00:00Z",
          file: "src/c.ts",
        }),
      );
      adapter.addFinding(
        makeFinding({
          id: "f-4",
          severity: "medium",
          task: "coverage_scan",
          detected_at: "2025-03-10T00:00:00Z",
          file: "src/d.ts",
        }),
      );
      adapter.addFinding(
        makeFinding({
          id: "f-5",
          severity: "low",
          task: "tech_debt_audit",
          detected_at: "2024-10-01T00:00:00Z",
          file: "src/e.ts",
        }),
      );
      adapter.addFinding(
        makeFinding({
          id: "f-6",
          severity: "info",
          task: "pattern_check",
          detected_at: "2025-03-14T00:00:00Z",
          file: "src/f.ts",
        }),
      );
    });

    it("should return all findings when no filter is provided", () => {
      expect(adapter.getFindings()).toHaveLength(6);
    });

    it("should filter by severity", () => {
      const critical = adapter.getFindings({ severity: "critical" });
      expect(critical).toHaveLength(2);
      critical.forEach((f) => expect(f.severity).toBe("critical"));
    });

    it("should filter by since date", () => {
      const recent = adapter.getFindings({ since: "2025-03-01" });
      // f-2 (March 1), f-4 (March 10), f-6 (March 14) = 3
      expect(recent).toHaveLength(3);
    });

    it("should filter by task", () => {
      const securityFindings = adapter.getFindings({ task: "security_scan" });
      expect(securityFindings).toHaveLength(2);
      securityFindings.forEach((f) => expect(f.task).toBe("security_scan"));
    });

    it("should combine multiple filters (severity + since)", () => {
      const criticalRecent = adapter.getFindings({
        severity: "critical",
        since: "2025-02-01",
      });
      // Only f-2 (critical, March 1)
      expect(criticalRecent).toHaveLength(1);
      expect(criticalRecent[0].id).toBe("f-2");
    });

    it("should combine all filters (severity + since + task)", () => {
      const result = adapter.getFindings({
        severity: "critical",
        since: "2025-02-01",
        task: "merge_review",
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("f-2");
    });

    it("should return empty array when no findings match", () => {
      const result = adapter.getFindings({
        severity: "critical",
        since: "2025-12-01",
      });
      expect(result).toHaveLength(0);
    });
  });

  // ─── AC6: Handle corrupted state ───────────────────────────────

  describe("AC6: Handle corrupted state", () => {
    it("should create fresh state when file contains invalid JSON", async () => {
      await fs.writeFile(stateFilePath, "not valid json {{{");

      const adapter = new FileStateAdapter(stateFilePath);
      await adapter.load();

      // Should have default state
      expect(adapter.get("last_processed_sha")).toBeNull();
      expect(adapter.get("findings")).toEqual([]);
    });

    it("should back up corrupted file to .bak", async () => {
      const corruptedContent = "corrupted content here";
      await fs.writeFile(stateFilePath, corruptedContent);

      const adapter = new FileStateAdapter(stateFilePath);
      await adapter.load();

      const bakPath = `${stateFilePath}.bak`;
      const bakContent = await fs.readFile(bakPath, "utf-8");
      expect(bakContent).toBe(corruptedContent);
    });

    it("should log a warning to stderr for corrupted state", async () => {
      await fs.writeFile(stateFilePath, "{{invalid}}");

      const stderrMessages: string[] = [];
      const originalWarn = console.warn;
      console.warn = (...args: unknown[]) => {
        stderrMessages.push(args.join(" "));
      };

      try {
        const adapter = new FileStateAdapter(stateFilePath);
        await adapter.load();

        expect(
          stderrMessages.some((msg) => msg.includes("corrupted")),
        ).toBe(true);
      } finally {
        console.warn = originalWarn;
      }
    });

    it("should handle empty file as corrupted", async () => {
      await fs.writeFile(stateFilePath, "");

      const adapter = new FileStateAdapter(stateFilePath);
      await adapter.load();

      expect(adapter.get("last_processed_sha")).toBeNull();
      expect(adapter.get("version")).toBe(1);
    });
  });

  // ─── Edge Case: Stale running_tasks cleanup ─────────────────────

  describe("Edge Case: Stale running_tasks cleanup", () => {
    it("should clear tasks running > 30 minutes on load", async () => {
      const thirtyOneMinAgo = new Date(
        Date.now() - 31 * 60 * 1000,
      ).toISOString();
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      const state: CraigState = {
        ...createDefaultState(),
        running_tasks: ["stale_task", "fresh_task"],
        last_runs: {
          stale_task: thirtyOneMinAgo,
          fresh_task: fiveMinAgo,
        },
      };
      await fs.writeFile(stateFilePath, JSON.stringify(state, null, 2));

      const adapter = new FileStateAdapter(stateFilePath);
      await adapter.load();

      const runningTasks = adapter.get("running_tasks");
      expect(runningTasks).not.toContain("stale_task");
      expect(runningTasks).toContain("fresh_task");
    });

    it("should clear tasks that have no last_run record (treat as stale)", async () => {
      const state: CraigState = {
        ...createDefaultState(),
        running_tasks: ["unknown_task"],
        last_runs: {},
      };
      await fs.writeFile(stateFilePath, JSON.stringify(state, null, 2));

      const adapter = new FileStateAdapter(stateFilePath);
      await adapter.load();

      expect(adapter.get("running_tasks")).not.toContain("unknown_task");
    });
  });

  // ─── Edge Case: Findings pruning (>90 days) ────────────────────

  describe("Edge Case: Findings pruning (>90 days)", () => {
    it("should remove findings older than 90 days on load", async () => {
      const oldDate = new Date(
        Date.now() - 91 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const recentDate = new Date().toISOString();

      const state: CraigState = {
        ...createDefaultState(),
        findings: [
          makeFinding({ id: "old", detected_at: oldDate }),
          makeFinding({
            id: "recent",
            detected_at: recentDate,
            file: "src/new.ts",
          }),
        ],
      };
      await fs.writeFile(stateFilePath, JSON.stringify(state, null, 2));

      const adapter = new FileStateAdapter(stateFilePath);
      await adapter.load();

      const findings = adapter.get("findings");
      expect(findings).toHaveLength(1);
      expect(findings[0].id).toBe("recent");
    });

    it("should keep findings exactly 90 days old", async () => {
      const exactlyNinetyDays = new Date(
        Date.now() - 90 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const state: CraigState = {
        ...createDefaultState(),
        findings: [
          makeFinding({ id: "boundary", detected_at: exactlyNinetyDays }),
        ],
      };
      await fs.writeFile(stateFilePath, JSON.stringify(state, null, 2));

      const adapter = new FileStateAdapter(stateFilePath);
      await adapter.load();

      expect(adapter.get("findings")).toHaveLength(1);
    });
  });

  // ─── Edge Case: Concurrent writes (mutex) ──────────────────────

  describe("Edge Case: Concurrent writes", () => {
    it("should handle concurrent saves without corruption", async () => {
      const adapter = new FileStateAdapter(stateFilePath);
      await adapter.load();

      // Trigger multiple concurrent saves
      const saves = Array.from({ length: 5 }, (_, i) => {
        adapter.set("last_processed_sha", `sha-${i}`);
        return adapter.save();
      });

      await Promise.all(saves);

      // File should be valid JSON
      const raw = await fs.readFile(stateFilePath, "utf-8");
      expect(() => JSON.parse(raw)).not.toThrow();
    });
  });

  // ─── get/set operations ────────────────────────────────────────

  describe("get/set operations", () => {
    it("should set and get last_processed_sha", () => {
      const adapter = new FileStateAdapter(stateFilePath);
      adapter.loadSync();

      adapter.set("last_processed_sha", "abc123");
      expect(adapter.get("last_processed_sha")).toBe("abc123");
    });

    it("should set and get last_runs", () => {
      const adapter = new FileStateAdapter(stateFilePath);
      adapter.loadSync();

      const runs = { security_scan: "2025-03-14T10:00:00Z" };
      adapter.set("last_runs", runs);
      expect(adapter.get("last_runs")).toEqual(runs);
    });

    it("should set and get running_tasks", () => {
      const adapter = new FileStateAdapter(stateFilePath);
      adapter.loadSync();

      adapter.set("running_tasks", ["merge_review"]);
      expect(adapter.get("running_tasks")).toEqual(["merge_review"]);
    });

    it("should set and get daily_stats", () => {
      const adapter = new FileStateAdapter(stateFilePath);
      adapter.loadSync();

      const stats = {
        merges_reviewed: 3,
        issues_created: 1,
        prs_opened: 0,
        findings_by_severity: {
          critical: 0,
          high: 1,
          medium: 2,
          low: 0,
          info: 0,
        },
      };
      adapter.set("daily_stats", stats);
      expect(adapter.get("daily_stats")).toEqual(stats);
    });
  });

  // ─── HIGH Fix #1: Save mutex recovery after failure ────────────

  describe("HIGH Fix: Save mutex recovery after failure", () => {
    it("should allow subsequent saves after an atomicWrite failure", async () => {
      const adapter = new FileStateAdapter(stateFilePath);
      await adapter.load();

      // Make the directory read-only so the first save fails
      const dir = path.dirname(stateFilePath);
      await fs.chmod(dir, 0o444);

      // First save should fail
      await expect(adapter.save()).rejects.toThrow();

      // Restore write permission
      await fs.chmod(dir, 0o755);

      // Second save must NOT be poisoned — it should succeed
      adapter.set("last_processed_sha", "recovered-sha");
      await adapter.save();

      const raw = await fs.readFile(stateFilePath, "utf-8");
      const saved = JSON.parse(raw) as CraigState;
      expect(saved.last_processed_sha).toBe("recovered-sha");
    });
  });

  // ─── HIGH Fix #2: isValidStateShape validates required fields ──

  describe("HIGH Fix: State shape validation", () => {
    it("should treat JSON with only version field as incomplete and merge defaults", async () => {
      // {"version":1} passes the old validator but has no findings, running_tasks, etc.
      await fs.writeFile(stateFilePath, JSON.stringify({ version: 1 }));

      const adapter = new FileStateAdapter(stateFilePath);
      await adapter.load();

      // Must NOT crash — findings should be an array (from defaults)
      expect(adapter.get("findings")).toEqual([]);
      expect(adapter.get("running_tasks")).toEqual([]);
      expect(adapter.get("last_runs")).toEqual({});
      expect(adapter.get("last_processed_sha")).toBeNull();
      expect(adapter.get("daily_stats")).toBeDefined();
    });

    it("should preserve existing fields and fill in missing ones from defaults", async () => {
      // Partial state: has version and findings, but no running_tasks or daily_stats
      const partialState = {
        version: 1,
        last_processed_sha: "partial-sha",
        findings: [makeFinding({ id: "f-partial" })],
      };
      await fs.writeFile(stateFilePath, JSON.stringify(partialState));

      const adapter = new FileStateAdapter(stateFilePath);
      await adapter.load();

      // Existing fields preserved
      expect(adapter.get("last_processed_sha")).toBe("partial-sha");
      expect(adapter.get("findings")).toHaveLength(1);
      expect(adapter.get("findings")[0].id).toBe("f-partial");

      // Missing fields filled with defaults
      expect(adapter.get("running_tasks")).toEqual([]);
      expect(adapter.get("last_runs")).toEqual({});
      expect(adapter.get("daily_stats")).toEqual(
        createDefaultState().daily_stats,
      );
    });

    it("should reject JSON without version field as corrupted", async () => {
      await fs.writeFile(
        stateFilePath,
        JSON.stringify({ findings: [], running_tasks: [] }),
      );

      const adapter = new FileStateAdapter(stateFilePath);
      await adapter.load();

      // Should be treated as corrupted — gets default state
      expect(adapter.get("version")).toBe(1);
      // Backup should exist
      const bakExists = await fs
        .access(`${stateFilePath}.bak`)
        .then(() => true)
        .catch(() => false);
      expect(bakExists).toBe(true);
    });

    it("should reject JSON with non-numeric version as corrupted", async () => {
      await fs.writeFile(
        stateFilePath,
        JSON.stringify({ version: "one", findings: [] }),
      );

      const adapter = new FileStateAdapter(stateFilePath);
      await adapter.load();

      expect(adapter.get("version")).toBe(1);
    });
  });

  // ─── HIGH Fix #3: atomicWrite cleans up .tmp on failure ────────

  describe("HIGH Fix: Tmp file cleanup on atomicWrite failure", () => {
    it("should remove .tmp file when rename fails after write", async () => {
      const adapter = new FileStateAdapter(stateFilePath);
      await adapter.load();

      // Create a non-empty directory at the state file path.
      // rename(file, non-empty-directory) fails with EISDIR on POSIX,
      // but writeFile to .tmp succeeds because it's at a sibling path.
      await fs.mkdir(stateFilePath);
      await fs.writeFile(path.join(stateFilePath, "blocker"), "x");

      try {
        await adapter.save();
      } catch {
        // Expected: rename fails because destination is a non-empty directory
      }

      // The .tmp file must NOT remain on disk
      const files = await fs.readdir(tempDir);
      const tmpFiles = files.filter((f) => f.endsWith(".tmp"));
      expect(tmpFiles).toHaveLength(0);

      // Clean up the blocker directory for afterEach
      await fs.rm(stateFilePath, { recursive: true });
    });

    it("should still propagate the original error after cleanup", async () => {
      const adapter = new FileStateAdapter(stateFilePath);
      await adapter.load();

      // Same trick: non-empty directory blocks rename
      await fs.mkdir(stateFilePath);
      await fs.writeFile(path.join(stateFilePath, "blocker"), "x");

      await expect(adapter.save()).rejects.toThrow();

      // Clean up
      await fs.rm(stateFilePath, { recursive: true });
    });
  });
});
