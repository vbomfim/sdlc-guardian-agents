/**
 * ConfigPort — Public interface for the Config component.
 *
 * All consumers depend on this port, never on the implementation.
 * This boundary ensures the config adapter is rewritable without
 * changing any downstream component.
 *
 * @module config
 */

/**
 * Craig configuration object.
 * Fully validated and typed — consumers can trust all fields exist.
 */
export interface CraigConfig {
  /** Repository in "owner/repo" format */
  readonly repo: string;
  /** Branch to monitor (default: "main") */
  readonly branch: string;
  /** Task schedules: cron expressions or "on_push" */
  readonly schedule: Record<string, string>;
  /** Feature toggles for each capability */
  readonly capabilities: Record<string, boolean>;
  /** Model configuration for different tasks */
  readonly models: {
    readonly code_review?: string[];
    readonly security?: string;
    readonly default: string;
  };
  /** Autonomy settings — what Craig is allowed to do */
  readonly autonomy: {
    readonly create_issues: boolean;
    readonly create_draft_prs: boolean;
    readonly auto_merge: false; // NEVER true — enforced by schema
  };
  /** Guardian agent configuration */
  readonly guardians: {
    readonly path: string;
  };
}

/**
 * Port (interface) for configuration loading and management.
 *
 * Consumers depend on this contract. The adapter behind it
 * can be swapped (YAML file, env vars, remote config) without
 * changing any consumer code.
 */
export interface ConfigPort {
  /** Load config from file. Resolves path: argument > CRAIG_CONFIG env > ./craig.config.yaml */
  load(configPath?: string): Promise<CraigConfig>;
  /** Get the currently loaded config. Throws if not yet loaded. */
  get(): CraigConfig;
  /** Update a config key (dot-notation) and persist to disk. */
  update(key: string, value: unknown): Promise<CraigConfig>;
  /** Validate raw parsed data against the schema. Throws on invalid. */
  validate(raw: unknown): CraigConfig;
}
