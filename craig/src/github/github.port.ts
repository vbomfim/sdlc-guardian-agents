/**
 * GitHubPort — GitHub-specific interface for API operations.
 *
 * Now extends the provider-agnostic GitPort interface. This ensures
 * backward compatibility: all existing code that depends on GitHubPort
 * continues to work, but new code should prefer GitPort.
 *
 * @deprecated Use GitPort from "../git-port/git.port.js" for new code.
 * @see [HEXAGONAL] — Ports & Adapters pattern
 */

import type { GitPort } from "../git-port/git.port.js";

/**
 * @deprecated Use GitPort from "git-port" module for new code.
 * GitHubPort is retained for backward compatibility.
 */
export interface GitHubPort extends GitPort {}
