/**
 * PR Comment Formatter — Unit Tests
 *
 * Tests the pure formatting function for PR review comments.
 *
 * [TDD] Written BEFORE implementation.
 * [CLEAN-CODE] Pure function tests — no mocks needed.
 */

import { describe, it, expect } from "vitest";
import { formatPrReviewComment } from "../pr-comment-formatter.js";
import type { PrCommentInput } from "../pr-comment-formatter.js";
import type { ParsedFinding } from "../../../result-parser/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createFinding(
  overrides: Partial<ParsedFinding> = {},
): ParsedFinding {
  return {
    number: 1,
    severity: "medium",
    category: "Quality",
    file_line: "src/app.ts:10",
    issue: "Test issue",
    source_justification: "Clean Code",
    suggested_fix: "Fix it",
    ...overrides,
  };
}

function createInput(
  overrides: Partial<PrCommentInput> = {},
): PrCommentInput {
  return {
    pr_number: 10,
    pr_title: "Add feature",
    head_sha: "abc1234",
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

describe("formatPrReviewComment", () => {
  describe("Clean comment (no findings)", () => {
    it("should include PR Review header", () => {
      const result = formatPrReviewComment(createInput());
      expect(result).toContain("Craig — PR Review");
    });

    it("should include PR number", () => {
      const result = formatPrReviewComment(createInput({ pr_number: 42 }));
      expect(result).toContain("#42");
    });

    it("should include head SHA", () => {
      const result = formatPrReviewComment(createInput({ head_sha: "def5678" }));
      expect(result).toContain("def5678");
    });

    it("should show no issues message", () => {
      const result = formatPrReviewComment(createInput());
      expect(result).toContain("No issues found");
    });

    it("should show truncation warning when diff was truncated", () => {
      const result = formatPrReviewComment(
        createInput({ diffTruncated: true }),
      );
      expect(result).toContain("truncated");
    });
  });

  describe("Findings comment", () => {
    it("should include security findings section when present", () => {
      const result = formatPrReviewComment(
        createInput({
          securityFindings: [
            createFinding({
              severity: "critical",
              issue: "SQL injection",
            }),
          ],
        }),
      );
      expect(result).toContain("Security Findings");
      expect(result).toContain("SQL injection");
    });

    it("should include code review findings section when present", () => {
      const result = formatPrReviewComment(
        createInput({
          codeReviewFindings: [
            createFinding({
              severity: "medium",
              issue: "Function too long",
            }),
          ],
        }),
      );
      expect(result).toContain("Code Review Findings");
      expect(result).toContain("Function too long");
    });

    it("should include severity emoji", () => {
      const result = formatPrReviewComment(
        createInput({
          securityFindings: [
            createFinding({ severity: "critical" }),
          ],
        }),
      );
      expect(result).toContain("🔴");
    });

    it("should include summary with severity counts", () => {
      const result = formatPrReviewComment(
        createInput({
          securityFindings: [
            createFinding({ severity: "critical" }),
            createFinding({ severity: "high", number: 2 }),
          ],
          codeReviewFindings: [
            createFinding({ severity: "medium" }),
          ],
        }),
      );
      expect(result).toContain("Summary");
      expect(result).toContain("1 critical");
      expect(result).toContain("1 high");
      expect(result).toContain("1 medium");
    });
  });

  describe("Guardian timeout", () => {
    it("should show timeout message for security guardian", () => {
      const result = formatPrReviewComment(
        createInput({ securityTimedOut: true }),
      );
      expect(result).toContain("Security Guardian timed out");
    });

    it("should show timeout message for code review guardian", () => {
      const result = formatPrReviewComment(
        createInput({ codeReviewTimedOut: true }),
      );
      expect(result).toContain("Code Review Guardian timed out");
    });
  });
});
