/**
 * Coverage Scan Analyzer — Unit Tests
 *
 * TDD Red → Green → Refactor: These tests were written BEFORE the implementation.
 *
 * Test coverage:
 * - AC1: Invoke QA Guardian with coverage analysis prompt
 * - AC2: Created issues include Given/When/Then acceptance criteria
 * - AC3: No test framework → single "Setup test framework" issue
 * - Edge: 100% coverage → no issues, log "full coverage"
 * - Edge: Copilot invocation failure → graceful error result
 * - Edge: Duplicate issue → skip creation
 * - Edge: GitHub API failure → graceful error in result
 *
 * @see [TDD] — Tests written first, implementation second
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { CoverageScanAnalyzer } from "../coverage-scan.adapter.js";
import type { CoverageScanDeps } from "../coverage-scan.types.js";
import type { AnalyzerContext } from "../../analyzer.types.js";
import type { CopilotPort } from "../../../copilot/index.js";
import type { GitHubPort } from "../../../github/index.js";
import type { ResultParserPort } from "../../../result-parser/index.js";
import type { StatePort } from "../../../state/index.js";
import type { InvokeResult } from "../../../copilot/index.js";
import type { ParsedReport, CoverageGap } from "../../../result-parser/index.js";

// ---------------------------------------------------------------------------
// QA Guardian report fixtures
// ---------------------------------------------------------------------------

const QA_REPORT_WITH_GAPS = `## QA Guardian — Coverage Analysis

### Summary
Found 2 coverage gaps in the repository. Error paths and edge cases need testing.

### Coverage Gaps Found
| Gap | Risk | Status |
|-----|------|--------|
| No tests for error paths in /upload endpoint | 🟠 HIGH | ⚠️ Not covered |
| Missing edge case test for empty input in parser | 🟡 MEDIUM | ⚠️ Not covered |

### Recommended Actions
- [ ] **Add tests** for upload error paths
- [ ] **Add tests** for parser empty input
`;

const QA_REPORT_FULL_COVERAGE = `## QA Guardian — Coverage Analysis

### Summary
All code paths are covered. No coverage gaps found.

### Coverage Gaps Found
| Gap | Risk | Status |
|-----|------|--------|

### Recommended Actions
- [ ] **Continue** with current testing practices
`;

const QA_REPORT_NO_TEST_FRAMEWORK = `## QA Guardian — Coverage Analysis

### Summary
No test framework detected in this repository. No test files found.

### Recommended Actions
- [ ] **Setup test framework** for the project
`;

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockCopilot(
  invokeResult?: Partial<InvokeResult>,
): CopilotPort {
  const defaultResult: InvokeResult = {
    success: true,
    output: QA_REPORT_WITH_GAPS,
    duration_ms: 2000,
    model_used: "claude-sonnet-4.5",
  };

  return {
    invoke: vi.fn().mockResolvedValue({ ...defaultResult, ...invokeResult }),
    isAvailable: vi.fn().mockResolvedValue(true),
  };
}

function createMockGitHub(): GitHubPort {
  return {
    createIssue: vi.fn().mockResolvedValue({
      url: "https://github.com/owner/repo/issues/42",
      number: 42,
    }),
    findExistingIssue: vi.fn().mockResolvedValue(null),
    listOpenIssues: vi.fn().mockResolvedValue([]),
    createDraftPR: vi.fn(),
    createCommitComment: vi.fn(),
    getLatestCommits: vi.fn(),
    getCommitDiff: vi.fn(),
    getMergeCommits: vi.fn(),
    getRateLimit: vi.fn(),
  };
}

function createMockParser(
  report?: Partial<ParsedReport>,
): ResultParserPort {
  const defaultReport: ParsedReport = {
    guardian: "qa",
    summary:
      "Found 2 coverage gaps in the repository. Error paths and edge cases need testing.",
    findings: [],
    recommended_actions: [
      "**Add tests** for upload error paths",
      "**Add tests** for parser empty input",
    ],
    coverage_gaps: [
      {
        gap: "No tests for error paths in /upload endpoint",
        risk: "high",
        status: "⚠️ Not covered",
      },
      {
        gap: "Missing edge case test for empty input in parser",
        risk: "medium",
        status: "⚠️ Not covered",
      },
    ],
    raw: QA_REPORT_WITH_GAPS,
  };

  return {
    parse: vi.fn().mockReturnValue({ ...defaultReport, ...report }),
  };
}

function createMockState(): StatePort {
  return {
    load: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockReturnValue([]),
    set: vi.fn(),
    addFinding: vi.fn(),
    getFindings: vi.fn().mockReturnValue([]),
  };
}

function createDefaultContext(): AnalyzerContext {
  return {
    task: "coverage_scan",
    taskId: "test-id",
    timestamp: new Date().toISOString(),
  };
}

function createDeps(overrides?: Partial<CoverageScanDeps>): CoverageScanDeps {
  return {
    copilot: createMockCopilot(),
    github: createMockGitHub(),
    parser: createMockParser(),
    state: createMockState(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// AC1: Invoke QA Guardian with coverage analysis prompt
// ---------------------------------------------------------------------------

describe("AC1: Invoke QA Guardian with coverage analysis prompt", () => {
  let deps: CoverageScanDeps;
  let analyzer: CoverageScanAnalyzer;
  let context: AnalyzerContext;

  beforeEach(() => {
    deps = createDeps();
    analyzer = new CoverageScanAnalyzer(deps);
    context = createDefaultContext();
  });

  it("should have name 'coverage-scan'", () => {
    expect(analyzer.name).toBe("coverage-scan");
  });

  it("should invoke QA Guardian agent via CopilotPort", async () => {
    await analyzer.execute(context);

    expect(deps.copilot.invoke).toHaveBeenCalledTimes(1);
    expect(deps.copilot.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "qa-guardian",
      }),
    );
  });

  it("should include coverage analysis prompt in invocation", async () => {
    await analyzer.execute(context);

    const invokeCall = vi.mocked(deps.copilot.invoke).mock.calls[0]![0];
    expect(invokeCall.prompt).toContain(
      "Analyze this repository for test coverage gaps",
    );
    expect(invokeCall.prompt).toContain("untested code paths");
    expect(invokeCall.prompt).toContain("missing edge cases");
    expect(invokeCall.prompt).toContain("functions without tests");
  });

  it("should parse the QA Guardian response", async () => {
    await analyzer.execute(context);

    expect(deps.parser.parse).toHaveBeenCalledTimes(1);
    expect(deps.parser.parse).toHaveBeenCalledWith(
      QA_REPORT_WITH_GAPS,
      "qa",
    );
  });

  it("should return success result with findings", async () => {
    const result = await analyzer.execute(context);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.findings.length).toBe(2);
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    }
  });

  it("should support manual trigger", async () => {
    const manualContext: AnalyzerContext = {
      task: "coverage_scan",
      taskId: "manual-test-id",
      timestamp: new Date().toISOString(),
    };

    const result = await analyzer.execute(manualContext);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC2: Issues include Given/When/Then acceptance criteria
// ---------------------------------------------------------------------------

describe("AC2: Issues include Given/When/Then acceptance criteria", () => {
  let deps: CoverageScanDeps;
  let analyzer: CoverageScanAnalyzer;
  let context: AnalyzerContext;

  beforeEach(() => {
    deps = createDeps();
    analyzer = new CoverageScanAnalyzer(deps);
    context = createDefaultContext();
  });

  it("should create a GitHub issue for each coverage gap", async () => {
    await analyzer.execute(context);

    expect(deps.github.createIssue).toHaveBeenCalledTimes(2);
  });

  it("should include Given/When/Then in issue body", async () => {
    await analyzer.execute(context);

    const firstCall = vi.mocked(deps.github.createIssue).mock.calls[0]![0];
    expect(firstCall.body).toContain("Given");
    expect(firstCall.body).toContain("When");
    expect(firstCall.body).toContain("Then");
  });

  it("should include gap description in issue title", async () => {
    await analyzer.execute(context);

    const firstCall = vi.mocked(deps.github.createIssue).mock.calls[0]![0];
    expect(firstCall.title).toContain(
      "No tests for error paths in /upload endpoint",
    );
  });

  it("should include 'coverage-gap' label on issues", async () => {
    await analyzer.execute(context);

    const firstCall = vi.mocked(deps.github.createIssue).mock.calls[0]![0];
    expect(firstCall.labels).toContain("coverage-gap");
  });

  it("should include severity-based label on issues", async () => {
    await analyzer.execute(context);

    const calls = vi.mocked(deps.github.createIssue).mock.calls;

    // First gap is HIGH risk
    expect(calls[0]![0].labels).toContain("priority:high");

    // Second gap is MEDIUM risk
    expect(calls[1]![0].labels).toContain("priority:medium");
  });

  it("should include 'craig' label on issues", async () => {
    await analyzer.execute(context);

    const firstCall = vi.mocked(deps.github.createIssue).mock.calls[0]![0];
    expect(firstCall.labels).toContain("craig");
  });

  it("should track findings with correct severity and category", async () => {
    const result = await analyzer.execute(context);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.findings[0]!.severity).toBe("high");
      expect(result.findings[0]!.category).toBe("coverage-gap");
      expect(result.findings[0]!.issue).toContain("/upload endpoint");
      expect(result.findings[0]!.source).toBe("qa-guardian");
    }
  });

  it("should record issue count in summary", async () => {
    const result = await analyzer.execute(context);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.summary).toContain("2");
    }
  });

  it("should include gap description and risk in issue body", async () => {
    await analyzer.execute(context);

    const firstCall = vi.mocked(deps.github.createIssue).mock.calls[0]![0];
    expect(firstCall.body).toContain("/upload endpoint");
    expect(firstCall.body).toMatch(/risk|severity/i);
  });
});

// ---------------------------------------------------------------------------
// AC3: No test framework detected
// ---------------------------------------------------------------------------

describe("AC3: No test framework detected", () => {
  let deps: CoverageScanDeps;
  let analyzer: CoverageScanAnalyzer;
  let context: AnalyzerContext;

  beforeEach(() => {
    const parser = createMockParser({
      summary: "No test framework detected in this repository. No test files found.",
      coverage_gaps: undefined,
      findings: [],
      recommended_actions: ["**Setup test framework** for the project"],
    });

    deps = createDeps({ parser });
    analyzer = new CoverageScanAnalyzer(deps);
    context = createDefaultContext();
  });

  it("should create a single 'Setup test framework' issue", async () => {
    await analyzer.execute(context);

    expect(deps.github.createIssue).toHaveBeenCalledTimes(1);
    const call = vi.mocked(deps.github.createIssue).mock.calls[0]![0];
    expect(call.title).toMatch(/setup test framework/i);
  });

  it("should include language recommendations in the issue body", async () => {
    await analyzer.execute(context);

    const call = vi.mocked(deps.github.createIssue).mock.calls[0]![0];
    expect(call.body).toMatch(/test framework/i);
  });

  it("should return exactly one finding", async () => {
    const result = await analyzer.execute(context);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.findings).toHaveLength(1);
      expect(result.summary).toMatch(/issue|framework/i);
    }
  });
});

// ---------------------------------------------------------------------------
// Edge: 100% coverage → No issues created
// ---------------------------------------------------------------------------

describe("Edge: Full coverage — no issues created", () => {
  let deps: CoverageScanDeps;
  let analyzer: CoverageScanAnalyzer;
  let context: AnalyzerContext;

  beforeEach(() => {
    const parser = createMockParser({
      summary: "All code paths are covered. No coverage gaps found.",
      coverage_gaps: [],
      findings: [],
      recommended_actions: [],
    });

    deps = createDeps({ parser });
    analyzer = new CoverageScanAnalyzer(deps);
    context = createDefaultContext();
  });

  it("should not create any issues", async () => {
    await analyzer.execute(context);

    expect(deps.github.createIssue).not.toHaveBeenCalled();
  });

  it("should return success with zero findings", async () => {
    const result = await analyzer.execute(context);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.findings).toHaveLength(0);
      expect(result.summary.toLowerCase()).toContain("no gaps");
    }
  });

  it("should include 'full coverage' in summary", async () => {
    const result = await analyzer.execute(context);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.summary.toLowerCase()).toContain("full coverage");
    }
  });
});

// ---------------------------------------------------------------------------
// Edge: Copilot invocation failure
// ---------------------------------------------------------------------------

describe("Edge: Copilot invocation failure", () => {
  let deps: CoverageScanDeps;
  let analyzer: CoverageScanAnalyzer;
  let context: AnalyzerContext;

  beforeEach(() => {
    const copilot = createMockCopilot();
    vi.mocked(copilot.invoke).mockResolvedValue({
      success: false,
      output: "",
      duration_ms: 500,
      model_used: "claude-sonnet-4.5",
      error: "Copilot session timed out",
    });

    deps = createDeps({ copilot });
    analyzer = new CoverageScanAnalyzer(deps);
    context = createDefaultContext();
  });

  it("should return failure result", async () => {
    const result = await analyzer.execute(context);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.summary).toContain("Copilot");
    }
  });

  it("should not create any issues", async () => {
    await analyzer.execute(context);

    expect(deps.github.createIssue).not.toHaveBeenCalled();
  });

  it("should not call the parser", async () => {
    await analyzer.execute(context);

    expect(deps.parser.parse).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Edge: Duplicate issue already exists
// ---------------------------------------------------------------------------

describe("Edge: Duplicate issue already exists", () => {
  let deps: CoverageScanDeps;
  let analyzer: CoverageScanAnalyzer;
  let context: AnalyzerContext;

  beforeEach(() => {
    const github = createMockGitHub();
    // First gap already has an issue, second does not
    vi.mocked(github.findExistingIssue)
      .mockResolvedValueOnce({
        url: "https://github.com/owner/repo/issues/10",
        number: 10,
      })
      .mockResolvedValueOnce(null);

    deps = createDeps({ github });
    analyzer = new CoverageScanAnalyzer(deps);
    context = createDefaultContext();
  });

  it("should skip creating issue for existing gap", async () => {
    const result = await analyzer.execute(context);

    // Only one createIssue call (for the second gap)
    expect(deps.github.createIssue).toHaveBeenCalledTimes(1);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.summary).toContain("1");
      expect(result.summary).toMatch(/skip/i);
    }
  });

  it("should still include skipped gap in findings", async () => {
    const result = await analyzer.execute(context);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.findings).toHaveLength(2);
    }
  });
});

// ---------------------------------------------------------------------------
// Edge: GitHub API failure during issue creation
// ---------------------------------------------------------------------------

describe("Edge: GitHub API failure during issue creation", () => {
  let deps: CoverageScanDeps;
  let analyzer: CoverageScanAnalyzer;
  let context: AnalyzerContext;

  beforeEach(() => {
    const github = createMockGitHub();
    vi.mocked(github.createIssue).mockRejectedValue(
      new Error("GitHub API error (500): Internal Server Error"),
    );

    deps = createDeps({ github });
    analyzer = new CoverageScanAnalyzer(deps);
    context = createDefaultContext();
  });

  it("should return failure result when issue creation fails", async () => {
    const result = await analyzer.execute(context);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.summary).toContain("GitHub");
    }
  });
});

// ---------------------------------------------------------------------------
// State tracking
// ---------------------------------------------------------------------------

describe("State tracking", () => {
  let deps: CoverageScanDeps;
  let analyzer: CoverageScanAnalyzer;
  let context: AnalyzerContext;

  beforeEach(() => {
    deps = createDeps();
    analyzer = new CoverageScanAnalyzer(deps);
    context = createDefaultContext();
  });

  it("should add findings to state", async () => {
    await analyzer.execute(context);

    expect(deps.state.addFinding).toHaveBeenCalledTimes(2);
  });

  it("should save state after analysis", async () => {
    await analyzer.execute(context);

    expect(deps.state.save).toHaveBeenCalled();
  });

  it("should record finding with correct source", async () => {
    await analyzer.execute(context);

    const firstCall = vi.mocked(deps.state.addFinding).mock.calls[0]![0];
    expect(firstCall.source).toBe("qa-guardian");
    expect(firstCall.task).toBe("coverage_scan");
  });
});

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

describe("Factory function: createCoverageScanAnalyzer", () => {
  it("should create an analyzer instance via factory", async () => {
    // Import at top level already, but test the factory
    const { createCoverageScanAnalyzer } = await import(
      "../coverage-scan.adapter.js"
    );

    const deps = createDeps();
    const analyzer = createCoverageScanAnalyzer(deps);

    expect(analyzer.name).toBe("coverage-scan");
  });

  it("should return AnalyzerPort interface", async () => {
    const { createCoverageScanAnalyzer } = await import(
      "../coverage-scan.adapter.js"
    );

    const deps = createDeps();
    const analyzer = createCoverageScanAnalyzer(deps);

    expect(typeof analyzer.execute).toBe("function");
    expect(typeof analyzer.name).toBe("string");
  });
});
