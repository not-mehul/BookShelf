// Status changes that keep the "want to" queue consistent.

import { listEntries } from '../db/database';
import { stampStatusDates } from './journal';
import { rankAtEnd } from './queue';
import type { CatalogEntry, EntryStatus } from '../types';

/**
 * Set an entry's status, keeping the queue consistent: entering 'want' puts
 * it at the end of the queue; leaving it drops its rank. Starting and
 * finishing are stamped in the journal (util/journal.ts). Does not save.
 * @param [all] All entries, if already loaded.
 */
export async function applyStatus(entry: CatalogEntry, status: EntryStatus | null, all?: CatalogEntry[]) {
  if (status === 'want' && entry.status !== 'want') {
    entry.queueRank = rankAtEnd(all ?? (await listEntries()));
  } else if (status !== 'want') {
    entry.queueRank = null;
  }
  stampStatusDates(entry, entry.status, status);
  entry.status = status;
}
