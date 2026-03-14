/**
 * Unit tests for PatternCheckAnalyzer — the core pattern enforcement logic.
 *
 * Tests written FIRST per TDD. Each acceptance criterion from issue #14
 * maps to one or more tests.
 *
 * @see https://github.com/vbomfim/sdlc-guardian-agents/issues/14
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { PatternCheckAnalyzer } from "../pattern-check.analyzer.js";
import type { PatternStorePort } from "../pattern-store.port.js";
import type { PatternSet } from "../types.js";
import type { CopilotPort } from "../../../copilot/index.js";
import type { AnalyzerContext } from "../../analyzer.port.js";

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

function createMockCopilot(): CopilotPort {
  return {
    invoke: vi.fn().mockResolvedValue({
      success: true,
      output: `## Pattern Deviation Review

### Findings

| # | Severity | Category | File:Line | Issue | Source & Justification | Suggested Fix |
|---|----------|----------|-----------|-------|----------------------|---------------|
| 1 | 🟡 Medium | Pattern Deviation | src/new-file.ts:15 | Uses try/catch instead of Result type pattern (15/18 files use Result) | [CUSTOM] Repo convention | Refactor to use Result<T, E> discriminated union |
| 2 | 🔵 Low | Pattern Deviation | src/new-file.ts:3 | Uses relative imports without .js extension (40/40 files use .js) | [CUSTOM] Repo convention | Add .js extension to import |`,
      duration_ms: 3000,
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

function createMergeContext(diff?: string): AnalyzerContext {
  return {
    trigger: "merge",
    sha: "abc123def456",
    diff: diff ?? `diff --git a/src/new-file.ts b/src/new-file.ts
new file mode 100644
--- /dev/null
+++ b/src/new-file.ts
@@ -0,0 +1,20 @@
+import { something } from "./utils";
+
+export async function getData() {
+  try {
+    const result = await fetch("/api/data");
+    return result.json();
+  } catch (error) {
+    console.error(error);
+    throw error;
+  }
+}`,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PatternCheckAnalyzer", () => {
  let patternStore: PatternStorePort;
  let copilot: CopilotPort;
  let analyzer: PatternCheckAnalyzer;

  beforeEach(() => {
    patternStore = createMockPatternStore();
    copilot = createMockCopilot();
    analyzer = new PatternCheckAnalyzer(patternStore, copilot);
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
  // AC1: Learn patterns (manual trigger)
  // -----------------------------------------------------------------------

  describe("AC1: Learn patterns on manual trigger", () => {
    it("should call patternStore.learn when triggered manually with no existing patterns", async () => {
      vi.mocked(patternStore.load).mockResolvedValue(null);

      const result = await analyzer.execute({ trigger: "manual" });

      expect(patternStore.learn).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.task).toBe("pattern_check");
    });

    it("should save learned patterns after learning", async () => {
      vi.mocked(patternStore.load).mockResolvedValue(null);

      await analyzer.execute({ trigger: "manual" });

      expect(patternStore.save).toHaveBeenCalledWith(
        expect.objectContaining({
          naming_conventions: expect.any(Array),
          learned_at: expect.any(String),
        }),
      );
    });

    it("should re-learn patterns on manual trigger even when patterns exist", async () => {
      vi.mocked(patternStore.load).mockResolvedValue(createValidPatternSet());

      const result = await analyzer.execute({ trigger: "manual" });

      expect(patternStore.learn).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // AC2: Flag deviations on merge
  // -----------------------------------------------------------------------

  describe("AC2: Flag deviations on merge", () => {
    it("should load existing patterns and invoke Code Review Guardian with diff", async () => {
      const context = createMergeContext();

      await analyzer.execute(context);

      expect(patternStore.load).toHaveBeenCalled();
      expect(copilot.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          agent: "code-review-guardian",
          prompt: expect.stringContaining("pattern"),
          context: expect.stringContaining("diff"),
        }),
      );
    });

    it("should return findings from the Code Review Guardian analysis", async () => {
      const context = createMergeContext();

      const result = await analyzer.execute(context);

      expect(result.success).toBe(true);
      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.task).toBe("pattern_check");
    });

    it("should include duration_ms in the result", async () => {
      const context = createMergeContext();

      const result = await analyzer.execute(context);

      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it("should pass learned patterns as context to Code Review Guardian", async () => {
      const context = createMergeContext();

      await analyzer.execute(context);

      const invokeCall = vi.mocked(copilot.invoke).mock.calls[0]![0];
      expect(invokeCall.context).toContain("camelCase-functions");
      expect(invokeCall.context).toContain("result-type-pattern");
    });
  });

  // -----------------------------------------------------------------------
  // AC3: Include deviations in merge review
  // -----------------------------------------------------------------------

  describe("AC3: Include deviations in merge review comment", () => {
    it("should return structured findings that can be composed into review comments", async () => {
      const context = createMergeContext();

      const result = await analyzer.execute(context);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: expect.any(String),
            issue: expect.stringContaining("try/catch"),
          }),
        ]),
      );
    });

    it("should include empty actions_taken when no issues are created", async () => {
      const context = createMergeContext();

      const result = await analyzer.execute(context);

      expect(result.actions_taken).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // Edge Cases
  // -----------------------------------------------------------------------

  describe("Edge case: No learned patterns", () => {
    it("should skip pattern check and return info message when no patterns exist on merge", async () => {
      vi.mocked(patternStore.load).mockResolvedValue(null);

      const context = createMergeContext();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await analyzer.execute(context);

      expect(result.success).toBe(true);
      expect(result.findings).toEqual([]);
      expect(result.error).toContain(
        "run `craig_run_task pattern_check` to learn patterns first",
      );

      errorSpy.mockRestore();
    });
  });

  describe("Edge case: Corrupted patterns file", () => {
    it("should re-learn patterns when load throws an error", async () => {
      vi.mocked(patternStore.load).mockRejectedValue(
        new Error("Parse error"),
      );

      const context: AnalyzerContext = { trigger: "manual" };

      const result = await analyzer.execute(context);

      expect(patternStore.learn).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  describe("Edge case: Copilot unavailable", () => {
    it("should return success false when Copilot invocation fails on merge", async () => {
      vi.mocked(copilot.invoke).mockResolvedValue({
        success: false,
        output: "",
        duration_ms: 100,
        model_used: "claude-sonnet-4.5",
        error: "Copilot session timeout",
      });

      const context = createMergeContext();

      const result = await analyzer.execute(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Copilot session timeout");
    });
  });

  describe("Edge case: Diff is empty or missing", () => {
    it("should return success with no findings when diff is empty", async () => {
      const context: AnalyzerContext = {
        trigger: "merge",
        sha: "abc123",
        diff: "",
      };

      const result = await analyzer.execute(context);

      expect(result.success).toBe(true);
      expect(result.findings).toEqual([]);
    });

    it("should return success with no findings when diff is undefined on merge", async () => {
      const context: AnalyzerContext = {
        trigger: "merge",
        sha: "abc123",
      };

      const result = await analyzer.execute(context);

      expect(result.success).toBe(true);
      expect(result.findings).toEqual([]);
    });
  });

  describe("Edge case: Schedule trigger", () => {
    it("should re-learn patterns on schedule trigger", async () => {
      const context: AnalyzerContext = { trigger: "schedule" };

      const result = await analyzer.execute(context);

      expect(patternStore.learn).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Never throws
  // -----------------------------------------------------------------------

  describe("never throws — returns AnalyzerResult with success false", () => {
    it("should return error result when learn throws unexpected error", async () => {
      vi.mocked(patternStore.load).mockRejectedValue(
        new Error("Unexpected error"),
      );
      vi.mocked(patternStore.learn).mockRejectedValue(
        new Error("Disk full"),
      );

      const context: AnalyzerContext = { trigger: "manual" };

      const result = await analyzer.execute(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Disk full");
      expect(result.task).toBe("pattern_check");
    });

    it("should return error result when save throws after learning", async () => {
      vi.mocked(patternStore.load).mockResolvedValue(null);
      vi.mocked(patternStore.save).mockRejectedValue(
        new Error("Permission denied"),
      );

      const context: AnalyzerContext = { trigger: "manual" };

      const result = await analyzer.execute(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Permission denied");
    });
  });
});
