/**
 * TechDebtAnalyzer — Unit Tests
 *
 * Tests the tech debt audit orchestration flow:
 * AC1: Invokes PO Guardian in audit mode with correct prompt
 * AC2: Creates categorized issues (docs, dependencies, process)
 * AC3: Maps priority (critical→high, medium→medium, low→low)
 * Edge: PO Guardian timeout, no findings, duplicate issue prevention
 *
 * [TDD] Written BEFORE implementation. All deps are mocked.
 *
 * @see https://github.com/vbomfim/sdlc-guardian-agents/issues/12
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTechDebtAnalyzer } from "../tech-debt.analyzer.js";
import type { CopilotPort } from "../../../copilot/index.js";
import type { GitHubPort } from "../../../github/index.js";
import type { StatePort } from "../../../state/index.js";
import type {
  ResultParserPort,
  ParsedReport,
  ParsedFinding,
} from "../../../result-parser/index.js";
import type { AnalyzerContext } from "../../analyzer.port.js";
import type { InvokeResult } from "../../../copilot/index.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Simulated PO Guardian audit findings across 3 categories. */
const AUDIT_FINDINGS: ParsedFinding[] = [
  {
    number: 1,
    severity: "high",
    category: "docs",
    file_line: "README.md",
    issue: "Missing API documentation for /users endpoint",
    source_justification: "Project health checklist item #3",
    suggested_fix: "Add OpenAPI spec and endpoint docs to README",
  },
  {
    number: 2,
    severity: "medium",
    category: "dependencies",
    file_line: "package.json",
    issue: "3 dependencies are 2+ major versions behind",
    source_justification: "Project health checklist item #12",
    suggested_fix: "Run `npm outdated` and update stale packages",
  },
  {
    number: 3,
    severity: "low",
    category: "process",
    file_line: "src/auth.ts:42",
    issue: "TODO comment without linked issue: // TODO: implement rate limiting",
    source_justification: "Project health checklist item #18",
    suggested_fix: "Create a GitHub issue and replace TODO with issue reference",
  },
  {
    number: 4,
    severity: "critical",
    category: "docs",
    file_line: "",
    issue: "No ARCHITECTURE.md — project structure is undocumented",
    source_justification: "Project health checklist item #1",
    suggested_fix: "Create ARCHITECTURE.md documenting component boundaries",
  },
  {
    number: 5,
    severity: "medium",
    category: "process",
    file_line: ".github/workflows/ci.yml",
    issue: "CI pipeline missing security scan step",
    source_justification: "Project health checklist item #20",
    suggested_fix: "Add SAST/DAST scanning to CI workflow",
  },
];

/** Parsed PO Guardian report with 5 findings across 3 categories. */
const AUDIT_REPORT: ParsedReport = {
  guardian: "po",
  summary: "Project health audit found 5 gaps across 3 categories.",
  findings: AUDIT_FINDINGS,
  recommended_actions: [
    "Create ARCHITECTURE.md",
    "Update stale dependencies",
    "Convert TODO comments to issues",
  ],
  raw: "## PO Guardian Report\n### Summary\nProject health audit found 5 gaps.",
};

/** Empty PO Guardian report — no findings. */
const CLEAN_REPORT: ParsedReport = {
  guardian: "po",
  summary: "Project health audit passed all 25 checks.",
  findings: [],
  recommended_actions: [],
  raw: "## PO Guardian Report\n### Summary\nAll checks passed.",
};

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockCopilot(): CopilotPort {
  return {
    invoke: vi.fn().mockResolvedValue({
      success: true,
      output: AUDIT_REPORT.raw,
      duration_ms: 8_000,
      model_used: "claude-sonnet-4.5",
    } satisfies InvokeResult),
    isAvailable: vi.fn().mockResolvedValue(true),
  };
}

function createMockGitHub(): GitHubPort {
  return {
    createIssue: vi.fn().mockResolvedValue({
      url: "https://github.com/owner/repo/issues/100",
      number: 100,
    }),
    findExistingIssue: vi.fn().mockResolvedValue(null),
    listOpenIssues: vi.fn().mockResolvedValue([]),
    createDraftPR: vi.fn().mockResolvedValue({
      url: "https://github.com/owner/repo/pull/1",
      number: 1,
    }),
    createCommitComment: vi.fn().mockResolvedValue({
      url: "https://github.com/owner/repo/commit/abc#comment",
    }),
    getLatestCommits: vi.fn().mockResolvedValue([]),
    getCommitDiff: vi.fn().mockResolvedValue({
      sha: "abc1234",
      files: [],
    }),
    getMergeCommits: vi.fn().mockResolvedValue([]),
    getRateLimit: vi.fn().mockResolvedValue({
      remaining: 5000,
      reset: new Date(),
    }),
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

function createMockParser(): ResultParserPort {
  return {
    parse: vi.fn().mockReturnValue(AUDIT_REPORT),
  };
}

function createScheduleContext(): AnalyzerContext {
  return { trigger: "schedule" };
}

function createManualContext(): AnalyzerContext {
  return { trigger: "manual" };
}

// ---------------------------------------------------------------------------
// AC1: Weekly tech debt audit — invokes PO Guardian
// ---------------------------------------------------------------------------

describe("AC1: Invokes PO Guardian in audit mode", () => {
  let copilot: CopilotPort;
  let github: GitHubPort;
  let state: StatePort;
  let parser: ResultParserPort;

  beforeEach(() => {
    copilot = createMockCopilot();
    github = createMockGitHub();
    state = createMockState();
    parser = createMockParser();
  });

  it("should invoke PO Guardian with the audit prompt", async () => {
    const analyzer = createTechDebtAnalyzer({
      copilot,
      github,
      state,
      parser,
    });

    await analyzer.execute(createScheduleContext());

    expect(copilot.invoke).toHaveBeenCalledTimes(1);
    expect(copilot.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "po-guardian",
        prompt: expect.stringContaining("Audit this project"),
      }),
    );
  });

  it("should include all checklist items in the prompt", async () => {
    const analyzer = createTechDebtAnalyzer({
      copilot,
      github,
      state,
      parser,
    });

    await analyzer.execute(createScheduleContext());

    const invokeCall = vi.mocked(copilot.invoke).mock.calls[0]![0];
    expect(invokeCall.prompt).toContain("missing docs");
    expect(invokeCall.prompt).toContain("stale dependencies");
    expect(invokeCall.prompt).toContain("TODO comments");
    expect(invokeCall.prompt).toContain("incomplete specs");
    expect(invokeCall.prompt).toContain("25-item project health checklist");
  });

  it("should parse the PO Guardian response", async () => {
    const analyzer = createTechDebtAnalyzer({
      copilot,
      github,
      state,
      parser,
    });

    await analyzer.execute(createScheduleContext());

    expect(parser.parse).toHaveBeenCalledTimes(1);
    expect(parser.parse).toHaveBeenCalledWith(AUDIT_REPORT.raw, "po");
  });

  it("should return task name as tech_debt_audit", async () => {
    const analyzer = createTechDebtAnalyzer({
      copilot,
      github,
      state,
      parser,
    });

    const result = await analyzer.execute(createScheduleContext());

    expect(result.task).toBe("tech_debt_audit");
  });

  it("should have name property set to tech_debt_audit", () => {
    const analyzer = createTechDebtAnalyzer({
      copilot,
      github,
      state,
      parser,
    });

    expect(analyzer.name).toBe("tech_debt_audit");
  });

  it("should work with manual trigger", async () => {
    const analyzer = createTechDebtAnalyzer({
      copilot,
      github,
      state,
      parser,
    });

    const result = await analyzer.execute(createManualContext());

    expect(result.success).toBe(true);
    expect(copilot.invoke).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// AC2: Categorized issues — each issue has a category label
// ---------------------------------------------------------------------------

describe("AC2: Creates categorized issues with labels", () => {
  let copilot: CopilotPort;
  let github: GitHubPort;
  let state: StatePort;
  let parser: ResultParserPort;

  beforeEach(() => {
    copilot = createMockCopilot();
    github = createMockGitHub();
    state = createMockState();
    parser = createMockParser();
  });

  it("should create a GitHub issue for each finding", async () => {
    const analyzer = createTechDebtAnalyzer({
      copilot,
      github,
      state,
      parser,
    });

    await analyzer.execute(createScheduleContext());

    // 5 findings → 5 issues (no duplicates exist)
    expect(github.createIssue).toHaveBeenCalledTimes(5);
  });

  it("should include category label on each issue", async () => {
    const analyzer = createTechDebtAnalyzer({
      copilot,
      github,
      state,
      parser,
    });

    await analyzer.execute(createScheduleContext());

    const calls = vi.mocked(github.createIssue).mock.calls;

    // Finding 1: category "docs" → label "tech-debt:docs"
    expect(calls[0]![0].labels).toContain("tech-debt:docs");

    // Finding 2: category "dependencies" → label "tech-debt:dependencies"
    expect(calls[1]![0].labels).toContain("tech-debt:dependencies");

    // Finding 3: category "process" → label "tech-debt:process"
    expect(calls[2]![0].labels).toContain("tech-debt:process");
  });

  it("should include 'craig' label on every issue", async () => {
    const analyzer = createTechDebtAnalyzer({
      copilot,
      github,
      state,
      parser,
    });

    await analyzer.execute(createScheduleContext());

    const calls = vi.mocked(github.createIssue).mock.calls;

    for (const call of calls) {
      expect(call[0].labels).toContain("craig");
    }
  });

  it("should include 'tech-debt' label on every issue", async () => {
    const analyzer = createTechDebtAnalyzer({
      copilot,
      github,
      state,
      parser,
    });

    await analyzer.execute(createScheduleContext());

    const calls = vi.mocked(github.createIssue).mock.calls;

    for (const call of calls) {
      expect(call[0].labels).toContain("tech-debt");
    }
  });

  it("should set a descriptive title with [Craig] prefix and category", async () => {
    const analyzer = createTechDebtAnalyzer({
      copilot,
      github,
      state,
      parser,
    });

    await analyzer.execute(createScheduleContext());

    const calls = vi.mocked(github.createIssue).mock.calls;

    // First finding: docs category
    expect(calls[0]![0].title).toContain("[Craig]");
    expect(calls[0]![0].title).toContain("Missing API documentation");
  });

  it("should include finding details in the issue body", async () => {
    const analyzer = createTechDebtAnalyzer({
      copilot,
      github,
      state,
      parser,
    });

    await analyzer.execute(createScheduleContext());

    const calls = vi.mocked(github.createIssue).mock.calls;
    const firstBody = calls[0]![0].body;

    expect(firstBody).toContain("docs");
    expect(firstBody).toContain("README.md");
    expect(firstBody).toContain("Missing API documentation");
    expect(firstBody).toContain("Suggested Fix");
  });
});

// ---------------------------------------------------------------------------
// AC3: Priority mapping — severity → priority labels
// ---------------------------------------------------------------------------

describe("AC3: Priority mapping via labels", () => {
  let copilot: CopilotPort;
  let github: GitHubPort;
  let state: StatePort;
  let parser: ResultParserPort;

  beforeEach(() => {
    copilot = createMockCopilot();
    github = createMockGitHub();
    state = createMockState();
    parser = createMockParser();
  });

  it("should map critical severity to priority:high label", async () => {
    const analyzer = createTechDebtAnalyzer({
      copilot,
      github,
      state,
      parser,
    });

    await analyzer.execute(createScheduleContext());

    const calls = vi.mocked(github.createIssue).mock.calls;

    // Finding 4 is critical → priority:high
    const criticalCall = calls.find(
      (c) => c[0].title.includes("ARCHITECTURE.md"),
    );
    expect(criticalCall).toBeDefined();
    expect(criticalCall![0].labels).toContain("priority:high");
  });

  it("should map high severity to priority:high label", async () => {
    const analyzer = createTechDebtAnalyzer({
      copilot,
      github,
      state,
      parser,
    });

    await analyzer.execute(createScheduleContext());

    const calls = vi.mocked(github.createIssue).mock.calls;

    // Finding 1 is high → priority:high
    const highCall = calls.find(
      (c) => c[0].title.includes("Missing API documentation"),
    );
    expect(highCall).toBeDefined();
    expect(highCall![0].labels).toContain("priority:high");
  });

  it("should map medium severity to priority:medium label", async () => {
    const analyzer = createTechDebtAnalyzer({
      copilot,
      github,
      state,
      parser,
    });

    await analyzer.execute(createScheduleContext());

    const calls = vi.mocked(github.createIssue).mock.calls;

    // Finding 2 is medium → priority:medium
    const mediumCall = calls.find(
      (c) => c[0].title.includes("dependencies are 2+"),
    );
    expect(mediumCall).toBeDefined();
    expect(mediumCall![0].labels).toContain("priority:medium");
  });

  it("should map low severity to priority:low label", async () => {
    const analyzer = createTechDebtAnalyzer({
      copilot,
      github,
      state,
      parser,
    });

    await analyzer.execute(createScheduleContext());

    const calls = vi.mocked(github.createIssue).mock.calls;

    // Finding 3 is low → priority:low
    const lowCall = calls.find(
      (c) => c[0].title.includes("TODO comment"),
    );
    expect(lowCall).toBeDefined();
    expect(lowCall![0].labels).toContain("priority:low");
  });

  it("should map info severity to priority:low label", async () => {
    const infoFinding: ParsedFinding = {
      number: 1,
      severity: "info",
      category: "docs",
      file_line: "",
      issue: "Consider adding a CHANGELOG.md",
      source_justification: "Nice to have",
      suggested_fix: "Create CHANGELOG.md",
    };

    vi.mocked(parser.parse).mockReturnValue({
      ...AUDIT_REPORT,
      findings: [infoFinding],
    });

    const analyzer = createTechDebtAnalyzer({
      copilot,
      github,
      state,
      parser,
    });

    await analyzer.execute(createScheduleContext());

    const calls = vi.mocked(github.createIssue).mock.calls;
    expect(calls[0]![0].labels).toContain("priority:low");
  });
});

// ---------------------------------------------------------------------------
// Duplicate Prevention
// ---------------------------------------------------------------------------

describe("Duplicate issue prevention", () => {
  let copilot: CopilotPort;
  let github: GitHubPort;
  let state: StatePort;
  let parser: ResultParserPort;

  beforeEach(() => {
    copilot = createMockCopilot();
    github = createMockGitHub();
    state = createMockState();
    parser = createMockParser();
  });

  it("should check for existing issues before creating", async () => {
    const analyzer = createTechDebtAnalyzer({
      copilot,
      github,
      state,
      parser,
    });

    await analyzer.execute(createScheduleContext());

    // Should call findExistingIssue for each finding
    expect(github.findExistingIssue).toHaveBeenCalledTimes(5);
  });

  it("should skip issue creation when duplicate exists", async () => {
    // First finding already has an issue
    vi.mocked(github.findExistingIssue).mockImplementation(
      async (title: string) => {
        if (title.includes("Missing API documentation")) {
          return {
            url: "https://github.com/owner/repo/issues/50",
            number: 50,
          };
        }
        return null;
      },
    );

    const analyzer = createTechDebtAnalyzer({
      copilot,
      github,
      state,
      parser,
    });

    await analyzer.execute(createScheduleContext());

    // Only 4 issues created (1 skipped as duplicate)
    expect(github.createIssue).toHaveBeenCalledTimes(4);
  });
});

// ---------------------------------------------------------------------------
// State Recording
// ---------------------------------------------------------------------------

describe("State recording", () => {
  let copilot: CopilotPort;
  let github: GitHubPort;
  let state: StatePort;
  let parser: ResultParserPort;

  beforeEach(() => {
    copilot = createMockCopilot();
    github = createMockGitHub();
    state = createMockState();
    parser = createMockParser();
  });

  it("should record all findings in state", async () => {
    const analyzer = createTechDebtAnalyzer({
      copilot,
      github,
      state,
      parser,
    });

    await analyzer.execute(createScheduleContext());

    // 5 findings → 5 addFinding calls
    expect(state.addFinding).toHaveBeenCalledTimes(5);
  });

  it("should save state after recording findings", async () => {
    const analyzer = createTechDebtAnalyzer({
      copilot,
      github,
      state,
      parser,
    });

    await analyzer.execute(createScheduleContext());

    expect(state.save).toHaveBeenCalled();
  });

  it("should record findings with correct metadata", async () => {
    const analyzer = createTechDebtAnalyzer({
      copilot,
      github,
      state,
      parser,
    });

    await analyzer.execute(createScheduleContext());

    expect(state.addFinding).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "high",
        category: "docs",
        issue: "Missing API documentation for /users endpoint",
        source: "po-guardian",
        task: "tech_debt_audit",
      }),
    );
  });

  it("should include github_issue_url when issue is created", async () => {
    // Return incremental issue numbers
    let issueCounter = 100;
    vi.mocked(github.createIssue).mockImplementation(async () => ({
      url: `https://github.com/owner/repo/issues/${issueCounter}`,
      number: issueCounter++,
    }));

    const analyzer = createTechDebtAnalyzer({
      copilot,
      github,
      state,
      parser,
    });

    await analyzer.execute(createScheduleContext());

    // First finding should have github_issue_url
    expect(state.addFinding).toHaveBeenCalledWith(
      expect.objectContaining({
        github_issue_url: "https://github.com/owner/repo/issues/100",
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Result Structure
// ---------------------------------------------------------------------------

describe("AnalyzerResult structure", () => {
  let copilot: CopilotPort;
  let github: GitHubPort;
  let state: StatePort;
  let parser: ResultParserPort;

  beforeEach(() => {
    copilot = createMockCopilot();
    github = createMockGitHub();
    state = createMockState();
    parser = createMockParser();
  });

  it("should return success=true on successful audit", async () => {
    const analyzer = createTechDebtAnalyzer({
      copilot,
      github,
      state,
      parser,
    });

    const result = await analyzer.execute(createScheduleContext());

    expect(result.success).toBe(true);
  });

  it("should return all findings in the result", async () => {
    const analyzer = createTechDebtAnalyzer({
      copilot,
      github,
      state,
      parser,
    });

    const result = await analyzer.execute(createScheduleContext());

    expect(result.findings).toHaveLength(5);
  });

  it("should track all issues created as actions_taken", async () => {
    const analyzer = createTechDebtAnalyzer({
      copilot,
      github,
      state,
      parser,
    });

    const result = await analyzer.execute(createScheduleContext());

    expect(result.actions_taken.length).toBe(5);
    for (const action of result.actions_taken) {
      expect(action.type).toBe("issue_created");
      expect(action.url).toContain("github.com");
    }
  });

  it("should measure duration in milliseconds", async () => {
    const analyzer = createTechDebtAnalyzer({
      copilot,
      github,
      state,
      parser,
    });

    const result = await analyzer.execute(createScheduleContext());

    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    expect(typeof result.duration_ms).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// Edge: No findings
// ---------------------------------------------------------------------------

describe("Edge: No findings", () => {
  it("should return success with empty findings when project is clean", async () => {
    const copilot = createMockCopilot();
    const github = createMockGitHub();
    const state = createMockState();
    const parser = createMockParser();

    vi.mocked(parser.parse).mockReturnValue(CLEAN_REPORT);

    const analyzer = createTechDebtAnalyzer({
      copilot,
      github,
      state,
      parser,
    });

    const result = await analyzer.execute(createScheduleContext());

    expect(result.success).toBe(true);
    expect(result.findings).toHaveLength(0);
    expect(result.actions_taken).toHaveLength(0);
    expect(github.createIssue).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Edge: PO Guardian failure
// ---------------------------------------------------------------------------

describe("Edge: PO Guardian failure", () => {
  it("should return success=false with error when PO Guardian times out", async () => {
    const copilot = createMockCopilot();
    const github = createMockGitHub();
    const state = createMockState();
    const parser = createMockParser();

    vi.mocked(copilot.invoke).mockResolvedValue({
      success: false,
      output: "",
      duration_ms: 300_000,
      model_used: "claude-sonnet-4.5",
      error: "Timeout after 300000ms",
    });

    const analyzer = createTechDebtAnalyzer({
      copilot,
      github,
      state,
      parser,
    });

    const result = await analyzer.execute(createScheduleContext());

    expect(result.success).toBe(false);
    expect(result.error).toContain("PO Guardian");
    expect(result.findings).toHaveLength(0);
    expect(github.createIssue).not.toHaveBeenCalled();
  });

  it("should never throw — returns error result instead", async () => {
    const copilot = createMockCopilot();
    const github = createMockGitHub();
    const state = createMockState();
    const parser = createMockParser();

    vi.mocked(copilot.invoke).mockRejectedValue(
      new Error("SDK crashed"),
    );

    const analyzer = createTechDebtAnalyzer({
      copilot,
      github,
      state,
      parser,
    });

    const result = await analyzer.execute(createScheduleContext());

    expect(result.success).toBe(false);
    expect(result.error).toContain("SDK crashed");
  });
});

// ---------------------------------------------------------------------------
// Edge: GitHub issue creation failure
// ---------------------------------------------------------------------------

describe("Edge: GitHub issue creation failure", () => {
  it("should continue creating other issues when one fails", async () => {
    const copilot = createMockCopilot();
    const github = createMockGitHub();
    const state = createMockState();
    const parser = createMockParser();

    let callCount = 0;
    vi.mocked(github.createIssue).mockImplementation(async () => {
      callCount++;
      if (callCount === 2) {
        throw new Error("Rate limited");
      }
      return {
        url: `https://github.com/owner/repo/issues/${callCount}`,
        number: callCount,
      };
    });

    const analyzer = createTechDebtAnalyzer({
      copilot,
      github,
      state,
      parser,
    });

    const result = await analyzer.execute(createScheduleContext());

    // Should still succeed overall — partial failure is OK
    expect(result.success).toBe(true);
    // 4 issues created (1 failed)
    expect(result.actions_taken.length).toBe(4);
  });

  it("should still record all findings in state even when issue creation fails", async () => {
    const copilot = createMockCopilot();
    const github = createMockGitHub();
    const state = createMockState();
    const parser = createMockParser();

    vi.mocked(github.createIssue).mockRejectedValue(
      new Error("GitHub API down"),
    );

    const analyzer = createTechDebtAnalyzer({
      copilot,
      github,
      state,
      parser,
    });

    await analyzer.execute(createScheduleContext());

    // All 5 findings should still be recorded in state
    expect(state.addFinding).toHaveBeenCalledTimes(5);
    expect(state.save).toHaveBeenCalled();
  });
});
