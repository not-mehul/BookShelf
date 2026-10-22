import Dexie from 'dexie';

export const db = new Dexie('bookshelf');

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

export function newEntryId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export async function listEntries() {
  return db.entries.toArray();
}

export async function getEntry(id) {
  return db.entries.get(id);
}

export async function saveEntry(entry) {
  await db.entries.put(entry);
  return entry;
}

export async function deleteEntry(id) {
  await db.entries.delete(id);
}

export async function findBySource(type, sourceId) {
  if (!sourceId) return null;
  return db.entries.where({ type, sourceId: String(sourceId) }).first();
}

// All distinct tags across the catalog, sorted, for the filter chips.
export async function listAllTags() {
  const set = new Set();
  const entries = await db.entries.toArray();
  for (const e of entries) for (const t of e.tags || []) set.add(t);
  return [...set].sort((a, b) => a.localeCompare(b));
}

// Prefer the locally-stored cover blob (fully offline) over the remote URL.
// Callers that render the returned blob: URL in an <img> should revoke it on
// load — see coverImage() in components.js — so these URLs don't accumulate.
export function thumbnailUrl(entry) {
  if (entry?.thumbnailBlob instanceof Blob) {
    return URL.createObjectURL(entry.thumbnailBlob);
  }
  return null;
}
