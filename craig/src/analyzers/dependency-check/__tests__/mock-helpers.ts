/**
 * Mock factories and test fixtures for dependency-check tests.
 *
 * Provides mock implementations of GitHubPort, StatePort, and ShellPort,
 * plus canned audit output for each package manager.
 *
 * @module analyzers/dependency-check/__tests__/mock-helpers
 */

import { vi } from "vitest";
import type { GitHubPort } from "../../../github/index.js";
import type { StatePort } from "../../../state/index.js";
import type { ShellPort } from "../dependency-check.types.js";

/* ------------------------------------------------------------------ */
/*  Mock Factories                                                     */
/* ------------------------------------------------------------------ */

/** Create a mock GitHubPort with sensible defaults. */
export function createMockGitHub(): GitHubPort {
  return {
    createIssue: vi.fn().mockResolvedValue({
      url: "https://github.com/owner/repo/issues/1",
      number: 1,
    }),
    findExistingIssue: vi.fn().mockResolvedValue(null),
    listOpenIssues: vi.fn().mockResolvedValue([]),
    createDraftPR: vi.fn().mockResolvedValue({
      url: "https://github.com/owner/repo/pull/1",
      number: 1,
    }),
    createCommitComment: vi.fn().mockResolvedValue({
      url: "https://github.com/owner/repo/commit/abc123#comment",
    }),
    getLatestCommits: vi.fn().mockResolvedValue([]),
    getCommitDiff: vi.fn().mockResolvedValue({ sha: "abc", files: [] }),
    getMergeCommits: vi.fn().mockResolvedValue([]),
    getRateLimit: vi.fn().mockResolvedValue({
      remaining: 5000,
      reset: new Date(),
    }),
  };
}

/** Create a mock StatePort with sensible defaults. */
export function createMockState(): StatePort {
  return {
    load: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockReturnValue([]),
    set: vi.fn(),
    addFinding: vi.fn(),
    getFindings: vi.fn().mockReturnValue([]),
  };
}

/** Create a mock ShellPort with sensible defaults. */
export function createMockShell(): ShellPort {
  return {
    run: vi.fn().mockResolvedValue({ stdout: "", stderr: "", exit_code: 0 }),
    fileExists: vi.fn().mockResolvedValue(false),
  };
}

/* ------------------------------------------------------------------ */
/*  Canned Audit Output Fixtures                                       */
/* ------------------------------------------------------------------ */

/** npm audit --json output with one critical vulnerability (fix available). */
export const NPM_AUDIT_OUTPUT = JSON.stringify({
  vulnerabilities: {
    lodash: {
      name: "lodash",
      severity: "critical",
      via: [
        {
          source: 1065,
          name: "lodash",
          dependency: "lodash",
          title: "Prototype Pollution",
          url: "https://github.com/advisories/GHSA-jf85-cpcp-j695",
          severity: "critical",
          range: "<4.17.12",
        },
      ],
      fixAvailable: {
        name: "lodash",
        version: "4.17.21",
        isSemVerMajor: false,
      },
    },
  },
});

/** pip-audit --format=json output with one vulnerability. */
export const PIP_AUDIT_OUTPUT = JSON.stringify([
  {
    name: "django",
    version: "3.2.0",
    vulns: [
      {
        id: "PYSEC-2023-100",
        fix_versions: ["3.2.20"],
        aliases: ["CVE-2023-36053"],
        description: "SQL injection vulnerability in Django",
      },
    ],
  },
]);

/** cargo audit --json output with one vulnerability. */
export const CARGO_AUDIT_OUTPUT = JSON.stringify({
  vulnerabilities: {
    found: true,
    count: 1,
    list: [
      {
        advisory: {
          id: "RUSTSEC-2023-0001",
          title: "Buffer overflow in some-crate",
          description: "A buffer overflow vulnerability",
          url: "https://rustsec.org/advisories/RUSTSEC-2023-0001.html",
        },
        versions: {
          patched: [">=1.0.1"],
          unaffected: [],
        },
        package: {
          name: "some-crate",
          version: "1.0.0",
        },
      },
    ],
  },
});
