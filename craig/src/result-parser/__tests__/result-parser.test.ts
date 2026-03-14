/**
 * Result Parser — Unit Tests
 *
 * TDD Red → Green → Refactor: These tests were written BEFORE the implementation.
 *
 * Test coverage:
 * - AC1: Parse Security Guardian report (3 findings)
 * - AC2: Parse Code Review Guardian report (metrics + findings)
 * - AC3: Parse QA Guardian report (coverage gaps)
 * - AC4: Extract severity from emoji markers
 * - AC5: Handle unexpected format gracefully (never throws)
 * - AC6: Extract recommended actions
 * - Edge cases: empty findings, missing columns, multiple tables, unicode, malformed input
 */

import { describe, it, expect } from "vitest";
import { createResultParser } from "../result-parser.js";
import type {
  ParsedReport,
  ParsedFinding,
  CoverageGap,
  Severity,
} from "../types.js";
import {
  SECURITY_REPORT,
  CODE_REVIEW_REPORT,
  QA_REPORT,
  EMPTY_FINDINGS_REPORT,
  INFO_SEVERITY_REPORT,
  MISSING_COLUMNS_REPORT,
  MALFORMED_REPORT,
  MULTIPLE_TABLES_REPORT,
  UNICODE_REPORT,
} from "./fixtures.js";

const parser = createResultParser();

// ---------------------------------------------------------------------------
// AC1: Parse Security Guardian report
// ---------------------------------------------------------------------------

describe("AC1: Parse Security Guardian report", () => {
  let report: ParsedReport;

  it("should parse without throwing", () => {
    report = parser.parse(SECURITY_REPORT, "security");
    expect(report).toBeDefined();
  });

  it("should set guardian type to 'security'", () => {
    report = parser.parse(SECURITY_REPORT, "security");
    expect(report.guardian).toBe("security");
  });

  it("should extract summary text", () => {
    report = parser.parse(SECURITY_REPORT, "security");
    expect(report.summary).toContain("authentication module");
  });

  it("should extract exactly 3 findings", () => {
    report = parser.parse(SECURITY_REPORT, "security");
    expect(report.findings).toHaveLength(3);
  });

  it("should preserve original markdown in raw field", () => {
    report = parser.parse(SECURITY_REPORT, "security");
    expect(report.raw).toBe(SECURITY_REPORT);
  });

  it("should extract finding #1 with all fields", () => {
    report = parser.parse(SECURITY_REPORT, "security");
    const finding = report.findings[0]!;

    expect(finding.number).toBe(1);
    expect(finding.severity).toBe("critical");
    expect(finding.category).toBe("[OWASP-A05]");
    expect(finding.file_line).toBe("src/db.py:42");
    expect(finding.issue).toContain("SQL injection");
    expect(finding.source_justification).toContain("OWASP A05");
    expect(finding.suggested_fix).toContain("parameterized query");
  });

  it("should extract finding #2 correctly", () => {
    report = parser.parse(SECURITY_REPORT, "security");
    const finding = report.findings[1]!;

    expect(finding.number).toBe(2);
    expect(finding.severity).toBe("high");
    expect(finding.category).toBe("[OWASP-A04]");
    expect(finding.file_line).toBe("config.py:8");
    expect(finding.issue).toContain("Hardcoded API key");
  });

  it("should extract finding #3 correctly", () => {
    report = parser.parse(SECURITY_REPORT, "security");
    const finding = report.findings[2]!;

    expect(finding.number).toBe(3);
    expect(finding.severity).toBe("medium");
    expect(finding.category).toBe("[OWASP-A03] [GCP-AF]");
    expect(finding.file_line).toBe("CMakeLists.txt:15");
  });
});

// ---------------------------------------------------------------------------
// AC2: Parse Code Review Guardian report
// ---------------------------------------------------------------------------

describe("AC2: Parse Code Review Guardian report", () => {
  let report: ParsedReport;

  it("should parse 4 findings from code review report", () => {
    report = parser.parse(CODE_REVIEW_REPORT, "code-review");
    expect(report.findings).toHaveLength(4);
    expect(report.guardian).toBe("code-review");
  });

  it("should extract metrics", () => {
    report = parser.parse(CODE_REVIEW_REPORT, "code-review");
    expect(report.metrics).toBeDefined();
    expect(report.metrics!["Linter issues"]).toBeDefined();
    expect(report.metrics!["Estimated complexity"]).toBeDefined();
  });

  it("should extract all severity levels from findings", () => {
    report = parser.parse(CODE_REVIEW_REPORT, "code-review");
    const severities = report.findings.map((f) => f.severity);

    expect(severities).toContain("high");
    expect(severities).toContain("medium");
    expect(severities).toContain("low");
  });

  it("should handle 'Domain' column header as category", () => {
    report = parser.parse(CODE_REVIEW_REPORT, "code-review");
    const finding = report.findings[0]!;

    expect(finding.category).toBe("Design");
  });

  it("should extract finding with backticks in issue text", () => {
    report = parser.parse(CODE_REVIEW_REPORT, "code-review");
    const finding = report.findings[3]!;

    expect(finding.issue).toContain("`d`");
    expect(finding.severity).toBe("low");
  });
});

// ---------------------------------------------------------------------------
// AC3: Parse QA Guardian report
// ---------------------------------------------------------------------------

describe("AC3: Parse QA Guardian report", () => {
  let report: ParsedReport;

  it("should extract coverage gaps", () => {
    report = parser.parse(QA_REPORT, "qa");
    expect(report.coverage_gaps).toBeDefined();
    expect(report.coverage_gaps).toHaveLength(3);
  });

  it("should parse coverage gap details correctly", () => {
    report = parser.parse(QA_REPORT, "qa");
    const gaps = report.coverage_gaps!;

    const gap1 = gaps[0]!;
    expect(gap1.gap).toContain("concurrent upload");
    expect(gap1.risk).toBe("high");
    expect(gap1.status).toContain("Added test");

    const gap2 = gaps[1]!;
    expect(gap2.gap).toContain("expired JWT");
    expect(gap2.risk).toBe("medium");

    const gap3 = gaps[2]!;
    expect(gap3.gap).toContain("load test");
    expect(gap3.risk).toBe("low");
    expect(gap3.status).toContain("Noted for later");
  });

  it("should also extract findings from QA report", () => {
    report = parser.parse(QA_REPORT, "qa");
    expect(report.findings).toHaveLength(2);
  });

  it("should extract summary from QA report", () => {
    report = parser.parse(QA_REPORT, "qa");
    expect(report.summary).toContain("upload feature");
  });
});

// ---------------------------------------------------------------------------
// AC4: Extract severity from emoji markers
// ---------------------------------------------------------------------------

describe("AC4: Extract severity from emoji markers", () => {
  it("should normalize 🔴 CRITICAL to 'critical'", () => {
    const report = parser.parse(SECURITY_REPORT, "security");
    expect(report.findings[0]!.severity).toBe("critical");
  });

  it("should normalize 🟠 HIGH to 'high'", () => {
    const report = parser.parse(SECURITY_REPORT, "security");
    expect(report.findings[1]!.severity).toBe("high");
  });

  it("should normalize 🟡 MEDIUM to 'medium'", () => {
    const report = parser.parse(SECURITY_REPORT, "security");
    expect(report.findings[2]!.severity).toBe("medium");
  });

  it("should normalize 🔵 LOW to 'low'", () => {
    const report = parser.parse(CODE_REVIEW_REPORT, "code-review");
    expect(report.findings[3]!.severity).toBe("low");
  });

  it("should normalize ℹ️ INFO to 'info'", () => {
    const report = parser.parse(INFO_SEVERITY_REPORT, "code-review");
    expect(report.findings[0]!.severity).toBe("info");
  });
});

// ---------------------------------------------------------------------------
// AC5: Handle unexpected format gracefully
// ---------------------------------------------------------------------------

describe("AC5: Handle unexpected format gracefully", () => {
  it("should return empty findings for malformed report", () => {
    const report = parser.parse(MALFORMED_REPORT, "security");

    expect(report.findings).toEqual([]);
    expect(report.summary).toBe("");
    expect(report.raw).toBe(MALFORMED_REPORT);
  });

  it("should never throw on any input", () => {
    expect(() => parser.parse("", "security")).not.toThrow();
    expect(() => parser.parse("   ", "security")).not.toThrow();
    expect(() => parser.parse("\n\n\n", "security")).not.toThrow();
    expect(() =>
      parser.parse("just random text without any structure", "code-review")
    ).not.toThrow();
  });

  it("should return valid ParsedReport for empty string", () => {
    const report = parser.parse("", "security");

    expect(report.guardian).toBe("security");
    expect(report.findings).toEqual([]);
    expect(report.recommended_actions).toEqual([]);
    expect(report.raw).toBe("");
  });

  it("should preserve guardian type even on parse failure", () => {
    const report = parser.parse(MALFORMED_REPORT, "qa");
    expect(report.guardian).toBe("qa");
  });
});

// ---------------------------------------------------------------------------
// AC6: Extract recommended actions
// ---------------------------------------------------------------------------

describe("AC6: Extract recommended actions", () => {
  it("should extract recommended actions from security report", () => {
    const report = parser.parse(SECURITY_REPORT, "security");

    expect(report.recommended_actions.length).toBeGreaterThanOrEqual(4);
    expect(report.recommended_actions.some((a) => a.includes("Create issues"))).toBe(true);
    expect(report.recommended_actions.some((a) => a.includes("Install scanning tools"))).toBe(true);
    expect(report.recommended_actions.some((a) => a.includes("Add CI workflow"))).toBe(true);
    expect(report.recommended_actions.some((a) => a.includes("Fix code"))).toBe(true);
  });

  it("should extract recommended actions from code review report", () => {
    const report = parser.parse(CODE_REVIEW_REPORT, "code-review");

    expect(report.recommended_actions.length).toBeGreaterThanOrEqual(4);
    expect(report.recommended_actions.some((a) => a.includes("Refactor"))).toBe(true);
  });

  it("should return empty array when no recommended actions section exists", () => {
    const report = parser.parse(MALFORMED_REPORT, "security");
    expect(report.recommended_actions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Edge Cases
// ---------------------------------------------------------------------------

describe("Edge case: Report with no findings table", () => {
  it("should return empty findings array", () => {
    const report = parser.parse(EMPTY_FINDINGS_REPORT, "security");
    expect(report.findings).toEqual([]);
    expect(report.summary).toContain("No security issues");
  });

  it("should still extract recommended actions", () => {
    const report = parser.parse(EMPTY_FINDINGS_REPORT, "security");
    expect(report.recommended_actions.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Edge case: Missing columns in findings table", () => {
  it("should populate available fields and default others to empty string", () => {
    const report = parser.parse(MISSING_COLUMNS_REPORT, "security");

    expect(report.findings).toHaveLength(1);
    const finding = report.findings[0]!;
    expect(finding.severity).toBe("high");
    expect(finding.issue).toContain("XSS");
    expect(finding.category).toBe("");
    expect(finding.file_line).toBe("");
    expect(finding.source_justification).toBe("");
    expect(finding.suggested_fix).toBe("");
  });
});

describe("Edge case: Multiple findings tables", () => {
  it("should combine findings from all tables", () => {
    const report = parser.parse(MULTIPLE_TABLES_REPORT, "security");

    expect(report.findings).toHaveLength(2);
    expect(report.findings[0]!.severity).toBe("critical");
    expect(report.findings[1]!.severity).toBe("high");
  });
});

describe("Edge case: Unicode in findings", () => {
  it("should preserve Unicode characters in finding text", () => {
    const report = parser.parse(UNICODE_REPORT, "security");

    expect(report.findings).toHaveLength(1);
    const finding = report.findings[0]!;
    expect(finding.file_line).toContain("日本語");
    expect(finding.issue).toContain("Héllo Wörld");
  });
});

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------

describe("Performance", () => {
  it("should parse a 500-line report in under 10ms", () => {
    // Generate a large report with many findings
    const rows = Array.from({ length: 100 }, (_, i) => {
      const num = i + 1;
      return `| ${num} | 🟡 MEDIUM | [TEST-${num}] | src/file${num}.ts:${num} | Issue number ${num} description | Source justification for issue ${num} | Fix suggestion for issue ${num} |`;
    }).join("\n");

    const largeReport = `## Security Guardian Report

### Summary
Large synthetic report for performance testing.

### Findings (100 total)

| # | Severity | Category | File:Line | Issue | Source & Justification | Suggested Fix |
|---|----------|----------|-----------|-------|------------------------|---------------|
${rows}

### Recommended Actions
- [ ] **Review** all 100 findings
`;

    const start = performance.now();
    const report = parser.parse(largeReport, "security");
    const elapsed = performance.now() - start;

    expect(report.findings).toHaveLength(100);
    expect(elapsed).toBeLessThan(10);
  });
});
