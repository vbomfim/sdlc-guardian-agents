/**
 * ConfigLoader — Adapter implementation of ConfigPort.
 *
 * Loads craig.config.yaml from disk, validates with zod,
 * and provides typed access to the configuration.
 *
 * Path resolution order:
 *   1. Explicit `configPath` argument
 *   2. `CRAIG_CONFIG` environment variable
 *   3. `./craig.config.yaml` (default)
 *
 * @module config
 */

import * as fs from "node:fs/promises";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { ConfigPort, CraigConfig } from "./config.port.js";
import { craigConfigSchema } from "./config.schema.js";
import {
  ConfigNotFoundError,
  ConfigValidationError,
  ConfigParseError,
} from "./config.errors.js";

/** Default path when no override is provided. */
const DEFAULT_CONFIG_PATH = "./craig.config.yaml";

export class ConfigLoader implements ConfigPort {
  private config: CraigConfig | null = null;
  private configPath: string | null = null;

  /**
   * Load config from a YAML file.
   *
   * @param configPath - Path to the config file (optional).
   *   Falls back to CRAIG_CONFIG env var, then ./craig.config.yaml.
   * @returns Validated CraigConfig object.
   * @throws {ConfigNotFoundError} If the file does not exist.
   * @throws {ConfigParseError} If the file is not valid YAML.
   * @throws {ConfigValidationError} If the schema validation fails.
   */
  async load(configPath?: string): Promise<CraigConfig> {
    const resolvedPath = this.resolvePath(configPath);
    const rawYaml = await this.readFile(resolvedPath);
    const parsed = this.parseYaml(rawYaml);
    const config = this.validate(parsed);

    this.config = config;
    this.configPath = resolvedPath;
    return config;
  }

  /**
   * Get the currently loaded config.
   *
   * @returns The loaded CraigConfig.
   * @throws {Error} If load() has not been called yet.
   */
  get(): CraigConfig {
    if (this.config === null) {
      throw new Error(
        "Config not loaded. Call load() before accessing config.",
      );
    }
    return this.config;
  }

  /**
   * Update a config value by dot-notation key and persist to disk.
   *
   * @param key - Dot-notation path (e.g., "capabilities.auto_fix").
   * @param value - New value to set.
   * @returns Updated CraigConfig.
   * @throws {Error} If config is not loaded.
   * @throws {ConfigValidationError} If the update would make config invalid.
   */
  async update(key: string, value: unknown): Promise<CraigConfig> {
    if (this.config === null || this.configPath === null) {
      throw new Error(
        "Config not loaded. Call load() before updating config.",
      );
    }

    // Read the current file to preserve comments/formatting as much as possible
    const rawYaml = await this.readFile(this.configPath);
    const parsed = this.parseYaml(rawYaml) as Record<string, unknown>;

    // Apply the update using dot-notation
    this.setNestedValue(parsed, key, value);

    // Validate the updated config
    const updated = this.validate(parsed);

    // Write back to disk
    await this.writeFile(this.configPath, parsed);

    this.config = updated;
    return updated;
  }

  /**
   * Validate raw data against the Craig config schema.
   *
   * @param raw - Raw parsed object to validate.
   * @returns Validated CraigConfig.
   * @throws {ConfigValidationError} If validation fails.
   */
  validate(raw: unknown): CraigConfig {
    if (raw === null || raw === undefined) {
      throw new ConfigValidationError(
        "Config data is empty. At minimum, 'repo' is required.",
        ["repo is required"],
      );
    }

    const result = craigConfigSchema.safeParse(raw);

    if (!result.success) {
      const issues = result.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`,
      );
      throw new ConfigValidationError(
        `Config validation failed: ${issues.join("; ")}`,
        issues,
      );
    }

    // auto_merge is enforced to false by the schema transform
    return result.data as CraigConfig;
  }

  /* ------------------------------------------------------------------ */
  /*  Private helpers                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * Resolve the config file path.
   * Priority: explicit argument > CRAIG_CONFIG env > default.
   */
  private resolvePath(configPath?: string): string {
    if (configPath) return configPath;
    if (process.env.CRAIG_CONFIG) return process.env.CRAIG_CONFIG;
    return DEFAULT_CONFIG_PATH;
  }

  /**
   * Read the config file from disk.
   * @throws {ConfigNotFoundError} If the file does not exist.
   */
  private async readFile(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, "utf-8");
    } catch (error: unknown) {
      if (this.isNodeError(error) && error.code === "ENOENT") {
        throw new ConfigNotFoundError(filePath);
      }
      throw error;
    }
  }

  /**
   * Parse YAML string into a JavaScript object.
   * @throws {ConfigParseError} If the YAML is malformed.
   */
  private parseYaml(content: string): unknown {
    try {
      const parsed = parseYaml(content);
      return parsed;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown parse error";
      throw new ConfigParseError(`Failed to parse YAML: ${message}`);
    }
  }

  /**
   * Write a config object back to disk as YAML.
   */
  private async writeFile(
    filePath: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const yaml = stringifyYaml(data);
    await fs.writeFile(filePath, yaml, "utf-8");
  }

  /**
   * Set a value in a nested object using dot-notation path.
   * Creates intermediate objects as needed.
   */
  private setNestedValue(
    obj: Record<string, unknown>,
    path: string,
    value: unknown,
  ): void {
    const keys = path.split(".");
    let current: Record<string, unknown> = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (
        current[key] === undefined ||
        current[key] === null ||
        typeof current[key] !== "object"
      ) {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }

    current[keys[keys.length - 1]] = value;
  }

  /** Type guard for Node.js errors with a code property. */
  private isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error;
  }
}
