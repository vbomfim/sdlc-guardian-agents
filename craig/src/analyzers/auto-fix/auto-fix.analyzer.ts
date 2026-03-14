/**
 * AutoFixAnalyzer — automatically fixes simple linting and formatting issues.
 *
 * Detects applicable linters by checking for config files, runs their
 * auto-fix commands, verifies no new issues are introduced, and opens
 * a draft PR with the fixes.
 *
 * Implements the Analyzer interface (port). All external I/O goes through
 * injected ports (CommandRunner, GitOps, GitHub).
 *
 * @module analyzers/auto-fix
 * @see [HEXAGONAL] — All I/O through ports
 * @see [CLEAN-CODE] — Small functions, data-driven linter registry
 * @see [SOLID/SRP] — One responsibility: orchestrate lint fixes into PRs
 * @see [TDD] — Implementation driven by acceptance criteria tests
 */

import type { AnalyzerPort } from "../analyzer.port.js";
import type { AnalyzerContext, AnalyzerResult, ActionTaken } from "../analyzer.types.js";
import type { ConfigPort } from "../../config/index.js";
import type { GitHubPort } from "../../github/index.js";
import type { CommandRunnerPort, GitOpsPort } from "./auto-fix.ports.js";
import type { LinterDefinition, FixerResult } from "./auto-fix.types.js";
import { SUPPORTED_LINTERS } from "./auto-fix.types.js";

/**
 * AutoFixAnalyzer — orchestrates lint auto-fix → draft PR workflow.
 *
 * Flow:
 * 1. Check config (auto_fix enabled? draft PRs enabled?)
 * 2. Detect applicable linters (check for config files)
 * 3. Create a fix branch (craig/fix-lint-YYYY-MM-DD)
 * 4. Run each applicable fixer
 * 5. If no changes → cleanup and return
 * 6. Verify no new issues introduced
 * 7. Commit, push, create draft PR
 *
 * NEVER throws — returns { success: false, error } on failure.
 *
 * @see [CLEAN-CODE] — Each step is a small, named function
 */
export class AutoFixAnalyzer implements AnalyzerPort {
  readonly name = "auto_fix";

  constructor(
    private readonly config: ConfigPort,
    private readonly github: GitHubPort,
    private readonly gitOps: GitOpsPort,
    private readonly commandRunner: CommandRunnerPort,
  ) {}

  async execute(context: AnalyzerContext): Promise<AnalyzerResult> {
    const startTime = Date.now();

    try {
      return await this.executeInternal(context, startTime);
    } catch (error: unknown) {
      return this.errorResult(
        error instanceof Error ? error.message : "unknown error",
        startTime,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Core workflow (private)
  // -----------------------------------------------------------------------

  /**
   * Internal execute — may throw. Outer execute catches all errors.
   *
   * @see [CLEAN-CODE] — Separate "can throw" logic from error boundary
   */
  private async executeInternal(
    _context: AnalyzerContext,
    startTime: number,
  ): Promise<AnalyzerResult> {
    // Step 1: Check config
    const cfg = this.config.get();

    if (!cfg.capabilities.auto_fix) {
      return this.skipResult("auto-fix disabled by config", startTime);
    }

    if (!cfg.autonomy.create_draft_prs) {
      return this.skipResult("draft PRs disabled by config", startTime);
    }

    // Step 2: Detect applicable linters
    const applicableLinters = await this.detectApplicableLinters();

    if (applicableLinters.length === 0) {
      return this.skipResult("no applicable linters detected", startTime);
    }

    // Step 3: Create fix branch
    const branchName = this.generateBranchName();
    await this.gitOps.createBranch(branchName);

    try {
      // Step 4: Run fixers
      const fixResults = await this.runFixers(applicableLinters);

      // Step 5: Check for changes
      const hasChanges = await this.gitOps.hasChanges();

      if (!hasChanges) {
        await this.gitOps.cleanup(branchName, cfg.branch);
        return this.successResult([], startTime);
      }

      // Step 6: Verify no new issues
      const verificationPassed = await this.verifyFixes(applicableLinters);

      if (!verificationPassed) {
        await this.gitOps.cleanup(branchName, cfg.branch);
        return this.errorResult(
          "fix verification failed: new issues introduced by auto-fix",
          startTime,
        );
      }

      // Step 7: Commit, push, create PR
      const changedFiles = await this.gitOps.getChangedFiles();
      const commitMessage = this.buildCommitMessage(fixResults);
      await this.gitOps.commitAll(commitMessage);
      await this.gitOps.push(branchName);

      // Step 8: Create draft PR
      const prBody = this.buildPRBody(fixResults, changedFiles);
      const pr = await this.github.createDraftPR({
        title: `fix: auto-fix linting issues (${this.formatDate()})`,
        body: prBody,
        head: branchName,
        base: cfg.branch,
        draft: true,
      });

      const action: ActionTaken = {
        type: "pr_created",
        url: pr.url,
        description: `Draft PR #${pr.number}: auto-fix linting issues`,
      };

      return this.successResult([action], startTime);
    } catch (error: unknown) {
      // Cleanup branch on any failure after creation
      await this.safeCleanup(branchName, cfg.branch);
      throw error;
    }
  }

  // -----------------------------------------------------------------------
  // Linter detection
  // -----------------------------------------------------------------------

  /**
   * Detect which linters are applicable by checking for config files.
   *
   * A linter is applicable if ANY of its configIndicators exist.
   *
   * @see [CLEAN-CODE] — Data-driven: iterates SUPPORTED_LINTERS registry
   */
  private async detectApplicableLinters(): Promise<LinterDefinition[]> {
    const applicable: LinterDefinition[] = [];

    for (const linter of SUPPORTED_LINTERS) {
      const isPresent = await this.hasAnyConfigFile(linter.configIndicators);
      if (isPresent) {
        applicable.push(linter);
      }
    }

    return applicable;
  }

  /**
   * Check if any of the given config files exist.
   */
  private async hasAnyConfigFile(
    indicators: readonly string[],
  ): Promise<boolean> {
    for (const indicator of indicators) {
      const exists = await this.commandRunner.fileExists(indicator);
      if (exists) {
        return true;
      }
    }
    return false;
  }

  // -----------------------------------------------------------------------
  // Fix execution
  // -----------------------------------------------------------------------

  /**
   * Run all applicable fixers sequentially.
   *
   * Fixers that fail (non-zero exit) are recorded but don't stop
   * other fixers from running.
   *
   * @see [CLEAN-CODE] — Fault-tolerant: one fixer failure doesn't abort all
   */
  private async runFixers(
    linters: readonly LinterDefinition[],
  ): Promise<FixerResult[]> {
    const results: FixerResult[] = [];

    for (const linter of linters) {
      const result = await this.commandRunner.run(
        linter.fixCommand,
        linter.fixArgs,
      );

      results.push({
        linterName: linter.name,
        language: linter.language,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      });
    }

    return results;
  }

  // -----------------------------------------------------------------------
  // Verification
  // -----------------------------------------------------------------------

  /**
   * Verify that fixes didn't introduce new issues.
   *
   * Runs each linter's verify command. If ANY returns non-zero,
   * verification fails.
   *
   * @returns true if all verifications pass, false otherwise
   * @see [CLEAN-CODE] — Fail fast on first verification failure
   */
  private async verifyFixes(
    linters: readonly LinterDefinition[],
  ): Promise<boolean> {
    for (const linter of linters) {
      const result = await this.commandRunner.run(
        linter.verifyCommand,
        linter.verifyArgs,
      );

      if (result.exitCode !== 0) {
        return false;
      }
    }

    return true;
  }

  // -----------------------------------------------------------------------
  // PR description builders
  // -----------------------------------------------------------------------

  /**
   * Build the commit message from fixer results.
   *
   * Uses conventional commit format: `fix: auto-fix lint issues (linter1, linter2)`
   *
   * @see [GOOGLE-ENG] — Conventional commit messages
   */
  private buildCommitMessage(results: readonly FixerResult[]): string {
    const linterNames = results
      .filter((r) => r.exitCode === 0)
      .map((r) => r.linterName);

    const names = linterNames.length > 0
      ? linterNames.join(", ")
      : "linters";

    return `fix: auto-fix lint issues via ${names}`;
  }

  /**
   * Build the PR body with full context about what was fixed.
   *
   * Includes: Craig rationale, linter details, fixer output, changed files.
   *
   * @see [CLEAN-CODE] — Readable template with clear sections
   */
  private buildPRBody(
    results: readonly FixerResult[],
    changedFiles: readonly string[],
  ): string {
    const sections: string[] = [];

    // Header
    sections.push("## 🤖 Craig Auto-Fix\n");
    sections.push(
      "This draft PR was automatically created by **Craig** to fix linting and formatting issues.\n",
    );
    sections.push(
      "> Craig detected auto-fixable issues and applied fixes using the project's configured linters. " +
      "Please review the changes before merging.\n",
    );

    // Linter details
    sections.push("### Linters Applied\n");
    for (const result of results) {
      const status = result.exitCode === 0 ? "✅" : "⚠️";
      sections.push(
        `- ${status} **${result.linterName}** (${result.language})`,
      );

      if (result.stdout.trim()) {
        sections.push("  ```");
        sections.push(`  ${result.stdout.trim()}`);
        sections.push("  ```");
      }
    }

    // Changed files
    sections.push("\n### Files Changed\n");
    for (const file of changedFiles) {
      sections.push(`- \`${file}\``);
    }

    // Footer
    sections.push("\n---");
    sections.push(
      "*This PR was generated by Craig's auto-fix analyzer. " +
      "All changes have been verified to not introduce new linting issues.*",
    );

    return sections.join("\n");
  }

  // -----------------------------------------------------------------------
  // Result builders
  // -----------------------------------------------------------------------

  /**
   * Build a skip result — used when config disables the analyzer
   * or no applicable linters are found.
   */
  private skipResult(reason: string, startTime: number): AnalyzerResult {
    return {
      task: this.name,
      success: true,
      findings: [],
      actions_taken: [],
      duration_ms: Date.now() - startTime,
      error: reason,
    };
  }

  /**
   * Build a success result with optional actions.
   */
  private successResult(
    actions: ActionTaken[],
    startTime: number,
  ): AnalyzerResult {
    return {
      task: this.name,
      success: true,
      findings: [],
      actions_taken: actions,
      duration_ms: Date.now() - startTime,
    };
  }

  /**
   * Build an error result — used when execution fails.
   */
  private errorResult(error: string, startTime: number): AnalyzerResult {
    return {
      task: this.name,
      success: false,
      findings: [],
      actions_taken: [],
      duration_ms: Date.now() - startTime,
      error,
    };
  }

  // -----------------------------------------------------------------------
  // Utilities
  // -----------------------------------------------------------------------

  /** Generate a branch name using today's date: craig/fix-lint-YYYY-MM-DD */
  private generateBranchName(): string {
    return `craig/fix-lint-${this.formatDate()}`;
  }

  /** Format today's date as YYYY-MM-DD. */
  private formatDate(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  /**
   * Cleanup branch without throwing — used in catch blocks.
   *
   * @see [CLEAN-CODE] — Don't mask the original error with cleanup errors
   */
  private async safeCleanup(
    branchName: string,
    defaultBranch: string,
  ): Promise<void> {
    try {
      await this.gitOps.cleanup(branchName, defaultBranch);
    } catch {
      // Swallow cleanup errors — the original error is more important
    }
  }
}
