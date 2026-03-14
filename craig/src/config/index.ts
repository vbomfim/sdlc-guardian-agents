/**
 * Config component — public API barrel export.
 *
 * All consumers import from this file, never from internals.
 * This is the component boundary.
 *
 * @module config
 */

export { ConfigLoader } from "./config.loader.js";
export type { ConfigPort } from "./config.port.js";
export type { CraigConfig } from "./config.schema.js";
export { repoEntrySchema } from "./config.schema.js";
export type { RepoEntry } from "./config.schema.js";
export {
  ConfigNotFoundError,
  ConfigValidationError,
  ConfigParseError,
} from "./config.errors.js";
