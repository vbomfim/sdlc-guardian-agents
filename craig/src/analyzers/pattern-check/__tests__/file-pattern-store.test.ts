/**
 * Unit tests for FilePatternStore — the persistence adapter for learned patterns.
 *
 * Tests written FIRST per TDD. Each acceptance criterion from issue #14
 * maps to one or more tests.
 *
 * @see https://github.com/vbomfim/sdlc-guardian-agents/issues/14
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { FilePatternStore } from "../file-pattern-store.js";
import type { CopilotPort } from "../../../copilot/index.js";
import type { PatternSet } from "../types.js";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "craig-pattern-test-"));
}

function createMockCopilot(): CopilotPort {
  return {
    invoke: vi.fn().mockResolvedValue({
      success: true,
      output: JSON.stringify({
        naming_conventions: [
          {
            name: "camelCase-functions",
            pattern: "Functions use camelCase naming",
            frequency: "42/45 files",
            severity: "warning",
            description: "All exported functions use camelCase naming convention",
          },
        ],
        file_structure: [
          {
            name: "barrel-exports",
            pattern: "Each module has an index.ts barrel export",
            frequency: "8/8 modules",
            severity: "info",
            description: "All component directories export via index.ts",
          },
        ],
        error_handling: [
          {
            name: "result-type-pattern",
            pattern: "Error handling uses discriminated union Result types",
            frequency: "15/18 files",
            severity: "warning",
            description: "Functions return success/failure unions instead of throwing",
          },
        ],
        import_conventions: [
          {
            name: "js-extension-imports",
            pattern: "Imports use .js extension for local modules",
            frequency: "40/40 files",
            severity: "warning",
            description: "All local imports include .js extension for ESM compatibility",
          },
        ],
      }),
      duration_ms: 5000,
      model_used: "claude-sonnet-4.5",
    }),
    isAvailable: vi.fn().mockResolvedValue(true),
  };
}

function createValidPatternSet(): PatternSet {
  return {
    naming_conventions: [
      {
        name: "camelCase-functions",
        pattern: "Functions use camelCase naming",
        frequency: "42/45 files",
        severity: "warning",
        description: "All exported functions use camelCase naming convention",
      },
    ],
    file_structure: [
      {
        name: "barrel-exports",
        pattern: "Each module has an index.ts barrel export",
        frequency: "8/8 modules",
        severity: "info",
        description: "All component directories export via index.ts",
      },
    ],
    error_handling: [
      {
        name: "result-type-pattern",
        pattern: "Error handling uses discriminated union Result types",
        frequency: "15/18 files",
        severity: "warning",
        description: "Functions return success/failure unions instead of throwing",
      },
    ],
    import_conventions: [
      {
        name: "js-extension-imports",
        pattern: "Imports use .js extension for local modules",
        frequency: "40/40 files",
        severity: "warning",
        description: "All local imports include .js extension for ESM compatibility",
      },
    ],
    learned_at: "2025-07-10T08:00:00.000Z",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FilePatternStore", () => {
  let tmpDir: string;
  let copilot: CopilotPort;
  let store: FilePatternStore;

  beforeEach(async () => {
    tmpDir = await makeTempDir();
    copilot = createMockCopilot();
    store = new FilePatternStore(tmpDir, copilot);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // AC1: Learn patterns from repo
  // -----------------------------------------------------------------------

  describe("AC1: Learn patterns from repo", () => {
    it("should invoke Code Review Guardian to analyze the repository", async () => {
      await store.learn("/path/to/repo");

      expect(copilot.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          agent: "code-review-guardian",
          prompt: expect.stringContaining("Analyze"),
        }),
      );
    });

    it("should return a valid PatternSet from learned patterns", async () => {
      const patterns = await store.learn("/path/to/repo");

      expect(patterns.naming_conventions).toHaveLength(1);
      expect(patterns.file_structure).toHaveLength(1);
      expect(patterns.error_handling).toHaveLength(1);
      expect(patterns.import_conventions).toHaveLength(1);
      expect(patterns.learned_at).toBeDefined();
      expect(new Date(patterns.learned_at).toISOString()).toBe(
        patterns.learned_at,
      );
    });

    it("should set learned_at to current ISO timestamp", async () => {
      const before = new Date().toISOString();
      const patterns = await store.learn("/path/to/repo");
      const after = new Date().toISOString();

      expect(patterns.learned_at >= before).toBe(true);
      expect(patterns.learned_at <= after).toBe(true);
    });

    it("should include repoPath in the Copilot prompt context", async () => {
      await store.learn("/my/project/path");

      expect(copilot.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.stringContaining("/my/project/path"),
        }),
      );
    });

    it("should throw PatternLearningError when Copilot invocation fails", async () => {
      vi.mocked(copilot.invoke).mockResolvedValue({
        success: false,
        output: "",
        duration_ms: 100,
        model_used: "claude-sonnet-4.5",
        error: "Session timeout",
      });

      await expect(store.learn("/path/to/repo")).rejects.toThrow(
        "Pattern learning failed",
      );
    });

    it("should throw PatternLearningError when Copilot returns unparseable output", async () => {
      vi.mocked(copilot.invoke).mockResolvedValue({
        success: true,
        output: "This is not valid JSON at all",
        duration_ms: 100,
        model_used: "claude-sonnet-4.5",
      });

      await expect(store.learn("/path/to/repo")).rejects.toThrow(
        "Pattern learning failed",
      );
    });

    it("should handle Copilot output with markdown code fences around JSON", async () => {
      vi.mocked(copilot.invoke).mockResolvedValue({
        success: true,
        output: "```json\n" + JSON.stringify({
          naming_conventions: [],
          file_structure: [],
          error_handling: [],
          import_conventions: [],
        }) + "\n```",
        duration_ms: 100,
        model_used: "claude-sonnet-4.5",
      });

      const patterns = await store.learn("/path/to/repo");

      expect(patterns.naming_conventions).toEqual([]);
      expect(patterns.learned_at).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // load() and save()
  // -----------------------------------------------------------------------

  describe("load()", () => {
    it("should return null when no patterns file exists", async () => {
      const result = await store.load();

      expect(result).toBeNull();
    });

    it("should return saved PatternSet from .craig-patterns.json", async () => {
      const patterns = createValidPatternSet();
      const filePath = path.join(tmpDir, ".craig-patterns.json");
      await fs.writeFile(filePath, JSON.stringify(patterns), "utf-8");

      const result = await store.load();

      expect(result).not.toBeNull();
      expect(result!.naming_conventions).toHaveLength(1);
      expect(result!.naming_conventions[0]!.name).toBe("camelCase-functions");
      expect(result!.learned_at).toBe("2025-07-10T08:00:00.000Z");
    });

    it("should return null and back up corrupted file", async () => {
      const filePath = path.join(tmpDir, ".craig-patterns.json");
      await fs.writeFile(filePath, "{ this is not valid json }", "utf-8");

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await store.load();

      expect(result).toBeNull();

      // Verify backup was created
      const backupExists = await fs
        .access(filePath + ".bak")
        .then(() => true)
        .catch(() => false);
      expect(backupExists).toBe(true);

      errorSpy.mockRestore();
    });
  });

  describe("save()", () => {
    it("should persist PatternSet to .craig-patterns.json", async () => {
      const patterns = createValidPatternSet();

      await store.save(patterns);

      const filePath = path.join(tmpDir, ".craig-patterns.json");
      const content = await fs.readFile(filePath, "utf-8");
      const saved = JSON.parse(content) as PatternSet;

      expect(saved.naming_conventions).toHaveLength(1);
      expect(saved.learned_at).toBe("2025-07-10T08:00:00.000Z");
    });

    it("should use atomic writes (write to .tmp, then rename)", async () => {
      const patterns = createValidPatternSet();

      await store.save(patterns);

      // The .tmp file should NOT exist after save completes
      const tmpExists = await fs
        .access(path.join(tmpDir, ".craig-patterns.json.tmp"))
        .then(() => true)
        .catch(() => false);
      expect(tmpExists).toBe(false);

      // The actual file should exist
      const fileExists = await fs
        .access(path.join(tmpDir, ".craig-patterns.json"))
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);
    });

    it("should overwrite existing patterns file", async () => {
      const original = createValidPatternSet();
      await store.save(original);

      const updated: PatternSet = {
        ...original,
        learned_at: "2025-08-01T12:00:00.000Z",
        naming_conventions: [],
      };
      await store.save(updated);

      const result = await store.load();
      expect(result!.naming_conventions).toHaveLength(0);
      expect(result!.learned_at).toBe("2025-08-01T12:00:00.000Z");
    });

    it("should produce valid JSON with 2-space indentation", async () => {
      const patterns = createValidPatternSet();

      await store.save(patterns);

      const filePath = path.join(tmpDir, ".craig-patterns.json");
      const content = await fs.readFile(filePath, "utf-8");

      // Verify it's formatted with 2-space indent
      expect(content).toContain("  ");
      expect(content.endsWith("\n")).toBe(true);
    });
  });
});
