/**
 * Result Parser — Parses Guardian agent handoff reports into structured data.
 *
 * Pure function component. No side effects, no I/O.
 * Takes raw markdown → outputs structured ParsedReport.
 *
 * Design decisions:
 * - Uses regex-based table parsing (no external deps) [YAGNI]
 * - Never throws — returns empty/partial results on parse failure [CLEAN-CODE]
 * - Parses generously, validates gently — handles format variations
 * - Each parse step is a small pure function [CLEAN-CODE] [SRP]
 *
 * @module result-parser
 */

import type {
  ResultParserPort,
  ParsedReport,
  ParsedFinding,
  CoverageGap,
  GuardianType,
  Severity,
} from "./types.js";

// ---------------------------------------------------------------------------
// Severity Mapping
// ---------------------------------------------------------------------------

/** Maps emoji markers and text labels to normalized severity values. */
const SEVERITY_MAP: ReadonlyMap<string, Severity> = new Map([
  ["🔴", "critical"],
  ["CRITICAL", "critical"],
  ["🟠", "high"],
  ["HIGH", "high"],
  ["🟡", "medium"],
  ["MEDIUM", "medium"],
  ["🔵", "low"],
  ["LOW", "low"],
  ["ℹ️", "info"],
  ["INFO", "info"],
]);

// ---------------------------------------------------------------------------
// Standard Findings Table Column Names
// ---------------------------------------------------------------------------

/**
 * Known column header names for findings tables.
 * Used to map table columns to ParsedFinding fields regardless of header casing.
 */
const COLUMN_ALIASES: ReadonlyMap<string, keyof ParsedFinding> = new Map([
  ["#", "number"],
  ["severity", "severity"],
  ["category", "category"],
  ["domain", "category"],
  ["file:line", "file_line"],
  ["issue", "issue"],
  ["source & justification", "source_justification"],
  ["source &amp; justification", "source_justification"],
  ["suggested fix", "suggested_fix"],
]);

// ---------------------------------------------------------------------------
// Section Extraction
// ---------------------------------------------------------------------------

/**
 * Extract the text content of a markdown section by heading.
 * Returns content between the heading and the next heading of equal or higher level.
 */
function extractSection(markdown: string, headingPattern: RegExp): string {
  const match = headingPattern.exec(markdown);
  if (!match) return "";

  const startIndex = match.index + match[0].length;
  const remainingText = markdown.slice(startIndex);

  // Find the next heading of equal or higher level (fewer or equal #)
  const headingLevel = (match[0].match(/^#+/) ?? ["###"])[0]!.length;
  const nextHeadingPattern = new RegExp(
    `^#{1,${headingLevel}}\\s`,
    "m"
  );
  const nextMatch = nextHeadingPattern.exec(remainingText);

  const sectionText = nextMatch
    ? remainingText.slice(0, nextMatch.index)
    : remainingText;

  return sectionText.trim();
}

/**
 * Extract the summary from a `### Summary` section.
 */
function extractSummary(markdown: string): string {
  return extractSection(markdown, /^###\s+Summary\s*$/m);
}

// ---------------------------------------------------------------------------
// Table Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a markdown table into an array of row objects.
 * Returns an array of maps from column header → cell value.
 */
function parseMarkdownTable(
  tableText: string
): Array<Map<string, string>> {
  const lines = tableText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"));

  if (lines.length < 2) return [];

  // First line is the header
  const headerLine = lines[0]!;
  const headers = splitTableRow(headerLine);

  // Second line should be the separator (|---|---|...)
  // Skip it and any other separator lines
  const dataLines = lines.slice(1).filter((line) => !isSeparatorRow(line));

  return dataLines.map((line) => {
    const cells = splitTableRow(line);
    const row = new Map<string, string>();
    headers.forEach((header, index) => {
      row.set(header.toLowerCase(), cells[index] ?? "");
    });
    return row;
  });
}

/** Split a markdown table row into cell values, trimming each cell. */
function splitTableRow(line: string): string[] {
  return line
    .slice(1, -1) // Remove leading and trailing |
    .split("|")
    .map((cell) => cell.trim());
}

/** Check if a table row is a separator row (|---|---|...). */
function isSeparatorRow(line: string): boolean {
  return /^\|[\s\-:|]+\|$/.test(line);
}

// ---------------------------------------------------------------------------
// Findings Extraction
// ---------------------------------------------------------------------------

/**
 * Find all markdown tables in the document that look like findings tables.
 * A findings table has a column named "#" or "Severity".
 */
function findAllFindingsTables(markdown: string): string[] {
  const tables: string[] = [];
  const lines = markdown.split("\n");
  let currentTable: string[] = [];
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const isTableLine =
      trimmed.startsWith("|") && trimmed.endsWith("|");

    if (isTableLine) {
      currentTable.push(trimmed);
      inTable = true;
    } else {
      if (inTable && currentTable.length >= 2) {
        // Check if this table is a findings table
        const headerLine = currentTable[0]!.toLowerCase();
        if (
          headerLine.includes("severity") ||
          (headerLine.includes("| # |") && headerLine.includes("issue"))
        ) {
          tables.push(currentTable.join("\n"));
        }
      }
      currentTable = [];
      inTable = false;
    }
  }

  // Handle table at end of document
  if (inTable && currentTable.length >= 2) {
    const headerLine = currentTable[0]!.toLowerCase();
    if (
      headerLine.includes("severity") ||
      (headerLine.includes("| # |") && headerLine.includes("issue"))
    ) {
      tables.push(currentTable.join("\n"));
    }
  }

  return tables;
}

/**
 * Parse severity text (with emoji) into a normalized Severity enum value.
 */
function parseSeverity(text: string): Severity {
  const trimmed = text.trim();

  for (const [marker, severity] of SEVERITY_MAP) {
    if (trimmed.includes(marker)) {
      return severity;
    }
  }

  return "info";
}

/**
 * Map a table row to a ParsedFinding, using column aliases to
 * map header names to finding fields.
 */
function rowToFinding(
  row: Map<string, string>,
  fallbackNumber: number
): ParsedFinding {
  // Build a field map by matching column aliases
  const fields: Record<string, string> = {};
  for (const [columnHeader, cellValue] of row) {
    const fieldName = COLUMN_ALIASES.get(columnHeader);
    if (fieldName) {
      fields[fieldName] = cellValue;
    }
  }

  const rawNumber = fields["number"] ?? "";
  const parsedNumber = parseInt(rawNumber, 10);

  return {
    number: isNaN(parsedNumber) ? fallbackNumber : parsedNumber,
    severity: parseSeverity(fields["severity"] ?? ""),
    category: (fields["category"] ?? "").trim(),
    file_line: (fields["file_line"] ?? "").trim(),
    issue: (fields["issue"] ?? "").trim(),
    source_justification: (fields["source_justification"] ?? "").trim(),
    suggested_fix: (fields["suggested_fix"] ?? "").trim(),
  };
}

/**
 * Extract all findings from a markdown report.
 * Finds all findings tables and parses their rows.
 */
function extractFindings(markdown: string): ParsedFinding[] {
  const tables = findAllFindingsTables(markdown);
  const findings: ParsedFinding[] = [];
  let runningNumber = 1;

  for (const tableText of tables) {
    const rows = parseMarkdownTable(tableText);
    for (const row of rows) {
      findings.push(rowToFinding(row, runningNumber));
      runningNumber++;
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Recommended Actions Extraction
// ---------------------------------------------------------------------------

/**
 * Extract action items from the `### Recommended Actions` section.
 * Parses checkbox items (`- [ ] text` or `- [x] text`).
 */
function extractRecommendedActions(markdown: string): string[] {
  const sectionText = extractSection(
    markdown,
    /^###\s+Recommended Actions\s*$/m
  );
  if (!sectionText) return [];

  const checkboxPattern = /^-\s+\[[ x]\]\s+(.+)$/gm;
  const actions: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = checkboxPattern.exec(sectionText)) !== null) {
    const actionText = match[1]?.trim();
    if (actionText) {
      actions.push(actionText);
    }
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Metrics Extraction (Code Review Guardian)
// ---------------------------------------------------------------------------

/**
 * Extract key-value metrics from the `### Metrics` section.
 * Parses lines like `- Key: value`.
 */
function extractMetrics(
  markdown: string
): Record<string, string | number> | undefined {
  const sectionText = extractSection(markdown, /^###\s+Metrics\s*$/m);
  if (!sectionText) return undefined;

  const metrics: Record<string, string | number> = {};
  const linePattern = /^-\s+(.+?):\s+(.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = linePattern.exec(sectionText)) !== null) {
    const key = match[1]?.trim();
    const value = match[2]?.trim();
    if (key && value !== undefined) {
      // Try to parse numeric values
      const numericValue = Number(value);
      metrics[key] = isNaN(numericValue) ? value : numericValue;
    }
  }

  return Object.keys(metrics).length > 0 ? metrics : undefined;
}

// ---------------------------------------------------------------------------
// Coverage Gaps Extraction (QA Guardian)
// ---------------------------------------------------------------------------

/**
 * Find the Coverage Gaps table and parse it.
 * Table format: `| Gap | Risk | Status |`
 */
function extractCoverageGaps(
  markdown: string
): CoverageGap[] | undefined {
  const sectionText = extractSection(
    markdown,
    /^###\s+Coverage Gaps Found\s*$/m
  );
  if (!sectionText) return undefined;

  const rows = parseMarkdownTable(sectionText);
  if (rows.length === 0) return undefined;

  const gaps: CoverageGap[] = rows.map((row) => ({
    gap: (row.get("gap") ?? "").trim(),
    risk: parseSeverity(row.get("risk") ?? ""),
    status: (row.get("status") ?? "").trim(),
  }));

  return gaps.length > 0 ? gaps : undefined;
}

// ---------------------------------------------------------------------------
// Factory Function
// ---------------------------------------------------------------------------

/**
 * Create a new ResultParser instance.
 *
 * Factory function pattern — returns the port interface.
 * The implementation is encapsulated; consumers depend only on ResultParserPort.
 *
 * @example
 * ```typescript
 * import { createResultParser } from "./result-parser.js";
 *
 * const parser = createResultParser();
 * const report = parser.parse(markdownText, "security");
 * console.log(report.findings.length);
 * ```
 */
export function createResultParser(): ResultParserPort {
  return {
    parse(markdown: string, guardianType: GuardianType): ParsedReport {
      try {
        return {
          guardian: guardianType,
          summary: extractSummary(markdown),
          findings: extractFindings(markdown),
          recommended_actions: extractRecommendedActions(markdown),
          metrics: extractMetrics(markdown),
          coverage_gaps: extractCoverageGaps(markdown),
          raw: markdown,
        };
      } catch {
        // Graceful degradation — never throw [CLEAN-CODE]
        return {
          guardian: guardianType,
          summary: "",
          findings: [],
          recommended_actions: [],
          raw: markdown,
        };
      }
    },
  };
}
