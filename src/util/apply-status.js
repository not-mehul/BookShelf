// Status changes that keep the "want to" queue consistent.

import { listEntries } from '../db/database.js';
import { rankAtEnd } from './queue.js';

/** @typedef {import('../types').CatalogEntry} CatalogEntry */
/** @typedef {import('../types').EntryStatus} EntryStatus */

/**
 * Set an entry's status, keeping the queue consistent: entering 'want' puts
 * it at the end of the queue; leaving it drops its rank. Does not save.
 * @param {CatalogEntry} entry
 * @param {EntryStatus | null} status
 * @param {CatalogEntry[]} [all] All entries, if already loaded.
 */
export async function applyStatus(entry, status, all) {
  if (status === 'want' && entry.status !== 'want') {
    entry.queueRank = rankAtEnd(all ?? (await listEntries()));
  } else if (status !== 'want') {
    entry.queueRank = null;
  }
  entry.status = status;
}
