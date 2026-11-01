// Bulk edits for a multi-selection in the library: status, tags, delete.

import { getEntry, saveEntry, deleteEntry, listEntries } from '../db/database';
import { applyStatus } from './apply-status';
import type { CatalogEntry, EntryStatus } from '../types';

export interface BulkChanges {
  /** Omit (undefined) to leave status alone; null clears it. */
  status?: EntryStatus | null;
  addTag?: string;
  removeTag?: string;
}

/** Apply tag changes to one entry (pure). Returns true if anything changed. */
export function applyTagChanges(entry: CatalogEntry, { addTag, removeTag }: BulkChanges): boolean {
  const before = (entry.tags || []).join('\u0000');
  let tags = [...(entry.tags || [])];
  const add = addTag?.trim();
  if (add && !tags.includes(add)) tags.push(add);
  if (removeTag) tags = tags.filter((t) => t !== removeTag);
  entry.tags = tags;
  return tags.join('\u0000') !== before;
}

/** Apply `changes` to every entry in `ids`. Returns how many entries changed. */
export async function applyBulkChanges(ids: string[], changes: BulkChanges): Promise<number> {
  const all = await listEntries();
  let changed = 0;
  for (const id of ids) {
    const entry = await getEntry(id);
    if (!entry) continue;
    let dirty = applyTagChanges(entry, changes);
    if (changes.status !== undefined && entry.type !== 'quote' && (entry.status ?? null) !== changes.status) {
      await applyStatus(entry, changes.status, all);
      dirty = true;
    }
    if (dirty) {
      await saveEntry(entry);
      changed++;
    }
  }
  return changed;
}

/** Deletes the entries and returns them as they were, so they can be put back. */
export async function deleteEntries(ids: string[]): Promise<CatalogEntry[]> {
  const removed: CatalogEntry[] = [];
  for (const id of ids) {
    const entry = await getEntry(id);
    if (entry) removed.push(entry);
    await deleteEntry(id);
  }
  return removed;
}

/**
 * Undoes `deleteEntries`. Saving clears each tombstone and gives the entry a
 * newer timestamp than its deletion, so sync keeps it too.
 */
export async function restoreEntries(entries: CatalogEntry[]): Promise<void> {
  for (const entry of entries) await saveEntry({ ...entry });
}
