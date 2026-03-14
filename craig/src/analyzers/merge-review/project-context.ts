/**
 * Project Context — Gathers repository context for scope classification.
 *
 * Fetches README and language breakdown from the Git provider to help
 * PO Guardian determine whether a finding belongs in this project.
 *
 * [SRP] Single purpose: project context gathering and classification parsing.
 * [CLEAN-CODE] Pure functions for parsing; side effects isolated to gathering.
 * [HEXAGONAL] Depends only on GitPort — no adapter imports.
 *
 * @module analyzers/merge-review/project-context
 */

import type { GitPort } from "../../git-port/git.port.js";
import type { ParsedFinding } from "../../result-parser/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Gathered project context for scope classification. */
export interface ProjectContext {
  /** README.md content (truncated to ~2000 chars). */
  readonly readme: string;
  /** Language breakdown from the Git provider (language → bytes). */
  readonly languages: Record<string, number>;
  /** Dominant language by byte count. */
  readonly primaryLanguage: string;
}

/**
 * PO Guardian classification of a finding's relevance to the project.
 *
 * - IN_SCOPE: Finding belongs to this project → create fix ticket
 * - QUESTIONABLE: Unclear fit → ask commit author for clarification
 * - OUT_OF_SCOPE: File doesn't belong → recommend removal
 */
export type FindingClassification = "IN_SCOPE" | "QUESTIONABLE" | "OUT_OF_SCOPE";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum README length before truncation. */
const MAX_README_LENGTH = 2000;

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

/**
 * Module-level cache for project context.
 *
 * Project context (README, languages) doesn't change within a run.
 * Cache avoids redundant API calls when processing multiple findings.
 */
let _cachedProjectContext: ProjectContext | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Gather project context from the Git provider.
 *
 * Fetches README.md and language breakdown. Results are cached —
 * subsequent calls return the cached value without API calls.
 *
 * [CLEAN-CODE] Never throws — returns empty defaults on failure.
 *
 * @param github - Git provider port
 * @returns Project context with readme, languages, and primary language
 */
export async function gatherProjectContext(
  github: GitPort,
): Promise<ProjectContext> {
  if (_cachedProjectContext) {
    return _cachedProjectContext;
  }

  let readme = "";
  let languages: Record<string, number> = {};

  // Fetch README — gracefully handle missing/unreadable
  try {
    readme = await github.getFileContents("README.md");
    if (readme.length > MAX_README_LENGTH) {
      readme = readme.slice(0, MAX_README_LENGTH) + "\n... (truncated)";
    }
  } catch {
    // README not found or unreadable — continue with empty
  }

  // Fetch languages — gracefully handle API unavailability
  try {
    languages = await github.getLanguages();
  } catch {
    // Languages API unavailable — continue with empty
  }

  const primaryLanguage = derivePrimaryLanguage(languages);

  const context: ProjectContext = { readme, languages, primaryLanguage };
  _cachedProjectContext = context;
  return context;
}

/**
 * Clear the project context cache.
 *
 * Exposed for testing — allows each test to start with a clean cache.
 */
export function clearProjectContextCache(): void {
  _cachedProjectContext = null;
}

/**
 * Parse a PO Guardian classification response.
 *
 * Looks for classification keywords in the output. Checks in order
 * of restrictiveness: OUT_OF_SCOPE > QUESTIONABLE > IN_SCOPE.
 * Defaults to IN_SCOPE if no keyword found (safest — preserves
 * existing behavior of creating fix tickets).
 *
 * [CLEAN-CODE] Pure function — no side effects.
 *
 * @param output - Raw PO Guardian output text
 * @returns Parsed classification
 */
export function parseClassification(output: string): FindingClassification {
  const upper = output.toUpperCase();

  // Check most restrictive first
  if (upper.includes("OUT_OF_SCOPE")) {
    return "OUT_OF_SCOPE";
  }
  if (upper.includes("QUESTIONABLE")) {
    return "QUESTIONABLE";
  }

  // Default: IN_SCOPE (safest — preserves existing behavior)
  return "IN_SCOPE";
}

/**
 * Build the classification prompt for PO Guardian.
 *
 * Combines project context with finding details to ask PO Guardian
 * whether the finding belongs in this project.
 *
 * [CLEAN-CODE] Pure function — deterministic output from inputs.
 *
 * @param finding - The parsed finding to classify
 * @param projectContext - Gathered project context
 * @returns Prompt string for PO Guardian classification
 */
export function buildClassificationPrompt(
  finding: ParsedFinding,
  projectContext: ProjectContext,
): string {
  const languageList = Object.entries(projectContext.languages)
    .sort(([, a], [, b]) => b - a)
    .map(([lang, bytes]) => `${lang}: ${bytes} bytes`)
    .join(", ");

  return [
    "You are evaluating whether a code finding belongs to this project.",
    "Given the project context below, classify the finding as one of:",
    "",
    "- **IN_SCOPE** — The finding is relevant to this project and should be fixed.",
    "- **QUESTIONABLE** — It's unclear whether this file/finding belongs. The commit author should be asked.",
    "- **OUT_OF_SCOPE** — The file clearly doesn't belong in this project (wrong language, test artifact, etc.).",
    "",
    "## Project Context",
    "",
    `**Primary Language:** ${projectContext.primaryLanguage}`,
    `**Languages:** ${languageList || "unknown"}`,
    "",
    "**README (excerpt):**",
    projectContext.readme || "(no README found)",
    "",
    "## Finding to Classify",
    "",
    `**Severity:** ${finding.severity.toUpperCase()}`,
    `**Category:** ${finding.category}`,
    `**File:** ${finding.file_line || "N/A"}`,
    `**Issue:** ${finding.issue}`,
    `**Justification:** ${finding.source_justification}`,
    `**Suggested Fix:** ${finding.suggested_fix}`,
    "",
    "## Instructions",
    "",
    "Respond with EXACTLY one of: IN_SCOPE, QUESTIONABLE, or OUT_OF_SCOPE",
    "followed by a brief explanation (1-2 sentences).",
    "If QUESTIONABLE or OUT_OF_SCOPE, include a suggested question to ask the commit author.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Determine the primary language from a language byte-count map.
 *
 * @param languages - Language → byte count mapping
 * @returns Name of the language with the most bytes, or "unknown"
 */
function derivePrimaryLanguage(languages: Record<string, number>): string {
  const entries = Object.entries(languages);
  if (entries.length === 0) {
    return "unknown";
  }

  entries.sort(([, a], [, b]) => b - a);
  return entries[0]![0]!;
}
