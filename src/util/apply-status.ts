// Status changes that keep the "want to" queue consistent.

import { listEntries } from '../db/database';
import { rankAtEnd } from './queue';
import type { CatalogEntry, EntryStatus } from '../types';

/**
 * Set an entry's status, keeping the queue consistent: entering 'want' puts
 * it at the end of the queue; leaving it drops its rank. Does not save.
 * @param [all] All entries, if already loaded.
 */
export async function applyStatus(entry: CatalogEntry, status: EntryStatus | null, all?: CatalogEntry[]) {
  if (status === 'want' && entry.status !== 'want') {
    entry.queueRank = rankAtEnd(all ?? (await listEntries()));
  } else if (status !== 'want') {
    entry.queueRank = null;
  }
  entry.status = status;
}
