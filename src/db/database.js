import Dexie from 'dexie';

/** @typedef {import('../types').CatalogEntry} CatalogEntry */
/** @typedef {import('../types').Tombstone} Tombstone */

/**
 * @type {Dexie & {
 *   entries: import('dexie').EntityTable<CatalogEntry, 'id'>,
 *   tombstones: import('dexie').EntityTable<Tombstone, 'id'>
 * }}
 */
export const db = /** @type {any} */ (new Dexie('bookshelf'));

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
      .modify((/** @type {CatalogEntry} */ e) => {
        e.updatedAt ??= e.dateRated || e.dateAdded || new Date(0).toISOString();
      })
  );

export function newEntryId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** @returns {Promise<CatalogEntry[]>} */
export async function listEntries() {
  return db.entries.toArray();
}

/** @param {string} id */
export async function getEntry(id) {
  return db.entries.get(id);
}

/**
 * Save an entry. Local edits stamp `updatedAt` (`touch`); sync and restores
 * pass `touch: false` to keep the incoming timestamp. Saving an id clears any
 * tombstone for it (the entry is alive again).
 * @param {CatalogEntry} entry
 * @param {{ touch?: boolean }} [options]
 */
export async function saveEntry(entry, { touch = true } = {}) {
  if (touch || !entry.updatedAt) entry.updatedAt = new Date().toISOString();
  await db.transaction('rw', db.entries, db.tombstones, async () => {
    await db.entries.put(entry);
    await db.tombstones.delete(entry.id);
  });
  return entry;
}

/**
 * Delete an entry, leaving a tombstone for sync.
 * @param {string} id
 * @param {string} [deletedAt] Keep a remote deletion's timestamp when syncing.
 */
export async function deleteEntry(id, deletedAt = new Date().toISOString()) {
  await db.transaction('rw', db.entries, db.tombstones, async () => {
    await db.entries.delete(id);
    await db.tombstones.put({ id, deletedAt });
  });
}

/** @returns {Promise<Tombstone[]>} */
export async function listTombstones() {
  return db.tombstones.toArray();
}

/**
 * @param {string} type
 * @param {string | number | null | undefined} sourceId
 */
export async function findBySource(type, sourceId) {
  if (!sourceId) return null;
  return db.entries.where({ type, sourceId: String(sourceId) }).first();
}

/** All distinct tags across the catalog, sorted, for the filter chips. */
export async function listAllTags() {
  /** @type {Set<string>} */
  const set = new Set();
  const entries = await db.entries.toArray();
  for (const e of entries) for (const t of e.tags || []) set.add(t);
  return [...set].sort((a, b) => a.localeCompare(b));
}

// Prefer the locally-stored cover blob (fully offline) over the remote URL.
// Callers that render the returned blob: URL in an <img> should revoke it on
// load — see coverImage() in components.js — so these URLs don't accumulate.
/** @param {CatalogEntry} entry */
export function thumbnailUrl(entry) {
  if (entry?.thumbnailBlob instanceof Blob) {
    return URL.createObjectURL(entry.thumbnailBlob);
  }
  return null;
}
