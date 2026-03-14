/**
 * Unit tests for the dependency-check audit output parsers.
 *
 * Pure functions that parse JSON output from npm audit, pip-audit,
 * and cargo audit into normalized Vulnerability objects.
 *
 * [TDD] Tests written FIRST — parsers implemented to make them pass.
 *
 * @see https://github.com/vbomfim/sdlc-guardian-agents/issues/13
 */

import { describe, it, expect } from "vitest";
import {
  parseNpmAudit,
  parsePipAudit,
  parseCargoAudit,
} from "../dependency-check.parsers.js";

/* ------------------------------------------------------------------ */
/*  npm audit parser                                                   */
/* ------------------------------------------------------------------ */

describe("parseNpmAudit", () => {
  it("parses a single critical vulnerability with fix available", () => {
    const output = JSON.stringify({
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

    const result = parseNpmAudit(output);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      package_name: "lodash",
      current_version: "",
      severity: "critical",
      advisory_id: "GHSA-jf85-cpcp-j695",
      fixed_version: "4.17.21",
      description: "Prototype Pollution",
      advisory_url: "https://github.com/advisories/GHSA-jf85-cpcp-j695",
      package_manager: "npm",
    });
  });

  it("parses multiple vulnerabilities with different severities", () => {
    const output = JSON.stringify({
      vulnerabilities: {
        lodash: {
          name: "lodash",
          severity: "critical",
          via: [
            {
              title: "Prototype Pollution",
              url: "https://github.com/advisories/GHSA-1",
              severity: "critical",
            },
          ],
          fixAvailable: { name: "lodash", version: "4.17.21", isSemVerMajor: false },
        },
        minimist: {
          name: "minimist",
          severity: "moderate",
          via: [
            {
              title: "Prototype Pollution in minimist",
              url: "https://github.com/advisories/GHSA-2",
              severity: "moderate",
            },
          ],
          fixAvailable: false,
        },
      },
    });

    const result = parseNpmAudit(output);

    expect(result).toHaveLength(2);
    expect(result[0]!.severity).toBe("critical");
    expect(result[1]!.severity).toBe("medium");
    expect(result[1]!.fixed_version).toBeNull();
  });

  it("maps npm 'moderate' severity to 'medium'", () => {
    const output = JSON.stringify({
      vulnerabilities: {
        pkg: {
          name: "pkg",
          severity: "moderate",
          via: [{ title: "Issue", url: "https://example.com", severity: "moderate" }],
          fixAvailable: false,
        },
      },
    });

    const result = parseNpmAudit(output);

    expect(result[0]!.severity).toBe("medium");
  });

  it("handles vulnerability with string-only via entries (transitive)", () => {
    const output = JSON.stringify({
      vulnerabilities: {
        "some-wrapper": {
          name: "some-wrapper",
          severity: "high",
          via: ["actual-vuln-package"],
          fixAvailable: false,
        },
      },
    });

    const result = parseNpmAudit(output);

    // String-only via entries are transitive references — should be skipped
    expect(result).toHaveLength(0);
  });

  it("returns empty array for invalid JSON", () => {
    const result = parseNpmAudit("not valid json");
    expect(result).toEqual([]);
  });

  it("returns empty array for empty vulnerabilities object", () => {
    const output = JSON.stringify({ vulnerabilities: {} });
    const result = parseNpmAudit(output);
    expect(result).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  pip-audit parser                                                   */
/* ------------------------------------------------------------------ */

describe("parsePipAudit", () => {
  it("parses a single vulnerability with fix version and CVE alias", () => {
    const output = JSON.stringify([
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

    const result = parsePipAudit(output);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      package_name: "django",
      current_version: "3.2.0",
      severity: "high",
      advisory_id: "CVE-2023-36053",
      fixed_version: "3.2.20",
      description: "SQL injection vulnerability in Django",
      advisory_url: null,
      package_manager: "pip",
    });
  });

  it("uses primary id when no CVE alias is present", () => {
    const output = JSON.stringify([
      {
        name: "requests",
        version: "2.25.0",
        vulns: [
          {
            id: "PYSEC-2023-200",
            fix_versions: ["2.31.0"],
            aliases: [],
            description: "SSRF vulnerability",
          },
        ],
      },
    ]);

    const result = parsePipAudit(output);

    expect(result[0]!.advisory_id).toBe("PYSEC-2023-200");
  });

  it("parses multiple vulnerabilities across multiple packages", () => {
    const output = JSON.stringify([
      {
        name: "django",
        version: "3.2.0",
        vulns: [
          { id: "PYSEC-1", fix_versions: ["3.2.20"], aliases: [], description: "Vuln 1" },
          { id: "PYSEC-2", fix_versions: [], aliases: ["CVE-2023-1"], description: "Vuln 2" },
        ],
      },
      {
        name: "flask",
        version: "1.0.0",
        vulns: [
          { id: "PYSEC-3", fix_versions: ["2.0.0"], aliases: [], description: "Vuln 3" },
        ],
      },
    ]);

    const result = parsePipAudit(output);

    expect(result).toHaveLength(3);
    expect(result[1]!.fixed_version).toBeNull();
  });

  it("skips packages with no vulnerabilities", () => {
    const output = JSON.stringify([
      { name: "safe-pkg", version: "1.0.0", vulns: [] },
      {
        name: "vuln-pkg",
        version: "1.0.0",
        vulns: [{ id: "PYSEC-1", fix_versions: ["2.0.0"], aliases: [], description: "Vuln" }],
      },
    ]);

    const result = parsePipAudit(output);

    expect(result).toHaveLength(1);
    expect(result[0]!.package_name).toBe("vuln-pkg");
  });

  it("returns empty array for invalid JSON", () => {
    const result = parsePipAudit("not valid json");
    expect(result).toEqual([]);
  });

  it("returns empty array for empty array input", () => {
    const result = parsePipAudit("[]");
    expect(result).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  cargo audit parser                                                 */
/* ------------------------------------------------------------------ */

describe("parseCargoAudit", () => {
  it("parses a single vulnerability with patched version", () => {
    const output = JSON.stringify({
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

    const result = parseCargoAudit(output);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      package_name: "some-crate",
      current_version: "1.0.0",
      severity: "high",
      advisory_id: "RUSTSEC-2023-0001",
      fixed_version: ">=1.0.1",
      description: "Buffer overflow in some-crate",
      advisory_url: "https://rustsec.org/advisories/RUSTSEC-2023-0001.html",
      package_manager: "cargo",
    });
  });

  it("parses multiple vulnerabilities", () => {
    const output = JSON.stringify({
      vulnerabilities: {
        found: true,
        count: 2,
        list: [
          {
            advisory: { id: "RUSTSEC-1", title: "Vuln 1", description: "Desc 1", url: "https://url1" },
            versions: { patched: [">=2.0.0"], unaffected: [] },
            package: { name: "crate-a", version: "1.0.0" },
          },
          {
            advisory: { id: "RUSTSEC-2", title: "Vuln 2", description: "Desc 2", url: "https://url2" },
            versions: { patched: [], unaffected: [] },
            package: { name: "crate-b", version: "0.5.0" },
          },
        ],
      },
    });

    const result = parseCargoAudit(output);

    expect(result).toHaveLength(2);
    expect(result[0]!.fixed_version).toBe(">=2.0.0");
    expect(result[1]!.fixed_version).toBeNull();
  });

  it("returns empty array when no vulnerabilities found", () => {
    const output = JSON.stringify({
      vulnerabilities: {
        found: false,
        count: 0,
        list: [],
      },
    });

    const result = parseCargoAudit(output);
    expect(result).toEqual([]);
  });

  it("returns empty array for invalid JSON", () => {
    const result = parseCargoAudit("not valid json");
    expect(result).toEqual([]);
  });
});
