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
import * as path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { ConfigPort } from "./config.port.js";
import { craigConfigSchema, type CraigConfig } from "./config.schema.js";
import {
  ConfigNotFoundError,
  ConfigValidationError,
  ConfigParseError,
} from "./config.errors.js";

/** Default path when no override is provided. */
const DEFAULT_CONFIG_PATH = "./craig.config.yaml";

/** Allowed file extensions for config files. */
const ALLOWED_EXTENSIONS = [".yaml", ".yml"];

/**
 * Keys that must never be traversed in setNestedValue.
 * Prevents prototype pollution attacks via dot-notation paths
 * like "__proto__.polluted" or "constructor.prototype.polluted".
 *
 * @see [CWE-1321] — Prototype Pollution
 */
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export class ConfigLoader implements ConfigPort {
  private config: CraigConfig | null = null;
  private configPath: string | null = null;
  private readonly baseDir: string;

  /**
   * @param options.baseDir - Base directory for path traversal validation.
   *   Defaults to `process.cwd()`. All config file paths must resolve
   *   within this directory.
   */
  constructor(options?: { baseDir?: string }) {
    this.baseDir = path.resolve(options?.baseDir ?? process.cwd());
  }

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
    this.assertSafePath(resolvedPath);
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
    const parsed = this.parseYaml(rawYaml);

    if (!this.isPlainObject(parsed)) {
      throw new ConfigValidationError(
        "Config file does not contain a YAML mapping at root level.",
        ["Root must be a YAML mapping/object"],
      );
    }

    // Apply the update using dot-notation (with prototype pollution guard)
    this.setNestedValue(parsed, key, value);

    // Validate the updated config
    const updated = this.validate(parsed);

    // Write the validated+transformed data to disk — not the raw parsed YAML.
    // This ensures safety transforms (e.g. auto_merge forced to false) are persisted.
    await this.writeFile(this.configPath, updated as unknown as Record<string, unknown>);

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
        "Config data is empty. At minimum, 'repo' or 'repos' is required.",
        ["At least one of 'repo' or 'repos' is required"],
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
   * Validate that the resolved file path is safe.
   *
   * Guards against path traversal attacks by verifying:
   *   1. The file has an allowed extension (.yaml / .yml)
   *   2. The resolved absolute path stays within CWD (or a configured base dir)
   *
   * @throws {ConfigValidationError} If the path is unsafe.
   * @see [CWE-22] — Path Traversal
   */
  private assertSafePath(filePath: string): void {
    const resolved = path.resolve(filePath);
    const ext = path.extname(resolved).toLowerCase();

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new ConfigValidationError(
        `Config file must have a .yaml or .yml extension, got: "${ext || "(none)"}".`,
        [`Invalid extension: ${ext || "(none)"}. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`],
      );
    }

    if (!resolved.startsWith(this.baseDir + path.sep) && resolved !== this.baseDir) {
      throw new ConfigValidationError(
        `Config path "${filePath}" resolves outside the allowed base directory.`,
        [`Path traversal blocked: "${resolved}" is not within "${this.baseDir}"`],
      );
    }
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
        throw new ConfigNotFoundError(filePath, { cause: error });
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
      return parseYaml(content);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown parse error";
      throw new ConfigParseError(`Failed to parse YAML: ${message}`, {
        cause: error,
      });
    }
  }

  /**
   * Type guard: check whether a value is a plain object (Record<string, unknown>).
   * Used after YAML parsing to ensure the root document is a mapping.
   */
  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    );
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
   *
   * @throws {ConfigValidationError} If any path segment is a dangerous key
   *   (__proto__, prototype, constructor) — prevents prototype pollution.
   * @see [CWE-1321] — Prototype Pollution
   */
  private setNestedValue(
    obj: Record<string, unknown>,
    dotPath: string,
    value: unknown,
  ): void {
    const keys = dotPath.split(".");

    for (const key of keys) {
      if (DANGEROUS_KEYS.has(key)) {
        throw new ConfigValidationError(
          `Illegal config key "${key}" — potential prototype pollution.`,
          [`Rejected dangerous key: "${key}" in path "${dotPath}"`],
        );
      }
    }

    let current: Record<string, unknown> = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i]!;
      if (
        current[key] === undefined ||
        current[key] === null ||
        typeof current[key] !== "object"
      ) {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }

    current[keys[keys.length - 1]!] = value;
  }

  /** Type guard for Node.js errors with a code property. */
  private isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error;
  }
}
