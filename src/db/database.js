import Dexie from 'dexie';

export const db = new Dexie('bookshelf');

db.version(1).stores({
  entries: 'id, type, title, rating, year, status, dateAdded, dateRated, sourceId'
});

export function newEntryId() {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10)
  );
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
  return db.entries
    .where({ type, sourceId: String(sourceId) })
    .first();
}

export function thumbnailUrl(entry) {
  if (entry?.thumbnailBlob) {
    return URL.createObjectURL(entry.thumbnailBlob);
  }
  return null;
}
