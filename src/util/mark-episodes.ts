// Recording watched episodes on a show.

import { saveEntry } from '../db/database';
import { applyStatus } from './apply-status';
import { derivedTvState, setWatched } from './episodes';
import type { CatalogEntry } from '../types';

/** Record watched changes: update progress and (forward-only) status, save. */
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
  await saveEntry(entry);
}
