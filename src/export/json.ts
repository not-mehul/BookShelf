// Lossless JSON backup / restore.
//
// Unlike the Markdown export (human-readable, lossy), this preserves every
// field — including sourceId, tags, timestamps, episode ticks and cover images
// (serialized inline as data URLs) — so a restore is a faithful round-trip.
// Import is idempotent: entries are keyed by `id`, so re-importing the same
// backup replaces rather than duplicates.

import { listEntries, saveEntry, getEntry, db } from '../db/database';
import { nativeExport } from '../platform/native';
import type { CatalogEntry, EntryStatus, EntryType } from '../types';
import { dropRetired } from '../util/retired';

/** A CatalogEntry as written to JSON: the cover blob becomes a data URL. */
export type SerializedEntry = Omit<CatalogEntry, 'thumbnailBlob'> & { thumbnailData?: string | null };

export const BACKUP_VERSION = 1;
function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl: string) {
  try {
    const res = await fetch(dataUrl);
    return await res.blob();
  } catch {
    return null;
  }
}
export async function serializeEntry(entry: CatalogEntry): Promise<SerializedEntry> {
  const { thumbnailBlob, ...rest } = entry;
  const copy: SerializedEntry = { ...rest };
  if (thumbnailBlob instanceof Blob) copy.thumbnailData = await blobToDataUrl(thumbnailBlob);
  return copy;
}
export async function deserializeEntry(raw: SerializedEntry): Promise<CatalogEntry> {
  const { thumbnailData, ...rest } = raw;
  return dropRetired({ ...rest, thumbnailBlob: thumbnailData ? await dataUrlToBlob(thumbnailData) : null });
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

export async function exportJson() {
  const entries = await listEntries();
  const out = await Promise.all(entries.map(serializeEntry));
  return JSON.stringify(
    { app: 'bookshelf', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), entries: out },
    null,
    2
  );
}

// Returns { imported, skippedExisting, skippedInvalid, total }. `merge` keeps
// existing entries (only adds new ids); otherwise existing ids are overwritten.
export async function importJson(text: string, { merge = false }: { merge?: boolean } = {}) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Not a valid JSON backup file.');
  }
  const entries = Array.isArray(parsed) ? parsed : parsed?.entries;
  if (!Array.isArray(entries)) throw new Error('Backup file has no entries array.');

  let imported = 0;
  let skippedExisting = 0;
  let skippedInvalid = 0;
  for (const raw of entries) {
    const record = normalizeRecord(raw);
    if (!record) {
      skippedInvalid++;
      continue;
    }
    const existing = await getEntry(record.id);
    if (merge && existing) {
      skippedExisting++;
      continue;
    }
    // Keep the backup's own timestamps, so a restore never looks "newer" than
    // edits made since. The exception is an entry that was deleted: restoring
    // it is the newest thing that happened to it, so it is stamped now, or
    // the deletion (kept for sync) would take it away again.
    const deleted = !existing && Boolean(await db.tombstones.get(record.id));
    await saveEntry(await deserializeEntry(record), { touch: deleted });
    imported++;
  }
  return { imported, skippedExisting, skippedInvalid, total: entries.length };
}

export async function saveAndShareJson() {
  const json = await exportJson();
  const today = new Date().toISOString().slice(0, 10);
  const filename = `bookshelf-backup-${today}.json`;

  // To the Android share sheet: Drive, Files, email, and so on.
  nativeExport(filename, json);
  return { filename };
}
