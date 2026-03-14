/**
 * Tool handler types for Craig MCP server.
 *
 * Defines the return types and parameter types for each MCP tool handler.
 * These types are owned by the core component — they bridge MCP tool
 * schemas to internal component interfaces.
 *
 * @module core/types
 */

import type { Finding } from "../state/index.js";

/* ------------------------------------------------------------------ */
/*  Valid Task Names                                                    */
/* ------------------------------------------------------------------ */

/**
 * Valid task names that can be triggered via craig_run_task.
 * Matches the spec's enumerated values.
 */
export const VALID_TASKS = [
  "merge_review",
  "coverage_scan",
  "security_scan",
  "tech_debt_audit",
  "dependency_check",
  "pattern_check",
  "auto_fix",
] as const;

export type ValidTask = (typeof VALID_TASKS)[number];

/**
 * Runtime check: is this string a valid task name?
 */
export function isValidTask(value: string): value is ValidTask {
  return VALID_TASKS.includes(value as ValidTask);
}

/* ------------------------------------------------------------------ */
/*  Tool Return Types                                                  */
/* ------------------------------------------------------------------ */

/** Return type for craig_status. */
export interface StatusResult {
  readonly running_tasks: string[];
  readonly last_runs: Record<string, string>;
  readonly health: "ok" | "degraded";
}

/** Success return type for craig_run_task. */
export interface RunTaskSuccess {
  readonly task_id: string;
  readonly status: "started";
}

/** Return type for craig_findings. */
export interface FindingsResult {
  readonly findings: Finding[];
}

/** Return type for craig_schedule. */
export interface ScheduleResult {
  readonly schedule: Record<string, string>;
}

/** Return type for craig_config. */
export interface ConfigResult {
  readonly config: Record<string, unknown>;
}

/** Return type for craig_digest. */
export interface DigestResult {
  readonly merges_reviewed: number;
  readonly issues_created: number;
  readonly prs_opened: number;
  readonly findings_by_severity: Record<string, number>;
  readonly period: string;
}

/** Standard error response for MCP tool failures. */
export interface ToolError {
  readonly error: string;
  readonly code: string;
}

/* ------------------------------------------------------------------ */
/*  Tool Input Types                                                   */
/* ------------------------------------------------------------------ */

/** Input parameters for craig_run_task. */
export interface RunTaskParams {
  readonly task: string;
  readonly repo?: string;
}

/** Input parameters for craig_findings. */
export interface FindingsParams {
  readonly severity?: string;
  readonly since?: string;
  readonly repo?: string;
}

/** Input parameters for craig_schedule. */
export interface ScheduleParams {
  readonly action: string;
  readonly task?: string;
  readonly cron?: string;
}

/** Input parameters for craig_config. */
export interface ConfigParams {
  readonly action: string;
  readonly key?: string;
  readonly value?: string;
}

/** Input parameters for craig_digest. */
export interface DigestParams {
  readonly period?: string;
  readonly repo?: string;
}

/** Input parameters for craig_status. */
export interface StatusParams {
  readonly repo?: string;
}
