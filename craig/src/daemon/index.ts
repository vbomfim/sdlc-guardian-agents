/**
 * Daemon component — public API barrel export.
 *
 * All consumers import from here, never from internals.
 * This is the component boundary.
 *
 * @module daemon
 */

export {
  startDaemonServer,
  createRequestHandler,
} from "./daemon-server.js";
export type {
  DaemonServerOptions,
  DaemonServerResult,
} from "./daemon-server.js";
