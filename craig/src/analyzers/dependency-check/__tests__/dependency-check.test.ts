/**
 * Unit tests for the DependencyCheckAnalyzer.
 *
 * Tests acceptance criteria from issue #13:
 * - AC1: Detect vulnerable dependencies → create GitHub issues
 * - AC2: Create upgrade draft PR for fixable vulnerabilities
 * - AC3: PR body includes CI review warning
 * - AC4: Detect package manager from manifest files
 * - Edge: No package manager → skip with summary
 * - Edge: Multiple package managers → run all audits
 *
 * [TDD] Tests written FIRST — analyzer implemented to make them pass.
 *
 * @see https://github.com/vbomfim/sdlc-guardian-agents/issues/13
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { DependencyCheckAnalyzer } from "../dependency-check.adapter.js";
import type { ShellPort, CommandResult } from "../dependency-check.types.js";
import type { GitHubPort } from "../../../github/index.js";
import type { StatePort } from "../../../state/index.js";
import type { AnalyzerContext } from "../../analyzer.types.js";
import {
  createMockState,
  createMockGitHub,
  createMockShell,
  NPM_AUDIT_OUTPUT,
  PIP_AUDIT_OUTPUT,
  CARGO_AUDIT_OUTPUT,
} from "./mock-helpers.js";

const createContext = (): AnalyzerContext => ({
  task: "dependency_check",
  taskId: "test-id",
  timestamp: new Date().toISOString(),
});

/* ------------------------------------------------------------------ */
/*  AC4: Detect package manager                                        */
/* ------------------------------------------------------------------ */

describe("AC4: Detect package manager", () => {
  let github: GitHubPort;
  let state: StatePort;
  let shell: ShellPort;

  beforeEach(() => {
    github = createMockGitHub();
    state = createMockState();
    shell = createMockShell();
  });

  it("detects npm when package.json exists", async () => {
    vi.mocked(shell.fileExists).mockImplementation(async (path: string) =>
      path.endsWith("package.json"),
    );
    vi.mocked(shell.run).mockResolvedValue({
      stdout: NPM_AUDIT_OUTPUT,
      stderr: "",
      exit_code: 0,
    });

    const analyzer = new DependencyCheckAnalyzer({
      github,
      state,
      shell,
      repoRoot: "/repo",
    });
    const result = await analyzer.execute(createContext());

    expect(shell.run).toHaveBeenCalledWith(
      "npm",
      expect.arrayContaining(["audit"]),
    );
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("detects pip when requirements.txt exists", async () => {
    vi.mocked(shell.fileExists).mockImplementation(async (path: string) =>
      path.endsWith("requirements.txt"),
    );
    vi.mocked(shell.run).mockResolvedValue({
      stdout: PIP_AUDIT_OUTPUT,
      stderr: "",
      exit_code: 0,
    });

    const analyzer = new DependencyCheckAnalyzer({
      github,
      state,
      shell,
      repoRoot: "/repo",
    });
    const result = await analyzer.execute(createContext());

    expect(shell.run).toHaveBeenCalledWith(
      "pip-audit",
      expect.arrayContaining(["--format=json"]),
    );
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("detects pip when pyproject.toml exists", async () => {
    vi.mocked(shell.fileExists).mockImplementation(async (path: string) =>
      path.endsWith("pyproject.toml"),
    );
    vi.mocked(shell.run).mockResolvedValue({
      stdout: PIP_AUDIT_OUTPUT,
      stderr: "",
      exit_code: 0,
    });

    const analyzer = new DependencyCheckAnalyzer({
      github,
      state,
      shell,
      repoRoot: "/repo",
    });
    const result = await analyzer.execute(createContext());

    expect(shell.run).toHaveBeenCalledWith(
      "pip-audit",
      expect.arrayContaining(["--format=json"]),
    );
  });

  it("detects cargo when Cargo.toml exists", async () => {
    vi.mocked(shell.fileExists).mockImplementation(async (path: string) =>
      path.endsWith("Cargo.toml"),
    );
    vi.mocked(shell.run).mockResolvedValue({
      stdout: CARGO_AUDIT_OUTPUT,
      stderr: "",
      exit_code: 0,
    });

    const analyzer = new DependencyCheckAnalyzer({
      github,
      state,
      shell,
      repoRoot: "/repo",
    });
    const result = await analyzer.execute(createContext());

    expect(shell.run).toHaveBeenCalledWith(
      "cargo",
      expect.arrayContaining(["audit"]),
    );
  });
});

/* ------------------------------------------------------------------ */
/*  Edge case: No package manager detected                             */
/* ------------------------------------------------------------------ */

describe("Edge: No package manager detected", () => {
  it("returns summary with 'no dependencies found' when no manifest files exist", async () => {
    const github = createMockGitHub();
    const state = createMockState();
    const shell = createMockShell();

    vi.mocked(shell.fileExists).mockResolvedValue(false);

    const analyzer = new DependencyCheckAnalyzer({
      github,
      state,
      shell,
      repoRoot: "/repo",
    });
    const result = await analyzer.execute(createContext());

    expect(result.findings.length).toBe(0);
    expect(result.actions.filter(a => a.type === "issue_created").length).toBe(0);
    expect(result.actions.filter(a => a.type === "pr_opened").length).toBe(0);
    expect(result.summary).toContain("no dependencies found");
    expect(result.success).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Edge case: Multiple package managers                               */
/* ------------------------------------------------------------------ */

describe("Edge: Multiple package managers", () => {
  it("runs audits for all detected package managers", async () => {
    const github = createMockGitHub();
    const state = createMockState();
    const shell = createMockShell();

    // Both package.json and Cargo.toml exist
    vi.mocked(shell.fileExists).mockImplementation(async (path: string) =>
      path.endsWith("package.json") || path.endsWith("Cargo.toml"),
    );

    vi.mocked(shell.run).mockImplementation(async (cmd: string) => {
      if (cmd === "npm") {
        return { stdout: NPM_AUDIT_OUTPUT, stderr: "", exit_code: 0 };
      }
      if (cmd === "cargo") {
        return { stdout: CARGO_AUDIT_OUTPUT, stderr: "", exit_code: 0 };
      }
      return { stdout: "", stderr: "", exit_code: 1 };
    });

    const analyzer = new DependencyCheckAnalyzer({
      github,
      state,
      shell,
      repoRoot: "/repo",
    });
    const result = await analyzer.execute(createContext());

    expect(shell.run).toHaveBeenCalledWith("npm", expect.arrayContaining(["audit"]));
    expect(shell.run).toHaveBeenCalledWith("cargo", expect.arrayContaining(["audit"]));
    // npm fixture has 1 vuln, cargo fixture has 1 vuln = 2 total
    expect(result.findings.length).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/*  AC1: Detect vulnerable dependencies → create issues                */
/* ------------------------------------------------------------------ */

describe("AC1: Detect vulnerable dependencies", () => {
  let github: GitHubPort;
  let state: StatePort;
  let shell: ShellPort;

  beforeEach(() => {
    github = createMockGitHub();
    state = createMockState();
    shell = createMockShell();

    vi.mocked(shell.fileExists).mockImplementation(async (path: string) =>
      path.endsWith("package.json"),
    );
    vi.mocked(shell.run).mockResolvedValue({
      stdout: NPM_AUDIT_OUTPUT,
      stderr: "",
      exit_code: 0,
    });
  });

  it("creates a GitHub issue with vulnerability details", async () => {
    vi.mocked(github.findExistingIssue).mockResolvedValue(null);

    const analyzer = new DependencyCheckAnalyzer({
      github,
      state,
      shell,
      repoRoot: "/repo",
    });
    await analyzer.execute(createContext());

    expect(github.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining("lodash"),
        body: expect.stringContaining("GHSA-jf85-cpcp-j695"),
        labels: expect.arrayContaining(["dependencies", "security"]),
      }),
    );
  });

  it("issue body contains severity, affected package, and fixed version", async () => {
    vi.mocked(github.findExistingIssue).mockResolvedValue(null);

    const analyzer = new DependencyCheckAnalyzer({
      github,
      state,
      shell,
      repoRoot: "/repo",
    });
    await analyzer.execute(createContext());

    const issueCall = vi.mocked(github.createIssue).mock.calls[0]![0];
    expect(issueCall.body).toContain("critical");
    expect(issueCall.body).toContain("lodash");
    expect(issueCall.body).toContain("4.17.21");
  });

  it("does not create duplicate issue if one already exists", async () => {
    vi.mocked(github.findExistingIssue).mockResolvedValue({
      url: "https://github.com/owner/repo/issues/42",
      number: 42,
    });

    const analyzer = new DependencyCheckAnalyzer({
      github,
      state,
      shell,
      repoRoot: "/repo",
    });
    const result = await analyzer.execute(createContext());

    expect(github.createIssue).not.toHaveBeenCalled();
    expect(result.actions.filter(a => a.type === "issue_created").length).toBe(0);
  });

  it("records findings in state", async () => {
    vi.mocked(github.findExistingIssue).mockResolvedValue(null);

    const analyzer = new DependencyCheckAnalyzer({
      github,
      state,
      shell,
      repoRoot: "/repo",
    });
    await analyzer.execute(createContext());

    expect(state.addFinding).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "critical",
        category: "dependencies",
        issue: expect.stringContaining("lodash"),
        source: "dependency-check",
        task: "dependency_check",
      }),
    );
    expect(state.save).toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/*  AC2: Create upgrade draft PR for fixable vulnerabilities           */
/* ------------------------------------------------------------------ */

describe("AC2: Create upgrade draft PR", () => {
  let github: GitHubPort;
  let state: StatePort;
  let shell: ShellPort;

  beforeEach(() => {
    github = createMockGitHub();
    state = createMockState();
    shell = createMockShell();

    vi.mocked(shell.fileExists).mockImplementation(async (path: string) =>
      path.endsWith("package.json"),
    );
    vi.mocked(shell.run).mockResolvedValue({
      stdout: NPM_AUDIT_OUTPUT,
      stderr: "",
      exit_code: 0,
    });
    vi.mocked(github.findExistingIssue).mockResolvedValue(null);
  });

  it("creates a draft PR when fixable vulnerabilities exist", async () => {
    const analyzer = new DependencyCheckAnalyzer({
      github,
      state,
      shell,
      repoRoot: "/repo",
    });
    await analyzer.execute(createContext());

    expect(github.createDraftPR).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining("deps-update"),
        draft: true,
        head: expect.stringMatching(/^craig\/deps-update-\d{4}-\d{2}-\d{2}$/),
      }),
    );
  });

  it("PR body explains what was updated", async () => {
    const analyzer = new DependencyCheckAnalyzer({
      github,
      state,
      shell,
      repoRoot: "/repo",
    });
    await analyzer.execute(createContext());

    const prCall = vi.mocked(github.createDraftPR).mock.calls[0]![0];
    expect(prCall.body).toContain("lodash");
    expect(prCall.body).toContain("4.17.21");
  });

  it("does not create PR when no fixable vulnerabilities exist", async () => {
    // Override with audit output that has no fixes
    vi.mocked(shell.run).mockResolvedValue({
      stdout: JSON.stringify({
        vulnerabilities: {
          unfixable: {
            name: "unfixable",
            severity: "high",
            via: [{ title: "No fix", url: "https://url", severity: "high" }],
            fixAvailable: false,
          },
        },
      }),
      stderr: "",
      exit_code: 0,
    });

    const analyzer = new DependencyCheckAnalyzer({
      github,
      state,
      shell,
      repoRoot: "/repo",
    });
    const result = await analyzer.execute(createContext());

    expect(github.createDraftPR).not.toHaveBeenCalled();
    expect(result.actions.filter(a => a.type === "pr_opened").length).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  AC3: PR body notes CI review warning                               */
/* ------------------------------------------------------------------ */

describe("AC3: PR body includes CI warning", () => {
  it("PR body contains CI review warning", async () => {
    const github = createMockGitHub();
    const state = createMockState();
    const shell = createMockShell();

    vi.mocked(shell.fileExists).mockImplementation(async (path: string) =>
      path.endsWith("package.json"),
    );
    vi.mocked(shell.run).mockResolvedValue({
      stdout: NPM_AUDIT_OUTPUT,
      stderr: "",
      exit_code: 0,
    });
    vi.mocked(github.findExistingIssue).mockResolvedValue(null);

    const analyzer = new DependencyCheckAnalyzer({
      github,
      state,
      shell,
      repoRoot: "/repo",
    });
    await analyzer.execute(createContext());

    const prCall = vi.mocked(github.createDraftPR).mock.calls[0]![0];
    expect(prCall.body).toContain(
      "⚠️ Review CI results before merging — tests validate the upgrade",
    );
  });
});

/* ------------------------------------------------------------------ */
/*  Error handling                                                     */
/* ------------------------------------------------------------------ */

describe("Error handling", () => {
  it("handles audit command failure gracefully", async () => {
    const github = createMockGitHub();
    const state = createMockState();
    const shell = createMockShell();

    vi.mocked(shell.fileExists).mockImplementation(async (path: string) =>
      path.endsWith("package.json"),
    );
    // npm audit exits with non-zero AND produces no valid JSON
    vi.mocked(shell.run).mockResolvedValue({
      stdout: "",
      stderr: "npm ERR! something went wrong",
      exit_code: 1,
    });

    const analyzer = new DependencyCheckAnalyzer({
      github,
      state,
      shell,
      repoRoot: "/repo",
    });
    const result = await analyzer.execute(createContext());

    // Should not crash — returns zero findings for failed audit
    expect(result.findings.length).toBe(0);
    expect(result.summary).toBeDefined();
    expect(result.success).toBe(true);
  });

  it("handles GitHub issue creation failure gracefully", async () => {
    const github = createMockGitHub();
    const state = createMockState();
    const shell = createMockShell();

    vi.mocked(shell.fileExists).mockImplementation(async (path: string) =>
      path.endsWith("package.json"),
    );
    vi.mocked(shell.run).mockResolvedValue({
      stdout: NPM_AUDIT_OUTPUT,
      stderr: "",
      exit_code: 0,
    });
    vi.mocked(github.findExistingIssue).mockResolvedValue(null);
    vi.mocked(github.createIssue).mockRejectedValue(
      new Error("GitHub API error"),
    );

    const analyzer = new DependencyCheckAnalyzer({
      github,
      state,
      shell,
      repoRoot: "/repo",
    });
    const result = await analyzer.execute(createContext());

    // Should not crash — reports what it could
    expect(result.actions.filter(a => a.type === "issue_created").length).toBe(0);
  });

  it("never throws — always returns AnalyzerResult", async () => {
    const github = createMockGitHub();
    const state = createMockState();
    const shell = createMockShell();

    // fileExists throws
    vi.mocked(shell.fileExists).mockRejectedValue(
      new Error("Permission denied"),
    );

    const analyzer = new DependencyCheckAnalyzer({
      github,
      state,
      shell,
      repoRoot: "/repo",
    });
    const result = await analyzer.execute(createContext());

    expect(result.success).toBeDefined();
    expect(result).toHaveProperty("findings");
    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("actions");
    expect(result).toHaveProperty("duration_ms");
  });
});

/* ------------------------------------------------------------------ */
/*  Analyzer metadata                                                  */
/* ------------------------------------------------------------------ */

describe("Analyzer metadata", () => {
  it("has name 'dependency-check'", () => {
    const analyzer = new DependencyCheckAnalyzer({
      github: createMockGitHub(),
      state: createMockState(),
      shell: createMockShell(),
      repoRoot: "/repo",
    });

    expect(analyzer.name).toBe("dependency-check");
  });

  it("returns a valid AnalyzerResult shape", async () => {
    const shell = createMockShell();
    vi.mocked(shell.fileExists).mockResolvedValue(false);

    const analyzer = new DependencyCheckAnalyzer({
      github: createMockGitHub(),
      state: createMockState(),
      shell,
      repoRoot: "/repo",
    });
    const result = await analyzer.execute(createContext());

    expect(result.success).toBe(true);
    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("findings");
    expect(result).toHaveProperty("actions");
    expect(result).toHaveProperty("duration_ms");
  });
});
