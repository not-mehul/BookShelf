// Restoring a BookShelf backup file (the JSON the app used to write, with
// every field and the covers inline as data URLs). Restoring is idempotent:
// entries are keyed by `id`, so restoring the same file again replaces rather
// than duplicates.

import { saveEntry, getEntry, db } from '../db/database';
import type { CatalogEntry, EntryStatus, EntryType } from '../types';

/** A CatalogEntry as written to JSON: the cover blob becomes a data URL. */
export type SerializedEntry = Omit<CatalogEntry, 'thumbnailBlob'> & { thumbnailData?: string | null };

async function dataUrlToBlob(dataUrl: string) {
  try {
    const res = await fetch(dataUrl);
    return await res.blob();
  } catch {
    return null;
  }
}
export async function deserializeEntry(raw: SerializedEntry): Promise<CatalogEntry> {
  const { thumbnailData, ...rest } = raw;
  return { ...rest, thumbnailBlob: thumbnailData ? await dataUrlToBlob(thumbnailData) : null };
}

const TYPES: readonly EntryType[] = ['book', 'movie', 'tv', 'quote'];
const STATUSES: readonly EntryStatus[] = ['want', 'in-progress', 'finished', 'abandoned'];
const text = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const strings = (v: unknown) =>
  (Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : []).map(text).filter(Boolean);
const iso = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * A record from a backup file as an entry the app can show, or null when it
 * is not one (no id, or a type BookShelf doesn't keep). Fields every screen
 * relies on get their usual shape; anything else is kept as it was.
 */
export function normalizeRecord(raw: unknown): SerializedEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = text(r.id).trim();
  const type = r.type as EntryType;
  if (!id || !TYPES.includes(type)) return null;
  const quoteText = type === 'quote' ? text(r.quoteText || r.title) : undefined;
  const title = text(r.title).trim() || (quoteText ? quoteText.slice(0, 100) : '') || 'Untitled';
  const rating = num(r.rating);
  return {
    ...(r as Partial<SerializedEntry>),
    id,
    type,
    title,
    ...(quoteText !== undefined ? { quoteText } : {}),
    sourceId: r.sourceId == null || r.sourceId === '' ? null : text(r.sourceId),
    creators: strings(r.creators),
    genres: strings(r.genres),
    tags: strings(r.tags),
    finishes: strings(r.finishes)
      .filter((f) => iso(f))
      .sort(),
    summary: text(r.summary),
    notes: text(r.notes),
    year: num(r.year),
    rating: rating != null && rating > 0 && rating <= 5 ? rating : null,
    status: STATUSES.includes(r.status as EntryStatus) ? (r.status as EntryStatus) : null,
    thumbnailUrl: typeof r.thumbnailUrl === 'string' && r.thumbnailUrl ? r.thumbnailUrl : null,
    dateAdded: iso(r.dateAdded) ?? new Date().toISOString(),
    dateRated: iso(r.dateRated),
    ...(r.updatedAt !== undefined ? { updatedAt: iso(r.updatedAt) ?? undefined } : {})
  } as SerializedEntry;
}

/** Restore a backup file: entries with the same id are replaced. */
export async function importJson(text: string) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Not a valid JSON backup file.');
  }
  const entries = Array.isArray(parsed) ? parsed : parsed?.entries;
  if (!Array.isArray(entries)) throw new Error('Backup file has no entries array.');

  let imported = 0;
  let skippedInvalid = 0;
  for (const raw of entries) {
    const record = normalizeRecord(raw);
    if (!record) {
      skippedInvalid++;
      continue;
    }
    const existing = await getEntry(record.id);
    // Keep the backup's own timestamps, so a restore never looks "newer" than
    // edits made since. The exception is an entry that was deleted: restoring
    // it is the newest thing that happened to it, so it is stamped now, or
    // the deletion (kept for sync) would take it away again.
    const deleted = !existing && Boolean(await db.tombstones.get(record.id));
    await saveEntry(await deserializeEntry(record), { touch: deleted });
    imported++;
  }
  return { imported, skippedInvalid, total: entries.length };
}
