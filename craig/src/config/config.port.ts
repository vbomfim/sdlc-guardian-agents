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
 *
 * Derived from the Zod schema via `z.infer` — the schema is the single
 * source of truth. This re-export keeps the port file as the canonical
 * import location for consumers.
 *
 * @see config.schema.ts — the Zod schema that defines this type
 * @see [DRY] — type derived from schema, never manually maintained
 */
export type { CraigConfig } from "./config.schema.js";

/**
 * Port (interface) for configuration loading and management.
 *
 * Consumers depend on this contract. The adapter behind it
 * can be swapped (YAML file, env vars, remote config) without
 * changing any consumer code.
 */

// Import CraigConfig for use in this file's interface declarations
import type { CraigConfig } from "./config.schema.js";

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
