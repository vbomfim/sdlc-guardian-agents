/**
 * CoverageScanAnalyzer — Implementation of AnalyzerPort for test coverage gaps.
 *
 * Invokes QA Guardian via CopilotPort to analyze repository test coverage,
 * parses the resulting report, and creates GitHub issues for each coverage
 * gap found. Each issue includes suggested Given/When/Then acceptance criteria.
 *
 * Design decisions:
 * - Never throws — returns AnalyzerResult with success: false on failure [CLEAN-CODE]
 * - Deduplicates issues via findExistingIssue before creating [AC2]
 * - Detects "no test framework" from report summary [AC3]
 * - Logs "full coverage" when no gaps found [Edge case]
 * - Records all findings in State for traceability [CUSTOM]
 *
 * @see [HEXAGONAL] — Adapter implements AnalyzerPort
 * @see [SOLID/SRP] — Only coverage analysis; does not do security or code review
 * @module analyzers/coverage-scan
 */

import { randomUUID } from "node:crypto";
import type { AnalyzerPort } from "../analyzer.port.js";
import type {
  AnalyzerContext,
  AnalyzerResult,
  AnalyzerFinding,
  ActionTaken,
} from "../analyzer.types.js";
import type { CoverageScanDeps } from "./coverage-scan.types.js";
import type { CoverageGap, Severity } from "../../result-parser/index.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Analyzer name — used for identification and state tracking. */
const ANALYZER_NAME = "coverage-scan";

/** Task name for state tracking — matches core.types.ts VALID_TASKS. */
const TASK_NAME = "coverage_scan";

/**
 * Prompt sent to QA Guardian for coverage analysis.
 * Per AC1: specific wording from the issue specification.
 */
const COVERAGE_ANALYSIS_PROMPT =
  "Analyze this repository for test coverage gaps. Identify untested code paths, missing edge cases, and functions without tests.";

/** Keywords indicating no test framework is detected in the repo. */
const NO_FRAMEWORK_KEYWORDS = [
  "no test framework",
  "no test files",
  "no testing framework",
] as const;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Coverage Scan Analyzer — invokes QA Guardian, parses gaps, creates issues.
 *
 * [HEXAGONAL] Implements AnalyzerPort. Consumers depend on the port,
 * never on this class directly.
 */
export class CoverageScanAnalyzer implements AnalyzerPort {
  readonly name = ANALYZER_NAME;

  private readonly copilot: CoverageScanDeps["copilot"];
  private readonly github: CoverageScanDeps["github"];
  private readonly parser: CoverageScanDeps["parser"];
  private readonly state: CoverageScanDeps["state"];

  constructor(deps: CoverageScanDeps) {
    this.copilot = deps.copilot;
    this.github = deps.github;
    this.parser = deps.parser;
    this.state = deps.state;
  }

  /**
   * Execute coverage gap analysis.
   *
   * Flow:
   * 1. Invoke QA Guardian with coverage analysis prompt
   * 2. Parse the response into structured coverage gaps
   * 3. Detect "no test framework" special case (AC3)
   * 4. For each gap: dedup → create issue → record finding
   * 5. Return structured result
   *
   * @throws Never — errors are captured in the result
   */
  async execute(context: AnalyzerContext): Promise<AnalyzerResult> {
    const startTime = performance.now();

    try {
      // 1. Invoke QA Guardian [AC1]
      const invokeResult = await this.copilot.invoke({
        agent: "qa-guardian",
        prompt: COVERAGE_ANALYSIS_PROMPT,
        context: `Task: ${context.task}, TaskId: ${context.taskId}, Timestamp: ${context.timestamp}`,
      });

      if (!invokeResult.success) {
        return this.failureResult(
          `Copilot QA Guardian invocation failed: ${invokeResult.error}`,
          startTime,
        );
      }

      // 2. Parse the response
      const report = this.parser.parse(invokeResult.output, "qa");

      // 3. Check for "no test framework" [AC3]
      if (this.isNoTestFramework(report.summary)) {
        return await this.handleNoTestFramework(startTime);
      }

      // 4. Check for full coverage [Edge]
      const gaps = report.coverage_gaps ?? [];
      if (gaps.length === 0) {
        return this.handleFullCoverage(startTime);
      }

      // 5. Process each gap → create issues
      // [CLEAN-CODE] Must use `await` here so the try/catch catches rejections.
      return await this.processGaps(gaps, startTime);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      return this.failureResult(message, startTime);
    }
  }

  // -----------------------------------------------------------------------
  // Private: Gap Processing
  // -----------------------------------------------------------------------

  /**
   * Process each coverage gap: dedup, create issue, record finding.
   *
   * Creates GitHub issues for gaps that don't already have one.
   * Records all findings in state regardless of issue creation.
   */
  private async processGaps(
    gaps: CoverageGap[],
    startTime: number,
  ): Promise<AnalyzerResult> {
    const findings: AnalyzerFinding[] = [];
    const actions: ActionTaken[] = [];
    let issuesCreated = 0;
    let issuesSkipped = 0;

    for (const gap of gaps) {
      const title = this.buildIssueTitle(gap);
      const existing = await this.github.findExistingIssue(title);

      if (existing) {
        // Duplicate — skip issue creation but still record finding
        findings.push(this.toFinding(gap));
        issuesSkipped++;
        continue;
      }

      // Create issue with Given/When/Then [AC2]
      const body = this.buildIssueBody(gap);
      const labels = this.buildLabels(gap.risk);

      const issueRef = await this.github.createIssue({
        title,
        body,
        labels,
      });

      findings.push(this.toFinding(gap));
      actions.push({
        type: "issue_created",
        description: `Created issue #${issueRef.number}: ${title}`,
        url: issueRef.url,
      });
      issuesCreated++;

      // Record in state
      this.state.addFinding({
        id: randomUUID(),
        severity: gap.risk,
        category: "coverage-gap",
        issue: gap.gap,
        source: "qa-guardian",
        github_issue_url: issueRef.url,
        detected_at: new Date().toISOString(),
        task: TASK_NAME,
      });
    }

    // Persist state
    await this.state.save();

    const durationMs = Math.round(performance.now() - startTime);
    return {
      success: true,
      summary: `Found ${findings.length} coverage gap(s). Created ${issuesCreated} issue(s), skipped ${issuesSkipped} duplicate(s).`,
      findings,
      actions,
      duration_ms: durationMs,
    };
  }

  // -----------------------------------------------------------------------
  // Private: Special Cases
  // -----------------------------------------------------------------------

  /**
   * Handle the "no test framework" case (AC3).
   *
   * Creates a single "Setup test framework" issue with language
   * recommendations in the body.
   */
  private async handleNoTestFramework(
    startTime: number,
  ): Promise<AnalyzerResult> {
    const title = "Setup test framework";
    const body = this.buildSetupFrameworkBody();
    const labels = this.buildLabels("high");
    const actions: ActionTaken[] = [];

    const existing = await this.github.findExistingIssue(title);
    if (existing) {
      const durationMs = Math.round(performance.now() - startTime);
      return {
        success: true,
        summary: "No test framework detected. Issue already exists.",
        findings: [
          {
            severity: "high",
            category: "coverage-gap",
            issue: "No test framework detected — setup required",
            source: "qa-guardian",
          },
        ],
        actions: [],
        duration_ms: durationMs,
      };
    }

    const issueRef = await this.github.createIssue({
      title,
      body,
      labels,
    });

    actions.push({
      type: "issue_created",
      description: `Created issue #${issueRef.number}: ${title}`,
      url: issueRef.url,
    });

    this.state.addFinding({
      id: randomUUID(),
      severity: "high",
      category: "coverage-gap",
      issue: "No test framework detected",
      source: "qa-guardian",
      github_issue_url: issueRef.url,
      detected_at: new Date().toISOString(),
      task: TASK_NAME,
    });

    await this.state.save();

    const durationMs = Math.round(performance.now() - startTime);
    return {
      success: true,
      summary: "No test framework detected. Created issue: Setup test framework.",
      findings: [
        {
          severity: "high",
          category: "coverage-gap",
          issue: "No test framework detected — setup required",
          source: "qa-guardian",
        },
      ],
      actions,
      duration_ms: durationMs,
    };
  }

  /**
   * Handle 100% coverage case (Edge).
   *
   * No issues created, logs "full coverage" message.
   */
  private handleFullCoverage(startTime: number): AnalyzerResult {
    const durationMs = Math.round(performance.now() - startTime);

    // [SECURITY] Log to stderr — stdout is for MCP JSON-RPC
    console.error("[Craig] Coverage scan: full coverage — no gaps found.");

    return {
      success: true,
      summary: "Full coverage — no gaps found.",
      findings: [],
      actions: [],
      duration_ms: durationMs,
    };
  }

  // -----------------------------------------------------------------------
  // Private: Issue Building [AC2]
  // -----------------------------------------------------------------------

  /**
   * Build GitHub issue title from a coverage gap.
   *
   * Format: "Coverage Gap: {gap description}"
   */
  private buildIssueTitle(gap: CoverageGap): string {
    return `Coverage Gap: ${gap.gap}`;
  }

  /**
   * Build GitHub issue body with Given/When/Then acceptance criteria.
   *
   * [AC2] Every issue includes structured acceptance criteria so
   * developers know exactly what tests to write.
   */
  private buildIssueBody(gap: CoverageGap): string {
    return [
      `## Coverage Gap`,
      ``,
      `**Description:** ${gap.gap}`,
      `**Risk severity:** ${gap.risk}`,
      `**Detected by:** Craig (Coverage Gap Scanner via QA Guardian)`,
      ``,
      `## Suggested Acceptance Criteria`,
      ``,
      `### Test: ${gap.gap}`,
      ``,
      `- **Given** the code path described above is exercised`,
      `- **When** the relevant function or endpoint is called with the identified scenario`,
      `- **Then** the behavior is verified and edge cases are covered`,
      ``,
      `## Notes`,
      ``,
      `- This issue was automatically created by Craig's coverage gap scanner.`,
      `- Please review and refine the acceptance criteria above before implementing.`,
      `- Consider additional edge cases related to this code path.`,
    ].join("\n");
  }

  /**
   * Build the body for the "Setup test framework" issue (AC3).
   */
  private buildSetupFrameworkBody(): string {
    return [
      `## No Test Framework Detected`,
      ``,
      `Craig's coverage gap scanner found no test files or test framework configured in this repository.`,
      ``,
      `## Recommendations`,
      ``,
      `Set up a test framework appropriate for your project's language:`,
      ``,
      `| Language | Recommended Framework |`,
      `|----------|----------------------|`,
      `| TypeScript/JavaScript | Vitest, Jest |`,
      `| Python | pytest |`,
      `| Go | testing (stdlib) |`,
      `| Rust | cargo test (built-in) |`,
      `| Java | JUnit 5 |`,
      `| C# | xUnit, NUnit |`,
      ``,
      `## Acceptance Criteria`,
      ``,
      `- **Given** no test framework exists in the repository`,
      `- **When** the framework is installed and configured`,
      `- **Then** at least one smoke test passes and CI runs tests on every PR`,
      ``,
      `## Notes`,
      ``,
      `- This issue was automatically created by Craig's coverage gap scanner.`,
      `- Once a test framework is configured, Craig will detect specific coverage gaps.`,
    ].join("\n");
  }

  // -----------------------------------------------------------------------
  // Private: Helpers
  // -----------------------------------------------------------------------

  /**
   * Build labels for a coverage gap issue.
   */
  private buildLabels(risk: Severity): string[] {
    return ["craig", "coverage-gap", `priority:${risk}`];
  }

  /**
   * Convert a CoverageGap to an AnalyzerFinding.
   */
  private toFinding(
    gap: CoverageGap,
  ): AnalyzerFinding {
    return {
      severity: gap.risk,
      category: "coverage-gap",
      issue: gap.gap,
      source: "qa-guardian",
    };
  }

  /**
   * Check if the summary indicates no test framework is detected.
   */
  private isNoTestFramework(summary: string): boolean {
    const lowerSummary = summary.toLowerCase();
    return NO_FRAMEWORK_KEYWORDS.some((keyword) =>
      lowerSummary.includes(keyword),
    );
  }

  /**
   * Create a failure result.
   */
  private failureResult(error: string, startTime: number): AnalyzerResult {
    return {
      success: false,
      summary: error,
      findings: [],
      actions: [],
      duration_ms: Math.round(performance.now() - startTime),
    };
  }
}

// ---------------------------------------------------------------------------
// Factory Function [HEXAGONAL]
// ---------------------------------------------------------------------------

/**
 * Create a CoverageScanAnalyzer instance behind the AnalyzerPort interface.
 *
 * [HEXAGONAL] Consumers use this factory instead of `new CoverageScanAnalyzer()`.
 * Returns the port interface, hiding the concrete implementation.
 *
 * @param deps - Component dependencies (copilot, github, parser, state)
 * @returns An AnalyzerPort implementation for coverage gap scanning
 */
export function createCoverageScanAnalyzer(
  deps: CoverageScanDeps,
): AnalyzerPort {
  return new CoverageScanAnalyzer(deps);
}
