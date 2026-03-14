/**
 * Zod schema for craig.config.yaml validation.
 *
 * Defines the shape, defaults, and constraints of the config.
 * This is the single source of truth for config structure.
 *
 * @module config
 */

import { z } from "zod";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Regex for "owner/repo" format. */
const REPO_PATTERN = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;

/**
 * Patterns that indicate a secret was accidentally placed in the config.
 * @see [OWASP-A04] — no secrets in config files
 */
const SECRET_PREFIXES = ["ghp_", "ghs_", "gho_", "ghu_", "github_pat_"];

/**
 * Validate that a string does not look like a secret token.
 * Returns true if safe, false if it looks like a secret.
 */
function isNotSecret(value: string): boolean {
  return !SECRET_PREFIXES.some((prefix) => value.startsWith(prefix));
}

/**
 * Recursively scan an object for string values that look like secrets.
 * Returns an array of dot-notation paths where secrets were found.
 */
function findSecrets(obj: unknown, currentPath: string = ""): string[] {
  const found: string[] = [];

  if (typeof obj === "string") {
    if (!isNotSecret(obj)) {
      found.push(currentPath || "(root)");
    }
  } else if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      found.push(...findSecrets(obj[i], `${currentPath}[${i}]`));
    }
  } else if (typeof obj === "object" && obj !== null) {
    for (const [key, value] of Object.entries(obj)) {
      const childPath = currentPath ? `${currentPath}.${key}` : key;
      found.push(...findSecrets(value, childPath));
    }
  }

  return found;
}

/** Non-secret string — reusable refinement. */
const safeString = z.string().refine(isNotSecret, {
  message:
    "Config values must not contain secrets (tokens starting with ghp_, ghs_, gho_, ghu_, github_pat_)",
});

/**
 * Validate a cron expression (basic 5-field check) or special value "on_push".
 * We validate structure, not deep cron semantics.
 */
const CRON_OR_ON_PUSH = z.string().refine(
  (val) => {
    if (val === "on_push") return true;
    // Basic cron: 5 space-separated fields
    const parts = val.trim().split(/\s+/);
    return parts.length === 5;
  },
  { message: "Must be a valid cron expression (5 fields) or 'on_push'" },
);

/* ------------------------------------------------------------------ */
/*  Schema                                                             */
/* ------------------------------------------------------------------ */

export const craigConfigSchema = z
  .object({
    repo: z
      .string()
      .min(1, "repo is required")
      .regex(REPO_PATTERN, 'repo must be in "owner/repo" format')
      .refine(isNotSecret, {
        message: "repo must not contain secrets",
      }),

    branch: safeString.default("main"),

    schedule: z.record(z.string(), CRON_OR_ON_PUSH).default({}),

    capabilities: z
      .object({
        merge_review: z.boolean().default(true),
        coverage_gaps: z.boolean().default(true),
        bug_detection: z.boolean().default(true),
        pattern_enforcement: z.boolean().default(true),
        po_audit: z.boolean().default(true),
        auto_fix: z.boolean().default(true),
        dependency_updates: z.boolean().default(true),
      })
      .default({
        merge_review: true,
        coverage_gaps: true,
        bug_detection: true,
        pattern_enforcement: true,
        po_audit: true,
        auto_fix: true,
        dependency_updates: true,
      }),

    models: z
      .object({
        code_review: z.array(safeString).optional(),
        security: safeString.optional(),
        default: safeString.default("claude-sonnet-4.5"),
      })
      .default({ default: "claude-sonnet-4.5" }),

    autonomy: z
      .object({
        create_issues: z.boolean().default(true),
        create_draft_prs: z.boolean().default(true),
        auto_merge: z
          .boolean()
          .default(false)
          .transform(() => false as const), // NEVER true — enforced by spec
      })
      .default({
        create_issues: true,
        create_draft_prs: true,
        auto_merge: false,
      }),

    guardians: z
      .object({
        path: safeString.default("~/.copilot/"),
      })
      .default({ path: "~/.copilot/" }),
  })
  .strip() // Drop unknown fields — prevents secret smuggling via unvalidated keys
  .superRefine((data, ctx) => {
    // Recursive secret scan catches secrets in any remaining field,
    // including those in nested records like `schedule`.
    const secretPaths = findSecrets(data);
    for (const secretPath of secretPaths) {
      ctx.addIssue({
        code: "custom",
        message: `Secret-like value detected at "${secretPath}". Config values must not contain tokens.`,
        path: secretPath.split("."),
      });
    }
  });

/**
 * CraigConfig type derived from the Zod schema.
 *
 * This replaces the manually-maintained interface, ensuring the type
 * and schema can never drift out of sync.
 *
 * @see [DRY] — single source of truth
 */
export type CraigConfig = z.infer<typeof craigConfigSchema>;
