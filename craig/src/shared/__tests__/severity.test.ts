/**
 * Unit tests for shared Severity module — the canonical severity type.
 *
 * Tests the shared severity type definition, order array, and validation
 * function. This is the single source of truth for severity levels.
 *
 * [TDD] Red → Green → Refactor
 * [DRY] Testing the shared type that eliminates duplication
 *
 * @module shared/__tests__/severity
 */

import { describe, it, expect } from "vitest";
import {
  type Severity,
  SEVERITY_ORDER,
  isSeverity,
} from "../severity.js";

/* ------------------------------------------------------------------ */
/*  Severity type validation                                          */
/* ------------------------------------------------------------------ */

describe("Severity type", () => {
  it("should accept all valid severity levels", () => {
    const critical: Severity = "critical";
    const high: Severity = "high";
    const medium: Severity = "medium";
    const low: Severity = "low";
    const info: Severity = "info";

    // Verify assignment works (compile-time check)
    expect(critical).toBe("critical");
    expect(high).toBe("high");
    expect(medium).toBe("medium");
    expect(low).toBe("low");
    expect(info).toBe("info");
  });

  it("should be used consistently across findings", () => {
    // This test verifies that the type works in realistic usage
    interface TestFinding {
      severity: Severity;
      issue: string;
    }

    const findings: TestFinding[] = [
      { severity: "critical", issue: "SQL injection" },
      { severity: "high", issue: "XSS vulnerability" },
      { severity: "medium", issue: "Missing validation" },
      { severity: "low", issue: "Code style issue" },
      { severity: "info", issue: "Documentation update needed" },
    ];

    expect(findings).toHaveLength(5);
    expect(findings[0].severity).toBe("critical");
    expect(findings[4].severity).toBe("info");
  });
});

/* ------------------------------------------------------------------ */
/*  SEVERITY_ORDER constant                                           */
/* ------------------------------------------------------------------ */

describe("SEVERITY_ORDER", () => {
  it("should contain all severity levels in descending order", () => {
    expect(SEVERITY_ORDER).toEqual([
      "critical",
      "high",
      "medium",
      "low",
      "info",
    ]);
  });

  it("should be readonly", () => {
    // Type check: SEVERITY_ORDER is readonly Severity[]
    expect(Array.isArray(SEVERITY_ORDER)).toBe(true);
    expect(SEVERITY_ORDER).toHaveLength(5);

    // Runtime immutability would require Object.freeze(), but TypeScript
    // readonly provides compile-time safety which is our primary goal.
    expect(SEVERITY_ORDER[0]).toBe("critical");
  });

  it("should be useful for sorting", () => {
    // Example: sorting findings by severity (most critical first)
    const findings = [
      { severity: "low" as Severity, issue: "Style issue" },
      { severity: "critical" as Severity, issue: "SQL injection" },
      { severity: "medium" as Severity, issue: "Missing validation" },
    ];

    const sorted = findings.sort((a, b) => {
      return SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
    });

    expect(sorted[0].severity).toBe("critical");
    expect(sorted[1].severity).toBe("medium");
    expect(sorted[2].severity).toBe("low");
  });

  it("should support severity comparison", () => {
    // Helper function using SEVERITY_ORDER
    function isMoreCritical(a: Severity, b: Severity): boolean {
      return SEVERITY_ORDER.indexOf(a) < SEVERITY_ORDER.indexOf(b);
    }

    expect(isMoreCritical("critical", "high")).toBe(true);
    expect(isMoreCritical("high", "critical")).toBe(false);
    expect(isMoreCritical("medium", "low")).toBe(true);
    expect(isMoreCritical("info", "low")).toBe(false);
    expect(isMoreCritical("critical", "critical")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  isSeverity validation function                                    */
/* ------------------------------------------------------------------ */

describe("isSeverity", () => {
  it("should return true for all valid severity levels", () => {
    expect(isSeverity("critical")).toBe(true);
    expect(isSeverity("high")).toBe(true);
    expect(isSeverity("medium")).toBe(true);
    expect(isSeverity("low")).toBe(true);
    expect(isSeverity("info")).toBe(true);
  });

  it("should return false for invalid strings", () => {
    expect(isSeverity("")).toBe(false);
    expect(isSeverity("urgent")).toBe(false);
    expect(isSeverity("CRITICAL")).toBe(false);  // Case sensitive
    expect(isSeverity("warning")).toBe(false);
    expect(isSeverity("error")).toBe(false);
    expect(isSeverity("debug")).toBe(false);
    expect(isSeverity("trace")).toBe(false);
  });

  it("should return false for non-string inputs", () => {
    // TypeScript prevents this at compile time, but runtime checks matter
    expect(isSeverity(null as any)).toBe(false);
    expect(isSeverity(undefined as any)).toBe(false);
    expect(isSeverity(123 as any)).toBe(false);
    expect(isSeverity(true as any)).toBe(false);
    expect(isSeverity({} as any)).toBe(false);
    expect(isSeverity([] as any)).toBe(false);
  });

  it("should work as a type guard", () => {
    function processSeverity(input: string): Severity | null {
      if (isSeverity(input)) {
        // TypeScript now knows `input` is Severity type
        return input;  // No type error
      }
      return null;
    }

    expect(processSeverity("critical")).toBe("critical");
    expect(processSeverity("invalid")).toBe(null);
  });

  it("should be useful for parsing user input", () => {
    // Example: parsing severity from CLI args or config files
    const userInputs = ["critical", "HIGH", "medium", "invalid", ""];
    
    const validSeverities = userInputs
      .filter(isSeverity)
      .map(s => s as Severity);

    expect(validSeverities).toEqual(["critical", "medium"]);
  });

  it("should handle edge cases", () => {
    expect(isSeverity("critical ")).toBe(false);  // Trailing space
    expect(isSeverity(" critical")).toBe(false);  // Leading space
    expect(isSeverity("Critical")).toBe(false);   // Wrong case
    expect(isSeverity("critical\n")).toBe(false); // Newline
  });
});

/* ------------------------------------------------------------------ */
/*  Integration with type system                                      */
/* ------------------------------------------------------------------ */

describe("severity integration", () => {
  it("should work with analyzers types", () => {
    // This test ensures the shared severity integrates properly
    // with analyzer types that import it
    interface MockAnalyzerFinding {
      severity: Severity;
      issue: string;
    }

    const finding: MockAnalyzerFinding = {
      severity: "high",
      issue: "Buffer overflow detected",
    };

    expect(isSeverity(finding.severity)).toBe(true);
    expect(SEVERITY_ORDER.includes(finding.severity)).toBe(true);
  });

  it("should work as a filter and sort key", () => {
    // Realistic scenario: filtering and sorting findings by severity
    const rawFindings = [
      { severity: "info", issue: "Code comment missing" },
      { severity: "critical", issue: "SQL injection" },
      { severity: "low", issue: "Unused variable" },
      { severity: "high", issue: "XSS vulnerability" },
      { severity: "medium", issue: "Missing input validation" },
    ];

    // Filter to only high-severity findings (critical, high)
    const highSeverityOnly = rawFindings
      .filter(f => isSeverity(f.severity))
      .filter(f => SEVERITY_ORDER.indexOf(f.severity as Severity) <= 1);

    expect(highSeverityOnly).toHaveLength(2);
    expect(highSeverityOnly[0].severity).toBe("critical");
    expect(highSeverityOnly[1].severity).toBe("high");

    // Sort all findings by severity (most critical first)
    const sorted = rawFindings
      .filter(f => isSeverity(f.severity))
      .sort((a, b) => {
        const aIndex = SEVERITY_ORDER.indexOf(a.severity as Severity);
        const bIndex = SEVERITY_ORDER.indexOf(b.severity as Severity);
        return aIndex - bIndex;
      });

    expect(sorted.map(f => f.severity)).toEqual([
      "critical",
      "high", 
      "medium",
      "low",
      "info",
    ]);
  });
});