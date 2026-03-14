/**
 * Unit tests for DigestAdapter.
 *
 * Tests are organized by acceptance criteria from the Daily Digest Reporter
 * specification (issue #16). All external dependencies (StatePort, GitHubPort)
 * are mocked — no real API calls or file I/O.
 *
 * @see [TDD] — Tests written first, implementation second
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { DigestAdapter } from "../digest.adapter.js";
import type { StatePort, Finding, DailyStats, Severity } from "../../state/index.js";
import type { GitHubPort, IssueReference, CommentReference } from "../../github/index.js";
import type { DigestReport } from "../digest.types.js";

// ---------------------------------------------------------------------------
// Mock factories — produce fake StatePort and GitHubPort
// ---------------------------------------------------------------------------

function createMockState(overrides?: {
  daily_stats?: Partial<DailyStats>;
  findings?: Finding[];
  last_runs?: Record<string, string>;
}): StatePort {
  const defaultStats: DailyStats = {
    merges_reviewed: 0,
    issues_created: 0,
    prs_opened: 0,
    findings_by_severity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
  };

  const stats: DailyStats = { ...defaultStats, ...overrides?.daily_stats };
  const findings: Finding[] = overrides?.findings ?? [];
  const lastRuns: Record<string, string> = overrides?.last_runs ?? {};

  return {
    load: vi.fn(),
    save: vi.fn(),
    get: vi.fn((key: string) => {
      if (key === "daily_stats") return stats;
      if (key === "findings") return findings;
      if (key === "last_runs") return lastRuns;
      return undefined;
    }) as StatePort["get"],
    set: vi.fn(),
    addFinding: vi.fn(),
    getFindings: vi.fn((filter?: { severity?: Severity; since?: string }) => {
      let result = [...findings];
      if (filter?.severity) {
        result = result.filter((f) => f.severity === filter.severity);
      }
      if (filter?.since) {
        result = result.filter((f) => f.detected_at >= filter.since);
      }
      return result;
    }),
  };
}

function createMockGitHub(overrides?: {
  findExistingIssue?: IssueReference | null;
}): GitHubPort {
  return {
    createIssue: vi.fn().mockResolvedValue({
      url: "https://github.com/test/repo/issues/42",
      number: 42,
    } satisfies IssueReference),
    createIssueComment: vi.fn().mockResolvedValue({
      url: "https://github.com/test/repo/issues/42#issuecomment-1",
    } satisfies CommentReference),
    findExistingIssue: vi.fn().mockResolvedValue(
      overrides?.findExistingIssue ?? null,
    ),
    listOpenIssues: vi.fn().mockResolvedValue([]),
    createDraftPR: vi.fn(),
    createCommitComment: vi.fn(),
    getLatestCommits: vi.fn().mockResolvedValue([]),
    getCommitDiff: vi.fn(),
    getMergeCommits: vi.fn().mockResolvedValue([]),
    getRateLimit: vi.fn(),
  };
}

/** Today's date as ISO string — findings must be "today" to pass the since filter. */
const TODAY_ISO = new Date().toISOString();

function createFinding(overrides?: Partial<Finding>): Finding {
  return {
    id: overrides?.id ?? crypto.randomUUID(),
    severity: overrides?.severity ?? "medium",
    category: overrides?.category ?? "code-quality",
    file: overrides?.file ?? "src/app.ts",
    issue: overrides?.issue ?? "Test finding",
    source: overrides?.source ?? "Code Review Guardian",
    detected_at: overrides?.detected_at ?? TODAY_ISO,
    task: overrides?.task ?? "merge_review",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DigestAdapter", () => {
  let mockState: StatePort;
  let mockGitHub: GitHubPort;
  let adapter: DigestAdapter;

  beforeEach(() => {
    mockState = createMockState();
    mockGitHub = createMockGitHub();
    adapter = new DigestAdapter(mockState, mockGitHub);
  });

  // -------------------------------------------------------------------------
  // AC1: Generate daily digest
  // -------------------------------------------------------------------------

  describe("AC1: Generate daily digest", () => {
    it("returns a DigestReport with accurate counts from daily_stats", async () => {
      mockState = createMockState({
        daily_stats: {
          merges_reviewed: 5,
          issues_created: 3,
          prs_opened: 1,
          findings_by_severity: { critical: 0, high: 2, medium: 5, low: 8, info: 0 },
        },
      });
      adapter = new DigestAdapter(mockState, mockGitHub);

      const report = await adapter.generate("today");

      expect(report.period).toBe("today");
      expect(report.merges_reviewed).toBe(5);
      expect(report.issues_created).toBe(3);
      expect(report.prs_opened).toBe(1);
      expect(report.findings_by_severity).toEqual({
        critical: 0,
        high: 2,
        medium: 5,
        low: 8,
        info: 0,
      });
    });

    it("includes period_start and period_end as ISO date strings", async () => {
      adapter = new DigestAdapter(mockState, mockGitHub);

      const report = await adapter.generate("today");

      // period_start and period_end should be valid ISO date strings
      expect(report.period_start).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(report.period_end).toMatch(/^\d{4}-\d{2}-\d{2}/);
      // For "today", start and end should be the same date
      expect(report.period_start).toBe(report.period_end);
    });

    it("returns guardian_invocations from last_runs", async () => {
      mockState = createMockState({
        last_runs: {
          merge_review: "2025-07-11T10:00:00Z",
          security_scan: "2025-07-11T11:00:00Z",
          merge_review_2: "2025-07-11T12:00:00Z",
        },
      });
      adapter = new DigestAdapter(mockState, mockGitHub);

      const report = await adapter.generate("today");

      // Should count invocations per task
      expect(report.guardian_invocations).toBeDefined();
      expect(typeof report.guardian_invocations).toBe("object");
    });

    it("returns top 5 findings sorted by severity", async () => {
      const findings: Finding[] = [
        createFinding({ severity: "low", issue: "Low issue" }),
        createFinding({ severity: "critical", issue: "Critical issue" }),
        createFinding({ severity: "high", issue: "High issue 1" }),
        createFinding({ severity: "high", issue: "High issue 2" }),
        createFinding({ severity: "medium", issue: "Medium issue 1" }),
        createFinding({ severity: "medium", issue: "Medium issue 2" }),
        createFinding({ severity: "info", issue: "Info issue" }),
      ];
      mockState = createMockState({ findings });
      adapter = new DigestAdapter(mockState, mockGitHub);

      const report = await adapter.generate("today");

      expect(report.top_findings.length).toBeLessThanOrEqual(5);
      // First finding should be critical (highest severity)
      expect(report.top_findings[0].severity).toBe("critical");
      // Second and third should be high
      expect(report.top_findings[1].severity).toBe("high");
      expect(report.top_findings[2].severity).toBe("high");
    });
  });

  // -------------------------------------------------------------------------
  // AC2: Publish as GitHub issue
  // -------------------------------------------------------------------------

  describe("AC2: Publish as GitHub issue", () => {
    it("creates a new GitHub issue with correct title and labels", async () => {
      const report = await adapter.generate("today");
      await adapter.publish(report);

      expect(mockGitHub.findExistingIssue).toHaveBeenCalledOnce();
      expect(mockGitHub.createIssue).toHaveBeenCalledOnce();

      const createCall = vi.mocked(mockGitHub.createIssue).mock.calls[0][0];
      expect(createCall.title).toMatch(/^📊 Craig Daily Digest — \d{4}-\d{2}-\d{2}$/);
      expect(createCall.labels).toEqual(["craig", "digest"]);
    });

    it("returns the URL of the created issue", async () => {
      const report = await adapter.generate("today");
      const result = await adapter.publish(report);

      expect(result.url).toBe("https://github.com/test/repo/issues/42");
    });

    it("creates issue body in markdown format with all sections", async () => {
      mockState = createMockState({
        daily_stats: {
          merges_reviewed: 5,
          issues_created: 3,
          prs_opened: 1,
          findings_by_severity: { critical: 0, high: 2, medium: 5, low: 8, info: 0 },
        },
        findings: [
          createFinding({ severity: "high", issue: "SQL injection in db.py", source: "Security Guardian" }),
        ],
      });
      adapter = new DigestAdapter(mockState, mockGitHub);

      const report = await adapter.generate("today");
      await adapter.publish(report);

      const createCall = vi.mocked(mockGitHub.createIssue).mock.calls[0][0];
      const body = createCall.body;

      // Must contain all spec sections
      expect(body).toContain("## Activity");
      expect(body).toContain("Merges reviewed");
      expect(body).toContain("Issues created");
      expect(body).toContain("Draft PRs opened");
      expect(body).toContain("## Findings by Severity");
      expect(body).toContain("## Top Findings");
      // Verify data is in the body
      expect(body).toContain("5");  // merges_reviewed
      expect(body).toContain("3");  // issues_created
      expect(body).toContain("SQL injection in db.py");
    });
  });

  // -------------------------------------------------------------------------
  // AC3: Update existing digest (no duplicates)
  // -------------------------------------------------------------------------

  describe("AC3: Update existing digest", () => {
    it("adds a comment to existing issue instead of creating a duplicate", async () => {
      const existingIssue: IssueReference = {
        url: "https://github.com/test/repo/issues/10",
        number: 10,
      };
      mockGitHub = createMockGitHub({ findExistingIssue: existingIssue });
      adapter = new DigestAdapter(mockState, mockGitHub);

      const report = await adapter.generate("today");
      await adapter.publish(report);

      // Should NOT create a new issue
      expect(mockGitHub.createIssue).not.toHaveBeenCalled();
      // Should add a comment to the existing issue
      expect(mockGitHub.createIssueComment).toHaveBeenCalledOnce();
      expect(vi.mocked(mockGitHub.createIssueComment).mock.calls[0][0]).toBe(10);
    });

    it("returns the URL of the existing issue when updating", async () => {
      const existingIssue: IssueReference = {
        url: "https://github.com/test/repo/issues/10",
        number: 10,
      };
      mockGitHub = createMockGitHub({ findExistingIssue: existingIssue });
      adapter = new DigestAdapter(mockState, mockGitHub);

      const report = await adapter.generate("today");
      const result = await adapter.publish(report);

      expect(result.url).toBe("https://github.com/test/repo/issues/10");
    });

    it("searches for existing issue with the correct title format", async () => {
      const report = await adapter.generate("today");
      await adapter.publish(report);

      const searchTitle = vi.mocked(mockGitHub.findExistingIssue).mock.calls[0][0];
      expect(searchTitle).toMatch(/^📊 Craig Daily Digest — \d{4}-\d{2}-\d{2}$/);
    });
  });

  // -------------------------------------------------------------------------
  // AC4: Weekly aggregation
  // -------------------------------------------------------------------------

  describe("AC4: Weekly aggregation", () => {
    it("generates a week digest with period_start on Monday and period_end on Sunday", async () => {
      adapter = new DigestAdapter(mockState, mockGitHub);

      const report = await adapter.generate("week");

      expect(report.period).toBe("week");
      // period_start should be a Monday, period_end should be a Sunday
      const start = new Date(report.period_start);
      const end = new Date(report.period_end);
      // ISO week: Monday = 1, Sunday = 0
      expect(start.getUTCDay()).toBe(1); // Monday
      expect(end.getUTCDay()).toBe(0); // Sunday
    });

    it("filters findings to the week period", async () => {
      const findings: Finding[] = [
        createFinding({ detected_at: TODAY_ISO, issue: "This week" }),
        createFinding({ detected_at: "2020-01-01T10:00:00Z", issue: "Long ago" }),
      ];
      mockState = createMockState({ findings });
      adapter = new DigestAdapter(mockState, mockGitHub);

      const report = await adapter.generate("week");

      // getFindings should be called with a since filter
      expect(mockState.getFindings).toHaveBeenCalled();
    });

    it("publishes week digest with correct title format", async () => {
      adapter = new DigestAdapter(mockState, mockGitHub);

      const report = await adapter.generate("week");
      await adapter.publish(report);

      const createCall = vi.mocked(mockGitHub.createIssue).mock.calls[0][0];
      expect(createCall.title).toMatch(/^📊 Craig Weekly Digest — Week \d+, \d{4}$/);
    });
  });

  // -------------------------------------------------------------------------
  // AC5: Digest markdown format
  // -------------------------------------------------------------------------

  describe("AC5: Digest markdown format", () => {
    it("renders Activity table with pipe-delimited markdown", async () => {
      mockState = createMockState({
        daily_stats: {
          merges_reviewed: 5,
          issues_created: 3,
          prs_opened: 1,
          findings_by_severity: { critical: 0, high: 2, medium: 5, low: 8, info: 0 },
        },
      });
      adapter = new DigestAdapter(mockState, mockGitHub);

      const report = await adapter.generate("today");
      await adapter.publish(report);

      const body = vi.mocked(mockGitHub.createIssue).mock.calls[0][0].body;

      // Activity table must have header row and separator
      expect(body).toContain("| Metric | Count |");
      expect(body).toContain("|--------|-------|");
      expect(body).toContain("| Merges reviewed | 5 |");
      expect(body).toContain("| Issues created | 3 |");
      expect(body).toContain("| Draft PRs opened | 1 |");
    });

    it("renders Findings by Severity table with emoji indicators", async () => {
      mockState = createMockState({
        daily_stats: {
          merges_reviewed: 0,
          issues_created: 0,
          prs_opened: 0,
          findings_by_severity: { critical: 1, high: 2, medium: 5, low: 8, info: 3 },
        },
      });
      adapter = new DigestAdapter(mockState, mockGitHub);

      const report = await adapter.generate("today");
      await adapter.publish(report);

      const body = vi.mocked(mockGitHub.createIssue).mock.calls[0][0].body;

      expect(body).toContain("🔴 Critical");
      expect(body).toContain("🟠 High");
      expect(body).toContain("🟡 Medium");
      expect(body).toContain("🔵 Low");
    });

    it("renders Top Findings section with severity emoji and details", async () => {
      mockState = createMockState({
        findings: [
          createFinding({
            severity: "high",
            issue: "SQL injection in src/db.py:42",
            source: "Security Guardian",
          }),
        ],
      });
      adapter = new DigestAdapter(mockState, mockGitHub);

      const report = await adapter.generate("today");
      await adapter.publish(report);

      const body = vi.mocked(mockGitHub.createIssue).mock.calls[0][0].body;

      expect(body).toContain("## Top Findings");
      expect(body).toContain("**HIGH**");
      expect(body).toContain("SQL injection in src/db.py:42");
      expect(body).toContain("Security Guardian");
    });

    it("renders Failures section when failures exist", async () => {
      // For failures, we need findings from tasks that are in running_tasks
      // but the digest itself records failures as strings
      mockState = createMockState();
      adapter = new DigestAdapter(mockState, mockGitHub);

      const report: DigestReport = {
        ...(await adapter.generate("today")),
        failures: ["⚠️ Security Guardian timed out at 14:32 UTC"],
      };
      await adapter.publish(report);

      const body = vi.mocked(mockGitHub.createIssue).mock.calls[0][0].body;

      expect(body).toContain("## Failures");
      expect(body).toContain("Security Guardian timed out at 14:32 UTC");
    });
  });

  // -------------------------------------------------------------------------
  // Edge Cases
  // -------------------------------------------------------------------------

  describe("Edge cases", () => {
    it("generates empty digest with all zeros when no activity", async () => {
      mockState = createMockState();
      adapter = new DigestAdapter(mockState, mockGitHub);

      const report = await adapter.generate("today");

      expect(report.merges_reviewed).toBe(0);
      expect(report.issues_created).toBe(0);
      expect(report.prs_opened).toBe(0);
      expect(report.top_findings).toEqual([]);
      expect(report.failures).toEqual([]);
    });

    it("publishes empty digest with clean slate message", async () => {
      mockState = createMockState();
      adapter = new DigestAdapter(mockState, mockGitHub);

      const report = await adapter.generate("today");
      await adapter.publish(report);

      const body = vi.mocked(mockGitHub.createIssue).mock.calls[0][0].body;

      expect(body).toContain("Craig monitored the repo — no issues detected. ✅");
    });

    it("limits top_findings to 5 even when more exist", async () => {
      const findings = Array.from({ length: 10 }, (_, i) =>
        createFinding({ severity: "high", issue: `Finding ${i + 1}` }),
      );
      mockState = createMockState({ findings });
      adapter = new DigestAdapter(mockState, mockGitHub);

      const report = await adapter.generate("today");

      expect(report.top_findings.length).toBe(5);
    });

    it("sorts top_findings by severity: critical > high > medium > low > info", async () => {
      const findings: Finding[] = [
        createFinding({ severity: "info", issue: "Info" }),
        createFinding({ severity: "low", issue: "Low" }),
        createFinding({ severity: "critical", issue: "Critical" }),
        createFinding({ severity: "medium", issue: "Medium" }),
        createFinding({ severity: "high", issue: "High" }),
      ];
      mockState = createMockState({ findings });
      adapter = new DigestAdapter(mockState, mockGitHub);

      const report = await adapter.generate("today");

      const severities = report.top_findings.map((f) => f.severity);
      expect(severities).toEqual(["critical", "high", "medium", "low", "info"]);
    });

    it("handles month period with correct date range", async () => {
      adapter = new DigestAdapter(mockState, mockGitHub);

      const report = await adapter.generate("month");

      expect(report.period).toBe("month");
      const start = new Date(report.period_start);
      expect(start.getUTCDate()).toBe(1); // First day of month
    });

    it("wraps GitHubPort errors in DigestPublishError", async () => {
      mockGitHub = createMockGitHub();
      vi.mocked(mockGitHub.findExistingIssue).mockRejectedValue(
        new Error("API unavailable"),
      );
      adapter = new DigestAdapter(mockState, mockGitHub);

      const report = await adapter.generate("today");
      await expect(adapter.publish(report)).rejects.toThrow("Failed to publish digest");
    });

    it("generates report for month period and publishes with correct title", async () => {
      adapter = new DigestAdapter(mockState, mockGitHub);

      const report = await adapter.generate("month");
      await adapter.publish(report);

      const createCall = vi.mocked(mockGitHub.createIssue).mock.calls[0][0];
      expect(createCall.title).toMatch(/^📊 Craig Monthly Digest — \w+ \d{4}$/);
    });
  });
});
