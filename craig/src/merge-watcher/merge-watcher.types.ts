/**
 * Type definitions for the Merge Watcher component.
 *
 * Defines the MergeEvent structure emitted when new merges
 * are detected on the monitored branch.
 *
 * @module merge-watcher/types
 */

/**
 * Represents a merge commit detected on the monitored branch.
 *
 * Emitted via the `onMerge` callback when the watcher detects
 * new merge commits since the last processed SHA.
 */
export interface MergeEvent {
  /** Full SHA of the merge commit. */
  readonly sha: string;
  /** Commit message (typically "Merge pull request #N ..."). */
  readonly message: string;
  /** Author name of the merge commit. */
  readonly author: string;
  /** ISO 8601 timestamp of the merge commit. */
  readonly timestamp: string;
  /** URL to view the commit diff on GitHub. */
  readonly diff_url: string;
}

/**
 * Handler function invoked when a new merge is detected.
 */
export type MergeHandler = (merge: MergeEvent) => void;
