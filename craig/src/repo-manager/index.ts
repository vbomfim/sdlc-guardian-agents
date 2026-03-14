/**
 * RepoManager component — public API barrel export.
 *
 * All consumers import from here, never from internals.
 * This is the component boundary.
 *
 * @module repo-manager
 * @see https://github.com/vbomfim/sdlc-guardian-agents/issues/34
 */

export { RepoManager } from "./repo-manager.adapter.js";
export type { StateFactory } from "./repo-manager.adapter.js";
export type {
  RepoManagerPort,
  RepoInstance,
  RepoFinding,
} from "./repo-manager.port.js";
