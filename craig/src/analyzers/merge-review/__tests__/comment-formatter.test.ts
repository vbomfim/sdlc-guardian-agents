/**
 * Comment Formatter — Unit Tests
 *
 * Tests the pure function that formats merge review comments.
 * Covers: clean commit, findings with summary, timeout handling,
 * diff truncation, and severity counting.
 *
 * [TDD] Written BEFORE the implementation was finalized.
 */

import { describe, it, expect } from "vitest";
import {
  formatReviewComment,
  type CommentInput,
} from "../comment-formatter.js";
import type { ParsedFinding } from "../../../result-parser/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createFinding(overrides: Partial<ParsedFinding> = {}): ParsedFinding {
  return {
    number: 1,
    severity: "medium",
    category: "[OWASP-A03]",
    file_line: "src/app.ts:42",
    issue: "Test issue",
    source_justification: "Test justification",
    suggested_fix: "Fix it",
    ...overrides,
  };
}

function createInput(overrides: Partial<CommentInput> = {}): CommentInput {
  return {
    sha: "abc1234",
    securityFindings: [],
    codeReviewFindings: [],
    securityTimedOut: false,
    codeReviewTimedOut: false,
    diffTruncated: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("formatReviewComment", () => {
  // AC4: No findings
  describe("when no findings exist", () => {
    it("returns clean comment with checkmark", () => {
      const result = formatReviewComment(createInput());

      expect(result).toContain("## 🤖 Craig — Merge Review");
      expect(result).toContain("**Commit:** abc1234");
      expect(result).toContain("✅ No issues found.");
    });

    it("does not include findings tables", () => {
      const result = formatReviewComment(createInput());

      expect(result).not.toContain("| Severity |");
      expect(result).not.toContain("### Summary");
    });
  });

  // AC2: Review comment format
  describe("when findings exist", () => {
    it("includes header with commit SHA and guardian names", () => {
      const input = createInput({
        securityFindings: [createFinding({ severity: "high" })],
        codeReviewFindings: [createFinding({ severity: "medium" })],
      });

      const result = formatReviewComment(input);

      expect(result).toContain("## 🤖 Craig — Merge Review");
      expect(result).toContain("**Commit:** abc1234");
      expect(result).toContain("Security Guardian");
      expect(result).toContain("Code Review Guardian");
    });

    it("renders security findings section with count", () => {
      const input = createInput({
        securityFindings: [
          createFinding({ severity: "critical", issue: "SQL Injection" }),
          createFinding({ severity: "high", issue: "Hardcoded key" }),
        ],
      });

      const result = formatReviewComment(input);

      expect(result).toContain("### Security Findings (2)");
      expect(result).toContain("SQL Injection");
      expect(result).toContain("Hardcoded key");
    });

    it("renders code review findings section with count", () => {
      const input = createInput({
        codeReviewFindings: [
          createFinding({ severity: "medium", issue: "God class" }),
          createFinding({ severity: "low", issue: "Bad naming" }),
          createFinding({ severity: "medium", issue: "High complexity" }),
        ],
      });

      const result = formatReviewComment(input);

      expect(result).toContain("### Code Review Findings (3)");
      expect(result).toContain("God class");
      expect(result).toContain("Bad naming");
      expect(result).toContain("High complexity");
    });

    it("renders findings table with severity emoji", () => {
      const input = createInput({
        securityFindings: [
          createFinding({ severity: "critical" }),
          createFinding({ severity: "high" }),
          createFinding({ severity: "medium" }),
          createFinding({ severity: "low" }),
        ],
      });

      const result = formatReviewComment(input);

      expect(result).toContain("🔴 CRITICAL");
      expect(result).toContain("🟠 HIGH");
      expect(result).toContain("🟡 MEDIUM");
      expect(result).toContain("🔵 LOW");
    });

    it("renders file and fix columns", () => {
      const input = createInput({
        securityFindings: [
          createFinding({
            file_line: "src/db.py:42",
            suggested_fix: "Use parameterized query",
          }),
        ],
      });

      const result = formatReviewComment(input);

      expect(result).toContain("src/db.py:42");
      expect(result).toContain("Use parameterized query");
    });

    it("uses dash for missing file/fix", () => {
      const input = createInput({
        securityFindings: [
          createFinding({ file_line: "", suggested_fix: "" }),
        ],
      });

      const result = formatReviewComment(input);

      // Should have dashes for empty values
      expect(result).toMatch(/\| — \|/);
    });

    it("renders summary with severity counts", () => {
      const input = createInput({
        securityFindings: [
          createFinding({ severity: "critical" }),
          createFinding({ severity: "high" }),
        ],
        codeReviewFindings: [
          createFinding({ severity: "medium" }),
          createFinding({ severity: "medium" }),
          createFinding({ severity: "low" }),
        ],
      });

      const result = formatReviewComment(input);

      expect(result).toContain("### Summary");
      expect(result).toContain("🔴 1 critical");
      expect(result).toContain("🟠 1 high");
      expect(result).toContain("🟡 2 medium");
      expect(result).toContain("🔵 1 low");
    });
  });

  // AC5: Guardian timeout
  describe("when a guardian times out", () => {
    it("shows timeout warning for security guardian", () => {
      const input = createInput({
        securityTimedOut: true,
        codeReviewFindings: [createFinding()],
      });

      const result = formatReviewComment(input);

      expect(result).toContain("⚠️ Security Guardian timed out");
      expect(result).toContain("craig run security_scan");
    });

    it("still shows code review findings when security times out", () => {
      const input = createInput({
        securityTimedOut: true,
        codeReviewFindings: [
          createFinding({ issue: "Code smell detected" }),
        ],
      });

      const result = formatReviewComment(input);

      expect(result).toContain("Code smell detected");
      expect(result).toContain("### Code Review Findings (1)");
    });

    it("shows timeout warning for code review guardian", () => {
      const input = createInput({
        codeReviewTimedOut: true,
        securityFindings: [createFinding()],
      });

      const result = formatReviewComment(input);

      expect(result).toContain("⚠️ Code Review Guardian timed out");
    });
  });

  // Edge case: diff truncation
  describe("when diff is truncated", () => {
    it("adds truncation note to clean comment", () => {
      const input = createInput({ diffTruncated: true });

      const result = formatReviewComment(input);

      expect(result).toContain("✅ No issues found.");
      expect(result).toContain("⚠️ Diff was truncated to 5,000 lines");
    });

    it("adds truncation note to findings comment", () => {
      const input = createInput({
        diffTruncated: true,
        securityFindings: [createFinding()],
      });

      const result = formatReviewComment(input);

      expect(result).toContain("⚠️ Diff was truncated to 5,000 lines");
    });
  });

  // Edge case: both guardians time out
  describe("when both guardians time out", () => {
    it("shows both timeout warnings", () => {
      const input = createInput({
        securityTimedOut: true,
        codeReviewTimedOut: true,
      });

      const result = formatReviewComment(input);

      expect(result).toContain("⚠️ Security Guardian timed out");
      expect(result).toContain("⚠️ Code Review Guardian timed out");
    });
  });
});
