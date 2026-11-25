// Copies of one thing on the shelf: the same ISBN, or the same title by the
// same author (a book) or in the same year (a film or show). An import and a
// search can each bring one in. Found pairs can be merged, or marked as not
// the same.

import { db, deleteEntry, listEntries, patchEntry } from '../db/database';
import { matchKeys, mergeInto } from '../export/catalog-import';
import type { CatalogEntry } from '../types';

const DISMISSED = 'bookshelf:not_duplicates';
const pairKey = (a: string, b: string) => [a, b].sort().join('|');

function dismissed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISSED) || '[]'));
  } catch {
    return new Set();
  }
}

/** Remember that two entries aren't the same, so they aren't offered again. */
export function markNotDuplicates(a: string, b: string) {
  const set = dismissed();
  set.add(pairKey(a, b));
  localStorage.setItem(DISMISSED, JSON.stringify([...set]));
}

/** The entry on the shelf that `e` is a copy of, by its match keys, if any. */
export function findCopy(
  entries: readonly CatalogEntry[],
  e: Parameters<typeof matchKeys>[0]
): CatalogEntry | null {
  const keys = new Set(matchKeys(e));
  return entries.find((x) => x.type === e.type && matchKeys(x).some((k) => keys.has(k))) ?? null;
}

/** Pairs of likely copies, the one to keep first: the one with a catalog match, else the older. */
export function findDuplicates(entries: readonly CatalogEntry[]): [CatalogEntry, CatalogEntry][] {
  const skip = dismissed();
  const byKey = new Map<string, CatalogEntry[]>();
  for (const e of entries) {
    if (e.type === 'quote') continue;
    for (const k of matchKeys(e)) byKey.set(k, [...(byKey.get(k) ?? []), e]);
  }
  const seen = new Set<string>();
  const pairs: [CatalogEntry, CatalogEntry][] = [];
  for (const group of byKey.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const [a, b] = [group[i]!, group[j]!];
        const key = pairKey(a.id, b.id);
        if (seen.has(key) || skip.has(key)) continue;
        seen.add(key);
        pairs.push(keepFirst(a, b));
      }
    }
  }
  return pairs;
}

function keepFirst(a: CatalogEntry, b: CatalogEntry): [CatalogEntry, CatalogEntry] {
  const linked = (e: CatalogEntry) => Boolean(e.sourceId && !e.needsMatch);
  if (linked(a) !== linked(b)) return linked(a) ? [a, b] : [b, a];
  return (a.dateAdded || '') <= (b.dateAdded || '') ? [a, b] : [b, a];
}

const CATALOG_FIELDS = ['sourceId', 'detailUrl', 'summary', 'genres', 'creators', 'originalTitle'] as const;

/**
 * Fold `drop` into `keep` and delete it. What `keep` lacks comes from `drop`
 * (rating, status, dates, notes, tags, cover and details); its quotes move to
 * `keep`. Returns the kept entry as saved.
 */
export async function mergeDuplicate(keepId: string, dropId: string): Promise<CatalogEntry | null> {
  const drop = await db.entries.get(dropId);
  if (!drop) return null;
  const kept = await patchEntry(keepId, (d) => {
    mergeInto(d, drop);
    const empty = (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0);
    for (const k of CATALOG_FIELDS)
      if (empty(d[k]) && !empty(drop[k])) (d as unknown as Record<string, unknown>)[k] = drop[k];
    if (!d.thumbnailUrl && drop.thumbnailUrl) {
      d.thumbnailUrl = drop.thumbnailUrl;
      d.thumbnailBlob = drop.thumbnailBlob ?? null;
    }
    if (d.notes && drop.notes && !d.notes.includes(drop.notes)) d.notes = `${d.notes}\n\n${drop.notes}`;
    if (!d.dateStarted && drop.dateStarted) d.dateStarted = drop.dateStarted;
    if (d.sourceId && !drop.needsMatch) delete d.needsMatch;
  });
  if (!kept) return null;
  for (const q of (await listEntries()).filter((e) => e.linkedEntryId === dropId)) {
    await patchEntry(q.id, (d) => void (d.linkedEntryId = keepId));
  }
  await deleteEntry(dropId);
  return kept;
}
