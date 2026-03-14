/**
 * Unit tests for PatternCheckAnalyzer — the core pattern learning logic.
 *
 * Tests written FIRST per TDD. Each acceptance criterion from issue #14
 * maps to one or more tests.
 *
 * The analyzer now ONLY does learn mode (enforce mode was removed because
 * it required trigger/diff fields not present on canonical AnalyzerContext).
 *
 * @see https://github.com/vbomfim/sdlc-guardian-agents/issues/14
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { PatternCheckAnalyzer } from "../pattern-check.analyzer.js";
import type { PatternStorePort } from "../pattern-store.port.js";
import type { PatternSet } from "../types.js";
import type { AnalyzerContext } from "../../analyzer.types.js";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createMockPatternStore(): PatternStorePort {
  return {
    learn: vi.fn().mockResolvedValue(createValidPatternSet()),
    load: vi.fn().mockResolvedValue(createValidPatternSet()),
    save: vi.fn().mockResolvedValue(undefined),
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

function createContext(): AnalyzerContext {
  return {
    task: "pattern_check",
    taskId: "test-id",
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PatternCheckAnalyzer", () => {
  let patternStore: PatternStorePort;
  let analyzer: PatternCheckAnalyzer;

  beforeEach(() => {
    patternStore = createMockPatternStore();
    analyzer = new PatternCheckAnalyzer(patternStore);
  });

  // -----------------------------------------------------------------------
  // Basic properties
  // -----------------------------------------------------------------------

  describe("analyzer identity", () => {
    it('should have name "pattern_check"', () => {
      expect(analyzer.name).toBe("pattern_check");
    });
  });

  // -----------------------------------------------------------------------
  // AC1: Learn patterns
  // -----------------------------------------------------------------------

  describe("AC1: Learn patterns", () => {
    it("should call patternStore.learn and return success", async () => {
      const context = createContext();

      const result = await analyzer.execute(context);

      expect(patternStore.learn).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it("should save learned patterns after learning", async () => {
      const context = createContext();

      await analyzer.execute(context);

      expect(patternStore.save).toHaveBeenCalledWith(
        expect.objectContaining({
          naming_conventions: expect.any(Array),
          learned_at: expect.any(String),
        }),
      );
    });

    it("should always learn patterns on execute", async () => {
      const context = createContext();

      const result = await analyzer.execute(context);

      expect(patternStore.learn).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Result shape
  // -----------------------------------------------------------------------

  describe("Result shape", () => {
    it("should include duration_ms in the result", async () => {
      const context = createContext();

      const result = await analyzer.execute(context);

      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it("should include empty actions when no issues are created", async () => {
      const context = createContext();

      const result = await analyzer.execute(context);

      expect(result.actions).toEqual([]);
    });

    it("should return empty findings for learn mode", async () => {
      const context = createContext();

      const result = await analyzer.execute(context);

      expect(result.findings).toEqual([]);
    });

    it("should return a summary string", async () => {
      const context = createContext();

      const result = await analyzer.execute(context);

      expect(typeof result.summary).toBe("string");
      expect(result.summary.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // Never throws
  // -----------------------------------------------------------------------

  describe("never throws — returns AnalyzerResult with success false", () => {
    it("should return error result when learn throws unexpected error", async () => {
      vi.mocked(patternStore.learn).mockRejectedValue(
        new Error("Disk full"),
      );

      const context = createContext();

      const result = await analyzer.execute(context);

      expect(result.success).toBe(false);
      expect(result.summary).toContain("Disk full");
    });

    it("should return error result when save throws after learning", async () => {
      vi.mocked(patternStore.save).mockRejectedValue(
        new Error("Permission denied"),
      );

      const context = createContext();

      const result = await analyzer.execute(context);

      expect(result.success).toBe(false);
      expect(result.summary).toContain("Permission denied");
    });
  });
});
