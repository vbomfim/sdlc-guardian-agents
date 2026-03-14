/**
 * Config component — public API barrel export.
 *
 * All consumers import from this file, never from internals.
 * This is the component boundary.
 *
 * @module config
 */

export { ConfigLoader } from "./config.loader.js";
export type { ConfigPort, CraigConfig } from "./config.port.js";
export {
  ConfigNotFoundError,
  ConfigValidationError,
  ConfigParseError,
} from "./config.errors.js";
