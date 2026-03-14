/**
 * Audit output parsers for dependency-check analyzer.
 *
 * Pure functions that transform package manager audit JSON output
 * into normalized Vulnerability objects. Each parser handles one
 * package manager's output format.
 *
 * [CLEAN-CODE] Pure functions — no side effects, fully testable.
 * [SOLID/SRP] Each parser handles exactly one format.
 *
 * @module analyzers/dependency-check
 */

import type { Severity } from "../../state/index.js";
import type { Vulnerability } from "./dependency-check.types.js";

/* ------------------------------------------------------------------ */
/*  npm audit --json parser                                            */
/* ------------------------------------------------------------------ */

/** Shape of a single npm audit vulnerability entry. */
interface NpmVulnEntry {
  readonly name: string;
  readonly severity: string;
  readonly via: ReadonlyArray<NpmViaObject | string>;
  readonly fixAvailable: NpmFixAvailable | false;
}

/** Detailed advisory object in npm's "via" array. */
interface NpmViaObject {
  readonly title?: string;
  readonly url?: string;
  readonly severity?: string;
}

/** npm fix information when a fix is available. */
interface NpmFixAvailable {
  readonly name: string;
  readonly version: string;
  readonly isSemVerMajor: boolean;
}

/** Shape of npm audit --json output (v7+). */
interface NpmAuditOutput {
  readonly vulnerabilities: Record<string, NpmVulnEntry>;
}

/**
 * Parse npm audit --json output into normalized Vulnerability objects.
 *
 * Skips transitive-only entries (where `via` contains only strings).
 * Maps npm's "moderate" severity to our "medium".
 *
 * @param output - Raw JSON string from `npm audit --json`
 * @returns Array of normalized vulnerabilities
 */
export function parseNpmAudit(output: string): Vulnerability[] {
  let parsed: NpmAuditOutput;
  try {
    parsed = JSON.parse(output) as NpmAuditOutput;
  } catch {
    return [];
  }

  if (!parsed.vulnerabilities) {
    return [];
  }

  const results: Vulnerability[] = [];

  for (const entry of Object.values(parsed.vulnerabilities)) {
    const advisory = findFirstAdvisory(entry.via);
    if (!advisory) {
      continue; // Skip transitive-only entries (string-only via)
    }

    const fixVersion = extractNpmFixVersion(entry.fixAvailable);
    const advisoryId = extractAdvisoryIdFromUrl(advisory.url);

    results.push({
      package_name: entry.name,
      current_version: "",
      severity: mapNpmSeverity(entry.severity),
      advisory_id: advisoryId,
      fixed_version: fixVersion,
      description: advisory.title ?? "Unknown vulnerability",
      advisory_url: advisory.url ?? null,
      package_manager: "npm",
    });
  }

  return results;
}

/* ------------------------------------------------------------------ */
/*  pip-audit --format=json parser                                     */
/* ------------------------------------------------------------------ */

/** Shape of a pip-audit package entry. */
interface PipAuditEntry {
  readonly name: string;
  readonly version: string;
  readonly vulns: readonly PipVulnEntry[];
}

/** Shape of a single pip-audit vulnerability. */
interface PipVulnEntry {
  readonly id: string;
  readonly fix_versions: readonly string[];
  readonly aliases: readonly string[];
  readonly description: string;
}

/**
 * Parse pip-audit --format=json output into normalized Vulnerability objects.
 *
 * Prefers CVE alias over PYSEC ID for advisory_id.
 * Defaults severity to "high" since pip-audit doesn't provide severity.
 *
 * @param output - Raw JSON string from `pip-audit --format=json`
 * @returns Array of normalized vulnerabilities
 */
export function parsePipAudit(output: string): Vulnerability[] {
  let parsed: PipAuditEntry[];
  try {
    parsed = JSON.parse(output) as PipAuditEntry[];
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const results: Vulnerability[] = [];

  for (const pkg of parsed) {
    for (const vuln of pkg.vulns) {
      const cveAlias = vuln.aliases.find((alias) =>
        alias.startsWith("CVE-"),
      );
      const fixVersion =
        vuln.fix_versions.length > 0 ? vuln.fix_versions[0]! : null;

      results.push({
        package_name: pkg.name,
        current_version: pkg.version,
        severity: "high", // pip-audit doesn't provide severity levels
        advisory_id: cveAlias ?? vuln.id,
        fixed_version: fixVersion,
        description: vuln.description,
        advisory_url: null,
        package_manager: "pip",
      });
    }
  }

  return results;
}

/* ------------------------------------------------------------------ */
/*  cargo audit --json parser                                          */
/* ------------------------------------------------------------------ */

/** Shape of cargo audit --json output. */
interface CargoAuditOutput {
  readonly vulnerabilities: {
    readonly found: boolean;
    readonly count: number;
    readonly list: readonly CargoVulnEntry[];
  };
}

/** Shape of a single cargo audit vulnerability. */
interface CargoVulnEntry {
  readonly advisory: {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly url?: string;
  };
  readonly versions: {
    readonly patched: readonly string[];
    readonly unaffected: readonly string[];
  };
  readonly package: {
    readonly name: string;
    readonly version: string;
  };
}

/**
 * Parse cargo audit --json output into normalized Vulnerability objects.
 *
 * Defaults severity to "high" since basic cargo audit doesn't provide it.
 *
 * @param output - Raw JSON string from `cargo audit --json`
 * @returns Array of normalized vulnerabilities
 */
export function parseCargoAudit(output: string): Vulnerability[] {
  let parsed: CargoAuditOutput;
  try {
    parsed = JSON.parse(output) as CargoAuditOutput;
  } catch {
    return [];
  }

  if (!parsed.vulnerabilities?.found) {
    return [];
  }

  const results: Vulnerability[] = [];

  for (const entry of parsed.vulnerabilities.list) {
    const fixVersion =
      entry.versions.patched.length > 0
        ? entry.versions.patched[0]!
        : null;

    results.push({
      package_name: entry.package.name,
      current_version: entry.package.version,
      severity: "high", // cargo audit doesn't provide severity in basic output
      advisory_id: entry.advisory.id,
      fixed_version: fixVersion,
      description: entry.advisory.title,
      advisory_url: entry.advisory.url ?? null,
      package_manager: "cargo",
    });
  }

  return results;
}

/* ------------------------------------------------------------------ */
/*  Private helpers                                                    */
/* ------------------------------------------------------------------ */

/**
 * Find the first advisory object in npm's "via" array.
 * Entries can be objects (direct advisories) or strings (transitive refs).
 * Returns null if no advisory objects exist.
 */
function findFirstAdvisory(
  via: ReadonlyArray<NpmViaObject | string>,
): NpmViaObject | null {
  for (const entry of via) {
    if (typeof entry === "object" && entry !== null) {
      return entry;
    }
  }
  return null;
}

/**
 * Extract fix version from npm's fixAvailable field.
 * Returns null when fixAvailable is false.
 */
function extractNpmFixVersion(
  fixAvailable: NpmFixAvailable | false,
): string | null {
  if (fixAvailable === false) {
    return null;
  }
  return fixAvailable.version;
}

/**
 * Extract advisory ID from a GitHub advisory URL.
 * e.g., "https://github.com/advisories/GHSA-jf85-cpcp-j695" → "GHSA-jf85-cpcp-j695"
 * Falls back to the full URL if pattern doesn't match.
 */
function extractAdvisoryIdFromUrl(url?: string): string {
  if (!url) return "UNKNOWN";

  const match = url.match(/\/([A-Z][\w-]+)$/);
  return match?.[1] ?? url;
}

/**
 * Map npm severity strings to our Severity type.
 * npm uses "moderate" where we use "medium".
 */
function mapNpmSeverity(npmSeverity: string): Severity {
  const mapping: Record<string, Severity> = {
    critical: "critical",
    high: "high",
    moderate: "medium",
    low: "low",
    info: "info",
  };
  return mapping[npmSeverity] ?? "medium";
}
