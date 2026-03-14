/**
 * Unit tests for AnalyzerRegistry — the core registry pattern.
 *
 * Tests written FIRST per TDD. The registry maps task names to
 * AnalyzerPort implementations and is used by tool-handlers to
 * dispatch task execution.
 *
 * [TDD] Red → Green → Refactor
 *
 * @module core/__tests__/analyzer-registry
 */

import { describe, it, expect, vi } from "vitest";
import {
  createAnalyzerRegistry,
  type AnalyzerRegistry,
} from "../../core/analyzer-registry.js";
import type { AnalyzerPort, AnalyzerContext } from "../../analyzers/index.js";

/* ------------------------------------------------------------------ */
/*  Test Helpers                                                       */
/* ------------------------------------------------------------------ */

/** Create a minimal mock AnalyzerPort for testing. */
function createMockAnalyzer(name: string): AnalyzerPort {
  return {
    name,
    execute: vi.fn().mockResolvedValue({
      success: true,
      summary: `${name} completed`,
      findings: [],
      actions: [],
      duration_ms: 100,
    }),
  };
}

/* ------------------------------------------------------------------ */
/*  createAnalyzerRegistry                                             */
/* ------------------------------------------------------------------ */

describe("createAnalyzerRegistry", () => {
  it("returns an empty registry when no analyzers are provided", () => {
    const registry = createAnalyzerRegistry([]);

    expect(registry.size).toBe(0);
  });

  it("maps analyzers by their name property", () => {
    const securityAnalyzer = createMockAnalyzer("security_scan");
    const coverageAnalyzer = createMockAnalyzer("coverage_scan");

    const registry = createAnalyzerRegistry([
      securityAnalyzer,
      coverageAnalyzer,
    ]);

    expect(registry.size).toBe(2);
    expect(registry.get("security_scan")).toBe(securityAnalyzer);
    expect(registry.get("coverage_scan")).toBe(coverageAnalyzer);
  });

  it("returns undefined for unknown analyzer name", () => {
    const registry = createAnalyzerRegistry([
      createMockAnalyzer("security_scan"),
    ]);

    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("last analyzer wins when duplicate names are provided", () => {
    const first = createMockAnalyzer("security_scan");
    const second = createMockAnalyzer("security_scan");

    const registry = createAnalyzerRegistry([first, second]);

    expect(registry.size).toBe(1);
    expect(registry.get("security_scan")).toBe(second);
  });

  it("returns a ReadonlyMap (immutable at type level)", () => {
    const registry: AnalyzerRegistry = createAnalyzerRegistry([
      createMockAnalyzer("security_scan"),
    ]);

    // ReadonlyMap does not have set/delete methods at compile time.
    // At runtime, the underlying Map is still mutable, but the type
    // prevents accidental mutation in TypeScript code.
    expect(registry).toBeInstanceOf(Map);
    expect(registry.get("security_scan")).toBeDefined();
  });

  it("supports iteration over registered analyzers", () => {
    const analyzers = [
      createMockAnalyzer("security_scan"),
      createMockAnalyzer("coverage_scan"),
      createMockAnalyzer("merge_review"),
    ];

    const registry = createAnalyzerRegistry(analyzers);

    const names = [...registry.keys()];
    expect(names).toHaveLength(3);
    expect(names).toContain("security_scan");
    expect(names).toContain("coverage_scan");
    expect(names).toContain("merge_review");
  });
});

/* ------------------------------------------------------------------ */
/*  AnalyzerPort.execute contract tests                                */
/* ------------------------------------------------------------------ */

describe("AnalyzerPort.execute contract", () => {
  it("execute receives AnalyzerContext and returns AnalyzerResult", async () => {
    const analyzer = createMockAnalyzer("security_scan");
    const context: AnalyzerContext = {
      task: "security_scan",
      taskId: "test-id-123",
      timestamp: "2025-07-15T10:00:00Z",
    };

    const result = await analyzer.execute(context);

    expect(result).toHaveProperty("success", true);
    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("findings");
    expect(result).toHaveProperty("actions");
    expect(result).toHaveProperty("duration_ms");
    expect(analyzer.execute).toHaveBeenCalledWith(context);
  });

  it("execute can return findings", async () => {
    const analyzer: AnalyzerPort = {
      name: "security_scan",
      execute: vi.fn().mockResolvedValue({
        success: true,
        summary: "Found 2 issues",
        findings: [
          {
            severity: "critical",
            category: "security",
            file: "src/db.ts",
            issue: "SQL injection vulnerability",
            source: "security-guardian",
            suggested_fix: "Use parameterized queries",
          },
          {
            severity: "high",
            category: "security",
            file: "src/auth.ts",
            issue: "Weak password hashing",
            source: "security-guardian",
          },
        ],
        actions: [
          {
            type: "issue_created",
            description: "Created issue for SQL injection",
            url: "https://github.com/owner/repo/issues/42",
          },
        ],
        duration_ms: 2500,
      }),
    };

    const result = await analyzer.execute({
      task: "security_scan",
      taskId: "test-id",
      timestamp: new Date().toISOString(),
    });

    expect(result.success).toBe(true);
    expect(result.findings).toHaveLength(2);
    expect(result.findings[0].severity).toBe("critical");
    expect(result.findings[1].severity).toBe("high");
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].type).toBe("issue_created");
  });

  it("execute can return failure result without throwing", async () => {
    const analyzer: AnalyzerPort = {
      name: "security_scan",
      execute: vi.fn().mockResolvedValue({
        success: false,
        summary: "Analysis failed: API timeout",
        findings: [],
        actions: [],
        duration_ms: 30000,
      }),
    };

    const result = await analyzer.execute({
      task: "security_scan",
      taskId: "test-id",
      timestamp: new Date().toISOString(),
    });

    expect(result.success).toBe(false);
    expect(result.findings).toHaveLength(0);
    expect(result.summary).toContain("failed");
  });
});

/* ------------------------------------------------------------------ */
/*  Registry + Execute integration                                     */
/* ------------------------------------------------------------------ */

describe("registry lookup and execute integration", () => {
  it("looks up analyzer by task name and executes it", async () => {
    const analyzer = createMockAnalyzer("security_scan");
    const registry = createAnalyzerRegistry([analyzer]);

    const found = registry.get("security_scan");
    expect(found).toBeDefined();

    const context: AnalyzerContext = {
      task: "security_scan",
      taskId: "task-abc",
      timestamp: "2025-07-15T10:00:00Z",
    };

    const result = await found!.execute(context);

    expect(result.success).toBe(true);
    expect(analyzer.execute).toHaveBeenCalledWith(context);
  });

  it("returns undefined for unregistered task — caller handles gracefully", () => {
    const registry = createAnalyzerRegistry([
      createMockAnalyzer("security_scan"),
    ]);

    const found = registry.get("auto_fix");

    expect(found).toBeUndefined();
  });
});
