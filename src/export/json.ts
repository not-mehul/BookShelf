// Lossless JSON backup / restore.
//
// Unlike the Markdown export (human-readable, lossy), this preserves every
// field — including sourceId, progress, tags, timestamps, and cover images
// (serialized inline as data URLs) — so a restore is a faithful round-trip.
// Import is idempotent: entries are keyed by `id`, so re-importing the same
// backup replaces rather than duplicates.

import { listEntries, saveEntry, getEntry } from '../db/database';
import { isNativeShell, nativeExport } from '../platform/native';
import type { CatalogEntry } from '../types';

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
  return { ...rest, thumbnailBlob: thumbnailData ? await dataUrlToBlob(thumbnailData) : null };
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

// Returns { imported, skippedExisting, total }. `merge` keeps existing entries
// (only adds new ids); otherwise existing ids are overwritten.
export async function importJson(text: string, { merge = false }: { merge?: boolean } = {}) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Not a valid JSON backup file.');
  }
  const entries = Array.isArray(parsed) ? parsed : parsed.entries;
  if (!Array.isArray(entries)) throw new Error('Backup file has no entries array.');

  let imported = 0;
  let skippedExisting = 0;
  for (const raw of entries) {
    if (!raw || !raw.id || !raw.type) continue;
    if (merge && (await getEntry(raw.id))) {
      skippedExisting++;
      continue;
    }
    // Keep the backup's own timestamps, so a restore never looks "newer" to sync.
    await saveEntry(await deserializeEntry(raw), { touch: false });
    imported++;
  }
  return { imported, skippedExisting, total: entries.length };
}

export async function saveAndShareJson() {
  const json = await exportJson();
  const today = new Date().toISOString().slice(0, 10);
  const filename = `bookshelf-backup-${today}.json`;

  if (isNativeShell()) {
    nativeExport(filename, json);
    return { method: 'native', filename };
  }

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { method: 'download', filename };
}
