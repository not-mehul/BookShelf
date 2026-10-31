import Dexie, { type EntityTable } from 'dexie';
import type { CatalogEntry, Tombstone } from '../types';

export const db = new Dexie('bookshelf') as Dexie & {
  entries: EntityTable<CatalogEntry, 'id'>;
  tombstones: EntityTable<Tombstone, 'id'>;
};

// v1 — original schema.
db.version(1).stores({
  entries: 'id, type, title, rating, year, status, dateAdded, dateRated, sourceId'
});

// v2 — add a multi-valued `tags` index for collection filtering. Records are
// schemaless, so new non-indexed fields (progress, isbn, source, enriched…)
// need no migration; only new *indexes* are declared here.
db.version(2).stores({
  entries: 'id, type, title, rating, year, status, dateAdded, dateRated, sourceId, *tags'
});

// v3 — sync support: every entry carries `updatedAt`, and deletions leave a
// tombstone so they propagate to other devices instead of being resurrected.
db.version(3)
  .stores({ tombstones: 'id, deletedAt' })
  .upgrade((tx) =>
    tx
      .table('entries')
      .toCollection()
      .modify((e: CatalogEntry) => {
        e.updatedAt ??= e.dateRated || e.dateAdded || new Date(0).toISOString();
      })
  );

// v4 — index quotes by the entry they come from, so a book can list its quotes.
db.version(4).stores({
  entries: 'id, type, title, rating, year, status, dateAdded, dateRated, sourceId, *tags, linkedEntryId'
});

export function newEntryId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export async function listEntries(): Promise<CatalogEntry[]> {
  return db.entries.toArray();
}

export async function getEntry(id: string) {
  return db.entries.get(id);
}

/**
 * Save an entry. Local edits stamp `updatedAt` (`touch`); sync and restores
 * pass `touch: false` to keep the incoming timestamp. Saving an id clears any
 * tombstone for it (the entry is alive again).
 */
export async function saveEntry(entry: CatalogEntry, { touch = true }: { touch?: boolean } = {}) {
  if (touch || !entry.updatedAt) entry.updatedAt = new Date().toISOString();
  await db.transaction('rw', db.entries, db.tombstones, async () => {
    await db.entries.put(entry);
    await db.tombstones.delete(entry.id);
  });
  return entry;
}

/**
 * Delete an entry, leaving a tombstone for sync.
 * @param [deletedAt] Keep a remote deletion's timestamp when syncing.
 */
export async function deleteEntry(id: string, deletedAt: string = new Date().toISOString()) {
  await db.transaction('rw', db.entries, db.tombstones, async () => {
    await db.entries.delete(id);
    await db.tombstones.put({ id, deletedAt });
  });
}

export async function listTombstones(): Promise<Tombstone[]> {
  return db.tombstones.toArray();
}

/**
 * Quotes linked to an entry, oldest first.
 */
export async function listQuotesFor(entryId: string) {
  const quotes = await db.entries.where('linkedEntryId').equals(entryId).toArray();
  return quotes.sort((a, b) => (a.dateAdded || '').localeCompare(b.dateAdded || ''));
}
export async function findBySource(type: string, sourceId: string | number | null | undefined) {
  if (!sourceId) return null;
  return db.entries.where({ type, sourceId: String(sourceId) }).first();
}

/** All distinct tags across the catalog, sorted, for the filter chips. */
export async function listAllTags() {
  const set: Set<string> = new Set();
  const entries = await db.entries.toArray();
  for (const e of entries) for (const t of e.tags || []) set.add(t);
  return [...set].sort((a, b) => a.localeCompare(b));
}

// Prefer the locally-stored cover blob (fully offline) over the remote URL.
// Callers that render the returned blob: URL in an <img> should revoke it on
// load (CoverImage.svelte does) so these URLs don't accumulate.
export function thumbnailUrl(entry: CatalogEntry) {
  if (entry?.thumbnailBlob instanceof Blob) {
    return URL.createObjectURL(entry.thumbnailBlob);
  }
  return null;
}
