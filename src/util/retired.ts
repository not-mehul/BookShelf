// Things BookShelf no longer keeps: a book's page progress, yearly reading
// goals and the weekly backup's date. They are dropped from the shelf once (database v5), from anything
// read back in (backups, sync files from older installs), and from settings.
// A show's progress stays: it comes from its ticked episodes.

import type { CatalogEntry } from '../types';

/** Drop retired fields from an entry, in place. */
export function dropRetired<T extends Partial<CatalogEntry>>(entry: T): T {
  if (entry.type !== 'tv' && 'progress' in entry) delete entry.progress;
  return entry;
}

const GOAL_KEY = /^bookshelf:reading_goal_\d{4}$/;
const RETIRED_KEYS = ['bookshelf:last_backup_at'];

/** Remove saved reading goals and other retired settings. */
export function dropRetiredSettings(storage: Storage = localStorage): void {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && (GOAL_KEY.test(key) || RETIRED_KEYS.includes(key))) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}
