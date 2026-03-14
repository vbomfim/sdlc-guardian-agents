/**
 * FilePatternStore — Adapter for persisting learned patterns to disk.
 *
 * Implements the PatternStorePort interface. Stores patterns in
 * `.craig-patterns.json` using atomic writes (temp file + rename).
 *
 * Learning is delegated to Code Review Guardian via CopilotPort.
 * The adapter handles JSON parsing, validation, corruption recovery,
 * and file I/O.
 *
 * [HEXAGONAL] Adapter implementing PatternStorePort.
 * [CLEAN-CODE] SRP — only responsible for pattern persistence + learning.
 *
 * @module analyzers/pattern-check/file-pattern-store
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CopilotPort } from "../../copilot/index.js";
import type { PatternStorePort } from "./pattern-store.port.js";
import type { PatternSet, PatternRule } from "./types.js";
import { PatternLearningError } from "./errors.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PATTERNS_FILENAME = ".craig-patterns.json";
const TEMP_SUFFIX = ".tmp";
const BACKUP_SUFFIX = ".bak";

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * File-based adapter for pattern storage.
 *
 * Persists patterns to `.craig-patterns.json` in the specified directory.
 * Learning is performed by invoking Code Review Guardian via CopilotPort.
 */
export class FilePatternStore implements PatternStorePort {
  private readonly filePath: string;

  constructor(
    baseDir: string,
    private readonly copilot: CopilotPort,
  ) {
    this.filePath = path.join(baseDir, PATTERNS_FILENAME);
  }

  /**
   * Analyze the repository and learn coding patterns via Code Review Guardian.
   *
   * Invokes Code Review Guardian with a structured prompt asking it
   * to analyze the codebase and return a JSON PatternSet.
   *
   * @param repoPath - Path to the repository root
   * @returns Learned PatternSet with current timestamp
   * @throws PatternLearningError if Copilot fails or returns unparseable output
   */
  async learn(repoPath: string): Promise<PatternSet> {
    const result = await this.copilot.invoke({
      agent: "code-review-guardian",
      prompt: this.buildLearnPrompt(),
      context: `Repository path: ${repoPath}`,
    });

    if (!result.success) {
      throw new PatternLearningError(
        `Pattern learning failed: ${result.error}`,
      );
    }

    const parsed = this.parseLearnedPatterns(result.output);

    return {
      ...parsed,
      learned_at: new Date().toISOString(),
    };
  }

  /**
   * Load patterns from `.craig-patterns.json`.
   *
   * Returns null if the file doesn't exist. If the file is corrupted,
   * backs it up to `.bak` and returns null.
   *
   * @returns PatternSet or null
   */
  async load(): Promise<PatternSet | null> {
    try {
      const content = await fs.readFile(this.filePath, "utf-8");
      return JSON.parse(content) as PatternSet;
    } catch (error: unknown) {
      if (isFileNotFoundError(error)) {
        return null;
      }

      // File exists but is corrupted — back up and return null
      console.error(
        `[Craig] Pattern store corrupted: ${this.filePath}. Backing up.`,
      );
      await this.backupCorruptedFile();
      return null;
    }
  }

  /**
   * Persist patterns to `.craig-patterns.json` using atomic writes.
   *
   * Writes to a `.tmp` file first, then renames to the final path.
   * This prevents corruption from partial writes.
   *
   * @param patterns - The PatternSet to persist
   */
  async save(patterns: PatternSet): Promise<void> {
    const tmpPath = this.filePath + TEMP_SUFFIX;
    const content = JSON.stringify(patterns, null, 2) + "\n";

    await fs.writeFile(tmpPath, content, "utf-8");
    await fs.rename(tmpPath, this.filePath);
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Build the prompt for Code Review Guardian to analyze repository patterns.
   */
  private buildLearnPrompt(): string {
    return [
      "Analyze this repository's codebase and identify established coding patterns.",
      "Return a JSON object (no markdown, no explanation) with these exact keys:",
      "",
      "- naming_conventions: Array of PatternRule objects for naming patterns",
      "- file_structure: Array of PatternRule objects for directory/file structure patterns",
      "- error_handling: Array of PatternRule objects for error handling patterns",
      "- import_conventions: Array of PatternRule objects for import/export patterns",
      "",
      "Each PatternRule must have:",
      '- name: string (kebab-case identifier, e.g. "camelCase-functions")',
      '- pattern: string (description of the pattern observed)',
      '- frequency: string (e.g. "15/18 files")',
      '- severity: "warning" or "info"',
      '- description: string (human-readable explanation)',
      "",
      "Focus on patterns that appear in the MAJORITY of files.",
      "Only include patterns with clear evidence (frequency > 50%).",
      "Return ONLY the JSON object, no other text.",
    ].join("\n");
  }

  /**
   * Parse the JSON output from Code Review Guardian into a PatternSet.
   *
   * Handles JSON wrapped in markdown code fences (`\`\`\`json ... \`\`\``).
   *
   * @throws PatternLearningError if the output cannot be parsed
   */
  private parseLearnedPatterns(output: string): Omit<PatternSet, "learned_at"> {
    const jsonString = this.extractJson(output);

    try {
      const parsed = JSON.parse(jsonString) as Record<string, unknown>;

      return {
        naming_conventions: this.validateRules(parsed.naming_conventions),
        file_structure: this.validateRules(parsed.file_structure),
        error_handling: this.validateRules(parsed.error_handling),
        import_conventions: this.validateRules(parsed.import_conventions),
      };
    } catch (error: unknown) {
      throw new PatternLearningError(
        `Pattern learning failed: unable to parse Copilot output as JSON`,
        { cause: error },
      );
    }
  }

  /**
   * Extract JSON from output that may be wrapped in markdown code fences.
   */
  private extractJson(output: string): string {
    // Match ```json ... ``` or ``` ... ```
    const fenceMatch = output.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch?.[1]) {
      return fenceMatch[1].trim();
    }
    return output.trim();
  }

  /**
   * Validate and normalize an array of pattern rules.
   * Returns empty array if input is not a valid array.
   */
  private validateRules(input: unknown): PatternRule[] {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .filter((item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
      )
      .map((item) => ({
        name: String(item.name ?? ""),
        pattern: String(item.pattern ?? ""),
        frequency: String(item.frequency ?? ""),
        severity: item.severity === "info" ? "info" as const : "warning" as const,
        description: String(item.description ?? ""),
      }));
  }

  /**
   * Back up a corrupted patterns file to `.bak`.
   */
  private async backupCorruptedFile(): Promise<void> {
    try {
      await fs.copyFile(this.filePath, this.filePath + BACKUP_SUFFIX);
    } catch {
      // If backup fails too, just proceed — the corrupted file will be overwritten on next save
    }
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Check if an error is a "file not found" error (ENOENT).
 */
function isFileNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
