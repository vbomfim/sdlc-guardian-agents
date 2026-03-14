/**
 * Digest Reporter component — public API barrel file.
 *
 * Re-exports all types, interfaces, and the adapter for the digest component.
 * External consumers import from here, not from internal modules.
 *
 * @module digest
 */

export type { DigestPort } from "./digest.port.js";
export type {
  DigestReport,
  DigestPeriod,
  DigestPublishResult,
} from "./digest.types.js";
export { DigestAdapter } from "./digest.adapter.js";
export { InvalidPeriodError, DigestPublishError } from "./digest.errors.js";
