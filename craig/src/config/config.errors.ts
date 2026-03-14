/**
 * Custom error types for the Config component.
 *
 * Each error type maps to a specific failure mode,
 * giving consumers precise control over error handling.
 */

/** Thrown when the config file does not exist at the resolved path. */
export class ConfigNotFoundError extends Error {
  public readonly path: string;

  constructor(path: string) {
    super(`Config file not found: ${path}`);
    this.name = "ConfigNotFoundError";
    this.path = path;
  }
}

/** Thrown when the YAML file is valid but the schema validation fails. */
export class ConfigValidationError extends Error {
  public readonly issues: string[];

  constructor(message: string, issues: string[] = []) {
    super(message);
    this.name = "ConfigValidationError";
    this.issues = issues;
  }
}

/** Thrown when the file content is not valid YAML. */
export class ConfigParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigParseError";
  }
}
