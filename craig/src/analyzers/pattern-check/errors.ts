/**
 * Custom error classes for the Pattern Check analyzer component.
 *
 * Follows the project convention: custom Error subclasses with
 * descriptive names and contextual properties.
 *
 * @module analyzers/pattern-check/errors
 */

/**
 * Thrown when the `.craig-patterns.json` file contains invalid JSON
 * or does not conform to the expected PatternSet schema.
 *
 * When this occurs, the corrupted file is backed up and patterns
 * must be re-learned from the repository.
 */
export class PatternStoreCorruptedError extends Error {
  constructor(
    public readonly filePath: string,
    public readonly cause: unknown,
  ) {
    super(
      `Pattern store corrupted: ${filePath}. Backed up to ${filePath}.bak and must re-learn patterns.`,
    );
    this.name = "PatternStoreCorruptedError";
  }
}

/**
 * Thrown when pattern learning fails (e.g., Copilot invocation fails
 * or the response cannot be parsed into a valid PatternSet).
 */
export class PatternLearningError extends Error {
  constructor(
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "PatternLearningError";
  }
}
