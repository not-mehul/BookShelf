// Recording watched episodes on a show.

import { applyStatus } from './apply-status';
import { derivedTvState, setWatched } from './episodes';
import type { CatalogEntry } from '../types';

/**
 * Record watched changes: update progress and (forward-only) status. Mutates
 * `entry`; does not save. Use inside `patchEntry` so it works on the stored copy.
 */
export async function markEpisodes(entry: CatalogEntry, ids: number[], watched: boolean): Promise<void> {
  setWatched(entry, ids, watched);
  const { progress, status } = derivedTvState(entry);
  entry.progress = progress;
  if (
    status === 'finished' ||
    (status === 'in-progress' && entry.status !== 'finished' && entry.status !== 'in-progress')
  ) {
    await applyStatus(entry, status);
  }
}
