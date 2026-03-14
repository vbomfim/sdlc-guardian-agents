/**
 * Type definitions for the PR Watcher component.
 *
 * Defines the PrEvent structure emitted when new or updated PRs
 * are detected during polling.
 *
 * @module pr-watcher/types
 */

/**
 * Represents a pull request that needs review.
 *
 * Emitted via the `onPr` callback when the watcher detects
 * new PRs or new commits on existing PRs.
 */
export interface PrEvent {
  /** Pull request number. */
  readonly pr_number: number;
  /** Pull request title. */
  readonly title: string;
  /** Head commit SHA that triggered this event. */
  readonly head_sha: string;
  /** Head branch name. */
  readonly head_ref: string;
  /** Base branch name. */
  readonly base_ref: string;
  /** PR author login. */
  readonly author: string;
  /** PR HTML URL. */
  readonly url: string;
}

/**
 * Handler function invoked when a PR needs review.
 */
export type PrHandler = (event: PrEvent) => void | Promise<void>;
