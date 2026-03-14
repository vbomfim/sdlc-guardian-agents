/**
 * GitPort factory — selects the correct adapter based on provider config.
 *
 * This is the single decision point for which Git platform adapter to use.
 * Consumers call createGitAdapter() and receive a GitPort — they never
 * need to know which concrete adapter is behind it.
 *
 * @see [HEXAGONAL] — Factory creates the adapter, consumers use the port
 * @see [SOLID/OCP] — Adding a new provider requires only a new case here
 * @see [SOLID/DIP] — Returns the abstract GitPort, not a concrete adapter
 */

import type { GitPort } from "./git.port.js";
import type { GitProvider } from "./git.types.js";
import { GitProviderNotSupportedError, GitAuthError } from "./git.errors.js";
import { GitHubAdapter } from "../github/github.adapter.js";
import { AdoAdapter } from "./ado/ado.adapter.js";

/** Configuration for creating a Git adapter. */
export interface GitAdapterConfig {
  /** Git hosting provider: "github" or "ado". */
  readonly provider: GitProvider;
  /** Repository in "owner/repo" format (GitHub) or repo name (ADO). */
  readonly repo: string;
  /** Default branch name. */
  readonly branch: string;
  /** ADO-specific configuration (required when provider is "ado"). */
  readonly ado?: {
    readonly organization: string;
    readonly project: string;
  };
}

/**
 * Create a GitPort adapter based on the provider configuration.
 *
 * Reads authentication tokens from environment variables:
 * - GitHub: GITHUB_TOKEN
 * - ADO: ADO_TOKEN
 *
 * @param config - Provider configuration from craig.config.yaml
 * @returns A GitPort adapter for the configured provider
 * @throws GitProviderNotSupportedError if the provider is unknown
 * @throws GitAuthError if the required token env var is missing
 */
export function createGitAdapter(config: GitAdapterConfig): GitPort {
  switch (config.provider) {
    case "github":
      return createGitHubAdapter(config);
    case "ado":
      return createAdoAdapter(config);
    default:
      throw new GitProviderNotSupportedError(config.provider as string);
  }
}

/**
 * Create a GitHub adapter from config + environment.
 */
function createGitHubAdapter(config: GitAdapterConfig): GitPort {
  const token = process.env.GITHUB_TOKEN ?? "";
  const [owner, repo] = parseOwnerRepo(config.repo);

  return GitHubAdapter.create({ owner, repo, token });
}

/**
 * Create an Azure DevOps adapter from config + environment.
 */
function createAdoAdapter(config: GitAdapterConfig): GitPort {
  if (!config.ado) {
    throw new GitAuthError(
      "ADO configuration (ado.organization, ado.project) is required when provider is 'ado'.",
    );
  }

  const token = process.env.ADO_TOKEN ?? "";

  return AdoAdapter.create({
    organization: config.ado.organization,
    project: config.ado.project,
    token,
  });
}

/**
 * Parse "owner/repo" string into [owner, repo] tuple.
 *
 * @throws Error if the format is invalid
 */
function parseOwnerRepo(repoString: string): [string, string] {
  const parts = repoString.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `Invalid repo format: "${repoString}". Expected "owner/repo".`,
    );
  }
  return [parts[0], parts[1]];
}
