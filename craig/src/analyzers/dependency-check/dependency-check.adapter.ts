/**
 * DependencyCheckAnalyzer — detects outdated and vulnerable dependencies.
 *
 * Implements the AnalyzerPort interface. Checks for package manager manifest
 * files, runs audit commands, creates GitHub issues for vulnerabilities,
 * and creates draft PRs for fixable vulnerabilities.
 *
 * [HEXAGONAL] Adapter — implements AnalyzerPort, delegates to GitHubPort,
 *   StatePort, and ShellPort.
 * [SOLID/SRP] Detects, reports, and records dependency vulnerabilities.
 * [CLEAN-CODE] Small functions, structured error handling, never throws.
 *
 * @see https://github.com/vbomfim/sdlc-guardian-agents/issues/13
 * @module analyzers/dependency-check
 */

import { join } from "node:path";
import type { AnalyzerPort } from "../analyzer.port.js";
import type { AnalyzerResult } from "../analyzer.types.js";
import type {
  DependencyCheckDeps,
  PackageManager,
  Vulnerability,
} from "./dependency-check.types.js";
import { PACKAGE_MANAGER_FILES } from "./dependency-check.types.js";
import {
  parseNpmAudit,
  parsePipAudit,
  parseCargoAudit,
} from "./dependency-check.parsers.js";

export class DependencyCheckAnalyzer implements AnalyzerPort {
  readonly name = "dependency-check";
  private readonly deps: DependencyCheckDeps;

  constructor(deps: DependencyCheckDeps) {
    this.deps = deps;
  }

  /**
   * Run the dependency health check.
   *
   * 1. Detect package managers from manifest files
   * 2. Run audit commands for each detected PM
   * 3. Parse vulnerabilities from audit output
   * 4. Create GitHub issues for each vulnerability (deduplicated)
   * 5. Create a draft PR for fixable vulnerabilities
   * 6. Record findings in state
   *
   * Never throws — errors are caught and reported in the summary.
   */
  async analyze(): Promise<AnalyzerResult> {
    try {
      return await this.runAnalysis();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      return {
        analyzer: this.name,
        findings_count: 0,
        issues_created: 0,
        prs_created: 0,
        summary: `Dependency check failed: ${message}`,
      };
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Core analysis flow                                               */
  /* ---------------------------------------------------------------- */

  private async runAnalysis(): Promise<AnalyzerResult> {
    // Step 1: Detect package managers [AC4]
    const packageManagers = await this.detectPackageManagers();

    if (packageManagers.length === 0) {
      return {
        analyzer: this.name,
        findings_count: 0,
        issues_created: 0,
        prs_created: 0,
        summary: "Skipped — no dependencies found in repository",
      };
    }

    // Step 2+3: Run audits and parse results
    const allVulnerabilities = await this.runAllAudits(packageManagers);

    if (allVulnerabilities.length === 0) {
      return {
        analyzer: this.name,
        findings_count: 0,
        issues_created: 0,
        prs_created: 0,
        summary: `Checked ${packageManagers.join(", ")} — no vulnerabilities found`,
      };
    }

    // Step 4: Create issues for vulnerabilities [AC1]
    const issuesCreated = await this.createIssuesForVulnerabilities(
      allVulnerabilities,
    );

    // Step 5: Create draft PR for fixable vulnerabilities [AC2, AC3]
    const prsCreated = await this.createUpgradePR(allVulnerabilities);

    // Step 6: Record findings in state
    await this.recordFindings(allVulnerabilities);

    return {
      analyzer: this.name,
      findings_count: allVulnerabilities.length,
      issues_created: issuesCreated,
      prs_created: prsCreated,
      summary: buildSummary(allVulnerabilities, issuesCreated, prsCreated),
    };
  }

  /* ---------------------------------------------------------------- */
  /*  Package manager detection [AC4]                                  */
  /* ---------------------------------------------------------------- */

  /**
   * Detect which package managers are present by checking for manifest files.
   * [AC4] package.json → npm, requirements.txt/pyproject.toml → pip, Cargo.toml → cargo
   */
  private async detectPackageManagers(): Promise<PackageManager[]> {
    const detected: PackageManager[] = [];

    for (const [pm, files] of PACKAGE_MANAGER_FILES) {
      for (const file of files) {
        const filePath = join(this.deps.repoRoot, file);
        const exists = await this.deps.shell.fileExists(filePath);
        if (exists) {
          detected.push(pm);
          break; // One match per PM is enough
        }
      }
    }

    return detected;
  }

  /* ---------------------------------------------------------------- */
  /*  Audit execution                                                  */
  /* ---------------------------------------------------------------- */

  /**
   * Run audit commands for all detected package managers and aggregate results.
   * [Edge] Multiple package managers → runs all applicable audits.
   */
  private async runAllAudits(
    packageManagers: PackageManager[],
  ): Promise<Vulnerability[]> {
    const allVulnerabilities: Vulnerability[] = [];

    for (const pm of packageManagers) {
      const vulns = await this.runAudit(pm);
      allVulnerabilities.push(...vulns);
    }

    return allVulnerabilities;
  }

  /**
   * Run the audit command for a specific package manager and parse output.
   * Returns empty array if the command fails (non-fatal).
   */
  private async runAudit(pm: PackageManager): Promise<Vulnerability[]> {
    const { command, args, parser } = getAuditConfig(pm);

    try {
      const result = await this.deps.shell.run(command, args);
      // npm audit exits with non-zero when vulnerabilities are found.
      // We parse stdout regardless of exit code.
      return parser(result.stdout);
    } catch {
      return [];
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Issue creation [AC1]                                             */
  /* ---------------------------------------------------------------- */

  /**
   * Create GitHub issues for each vulnerability, skipping duplicates.
   * [AC1] Issue includes CVE, severity, affected package, fixed version.
   */
  private async createIssuesForVulnerabilities(
    vulnerabilities: Vulnerability[],
  ): Promise<number> {
    let issuesCreated = 0;

    for (const vuln of vulnerabilities) {
      const created = await this.createIssueIfNew(vuln);
      if (created) {
        issuesCreated++;
      }
    }

    return issuesCreated;
  }

  /**
   * Create a GitHub issue for a vulnerability if one doesn't already exist.
   * Returns true if a new issue was created.
   */
  private async createIssueIfNew(vuln: Vulnerability): Promise<boolean> {
    const title = buildIssueTitle(vuln);

    try {
      const existing = await this.deps.github.findExistingIssue(title);
      if (existing) {
        return false;
      }

      await this.deps.github.createIssue({
        title,
        body: buildIssueBody(vuln),
        labels: ["dependencies", "security"],
      });

      return true;
    } catch {
      return false;
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Draft PR creation [AC2, AC3]                                     */
  /* ---------------------------------------------------------------- */

  /**
   * Create a draft PR for fixable vulnerabilities.
   * [AC2] Branch: craig/deps-update-YYYY-MM-DD, explains what was updated.
   * [AC3] PR body includes CI review warning.
   */
  private async createUpgradePR(
    vulnerabilities: Vulnerability[],
  ): Promise<number> {
    const fixable = vulnerabilities.filter((v) => v.fixed_version !== null);

    if (fixable.length === 0) {
      return 0;
    }

    const dateStr = formatDate(new Date());
    const branchName = `craig/deps-update-${dateStr}`;

    try {
      await this.deps.github.createDraftPR({
        title: `fix(deps): deps-update-${dateStr} — ${fixable.length} vulnerable ${fixable.length === 1 ? "dependency" : "dependencies"}`,
        body: buildPRBody(fixable),
        head: branchName,
        base: "main",
        draft: true,
      });

      return 1;
    } catch {
      return 0;
    }
  }

  /* ---------------------------------------------------------------- */
  /*  State recording                                                  */
  /* ---------------------------------------------------------------- */

  /**
   * Record all vulnerabilities as findings in Craig's state.
   */
  private async recordFindings(
    vulnerabilities: Vulnerability[],
  ): Promise<void> {
    for (const vuln of vulnerabilities) {
      this.deps.state.addFinding({
        id: crypto.randomUUID(),
        severity: vuln.severity,
        category: "dependencies",
        issue: `${vuln.advisory_id}: ${vuln.package_name} (${vuln.package_manager})`,
        source: "dependency-check",
        detected_at: new Date().toISOString(),
        task: "dependency_check",
      });
    }

    await this.deps.state.save();
  }
}

/* ------------------------------------------------------------------ */
/*  Pure helper functions                                              */
/* ------------------------------------------------------------------ */

/** Audit command configuration per package manager. */
interface AuditConfig {
  readonly command: string;
  readonly args: readonly string[];
  readonly parser: (output: string) => Vulnerability[];
}

/** Get the audit command, args, and parser for a package manager. */
function getAuditConfig(pm: PackageManager): AuditConfig {
  switch (pm) {
    case "npm":
      return {
        command: "npm",
        args: ["audit", "--json"],
        parser: parseNpmAudit,
      };
    case "pip":
      return {
        command: "pip-audit",
        args: ["--format=json"],
        parser: parsePipAudit,
      };
    case "cargo":
      return {
        command: "cargo",
        args: ["audit", "--json"],
        parser: parseCargoAudit,
      };
  }
}

/** Build the GitHub issue title for a vulnerability. */
function buildIssueTitle(vuln: Vulnerability): string {
  return `🔒 ${vuln.advisory_id}: ${vuln.package_name} — ${vuln.severity} vulnerability`;
}

/**
 * Build the GitHub issue body for a vulnerability.
 * [AC1] Includes CVE/advisory, severity, affected package, fixed version.
 */
function buildIssueBody(vuln: Vulnerability): string {
  const fixInfo = vuln.fixed_version
    ? `**Fixed in:** \`${vuln.fixed_version}\``
    : "**Fixed in:** No fix available yet";

  const urlLine = vuln.advisory_url
    ? `**Advisory:** ${vuln.advisory_url}`
    : "";

  return [
    `## Vulnerable Dependency Detected`,
    "",
    `| Field | Value |`,
    `|-------|-------|`,
    `| **Package** | \`${vuln.package_name}\` |`,
    `| **Current Version** | \`${vuln.current_version || "unknown"}\` |`,
    `| **Severity** | ${vuln.severity} |`,
    `| **Advisory** | ${vuln.advisory_id} |`,
    `| **Package Manager** | ${vuln.package_manager} |`,
    "",
    `### Description`,
    vuln.description,
    "",
    fixInfo,
    urlLine,
    "",
    `---`,
    `_Detected by Craig dependency-check analyzer._`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Build the PR body for dependency upgrades.
 * [AC2] Explains what was updated and why.
 * [AC3] Includes CI review warning.
 */
function buildPRBody(fixable: Vulnerability[]): string {
  const rows = fixable
    .map(
      (v) =>
        `| \`${v.package_name}\` | \`${v.current_version || "unknown"}\` | \`${v.fixed_version}\` | ${v.severity} | ${v.advisory_id} |`,
    )
    .join("\n");

  return [
    `## Dependency Security Updates`,
    "",
    `This PR updates vulnerable dependencies to their fixed versions.`,
    "",
    `| Package | Current | Fixed | Severity | Advisory |`,
    `|---------|---------|-------|----------|----------|`,
    rows,
    "",
    `### Why`,
    `These dependencies have known security vulnerabilities that are addressed in newer versions.`,
    "",
    `> ⚠️ Review CI results before merging — tests validate the upgrade`,
    "",
    `---`,
    `_Created by Craig dependency-check analyzer._`,
  ].join("\n");
}

/**
 * Build a human-readable summary of the analysis run.
 */
function buildSummary(
  vulnerabilities: Vulnerability[],
  issuesCreated: number,
  prsCreated: number,
): string {
  const parts = [
    `Found ${vulnerabilities.length} ${vulnerabilities.length === 1 ? "vulnerability" : "vulnerabilities"}`,
  ];

  if (issuesCreated > 0) {
    parts.push(`created ${issuesCreated} ${issuesCreated === 1 ? "issue" : "issues"}`);
  }

  if (prsCreated > 0) {
    parts.push(`created ${prsCreated} draft ${prsCreated === 1 ? "PR" : "PRs"}`);
  }

  return parts.join(", ");
}

/**
 * Format a date as YYYY-MM-DD.
 */
function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
