/**
 * Custom error thrown when the state file contains invalid JSON.
 *
 * When this occurs, the corrupted file is backed up and a fresh
 * state is created automatically.
 */
export class StateCorruptedError extends Error {
  constructor(
    public readonly filePath: string,
    public readonly cause: unknown,
  ) {
    super(
      `State file corrupted: ${filePath}. Backed up to ${filePath}.bak and created fresh state.`,
    );
    this.name = "StateCorruptedError";
  }
}
