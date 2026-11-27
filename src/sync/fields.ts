// Field-level change times, so two devices' edits to one entry both survive a
// sync: a rating given on the phone and a tag added on the tablet are kept,
// instead of whichever device saved last winning the whole entry.
//
// Fields that change together are one group (a status change also moves the
// journal dates and the queue). Each entry keeps `fieldTimes`: when each
// group last changed, plus `_base`, the entry's time when tracking began, for
// groups not changed since.

import type { CatalogEntry } from '../types';

type Entry = Partial<CatalogEntry> & { id: string };

const GROUPS: Record<string, string> = {
  status: 'journal',
  finishes: 'journal',
  dateStarted: 'journal',
  dateStopped: 'journal',
  queueRank: 'journal',
  watchedEpisodes: 'journal',
  progress: 'journal',
  rating: 'rating',
  dateRated: 'rating',
  aspectRatings: 'rating',
  sourceId: 'catalog',
  detailUrl: 'catalog',
  enriched: 'catalog'
};

/** Not merged field by field: identity, bookkeeping, device-local cache, and reference data. */
const OUTSIDE = new Set(['id', 'updatedAt', 'fieldTimes', 'thumbnailBlob', 'episodeGuide']);

export const groupOf = (key: string) => GROUPS[key] ?? key;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const keysOf = (...entries: Entry[]) =>
  [...new Set(entries.flatMap((e) => Object.keys(e)))].filter((k) => !OUTSIDE.has(k));

/** When `e` last changed, as a whole. */
export const wholeTime = (e: Pick<Entry, 'updatedAt' | 'dateAdded'>) =>
  e.updatedAt || e.dateAdded || new Date(0).toISOString();

/** When group `group` of `e` last changed, as best known. */
export function fieldTime(e: Entry, group: string): string {
  return e.fieldTimes?.[group] ?? e.fieldTimes?._base ?? wholeTime(e);
}

/** Record in `after` which groups changed since `before`, at `at`. */
export function stampFields(before: Entry, after: Entry, at: string): void {
  const changed = new Set(
    keysOf(before, after)
      .filter((k) => !same(before[k as keyof Entry], after[k as keyof Entry]))
      .map(groupOf)
  );
  if (!changed.size) return;
  const times = { ...(before.fieldTimes ?? { _base: wholeTime(before) }), ...after.fieldTimes };
  for (const g of changed) times[g] = at;
  after.fieldTimes = times;
}

/**
 * One entry from two copies of it: each group from the copy that changed it
 * last (ties keep `local`). The episode guide is the more recently fetched one.
 */
export function mergeEntry<T extends Entry>(local: T, remote: T): T {
  const out: Record<string, unknown> = { ...local };
  const times: Record<string, string> = {};
  const groups = new Set(keysOf(local, remote).map(groupOf));
  for (const g of groups) {
    const [tl, tr] = [fieldTime(local, g), fieldTime(remote, g)];
    const from = tr > tl ? remote : local;
    for (const k of keysOf(local, remote).filter((k) => groupOf(k) === g)) {
      if (k in from) out[k] = from[k as keyof T];
      else delete out[k];
    }
    if (local.fieldTimes?.[g] || remote.fieldTimes?.[g]) times[g] = tr > tl ? tr : tl;
  }
  const bases = [local.fieldTimes?._base, remote.fieldTimes?._base]
    .filter((b): b is string => Boolean(b))
    .sort();
  if (bases.length) times._base = bases.at(-1)!;
  if (Object.keys(times).length) out.fieldTimes = times;
  else delete out.fieldTimes;
  const guides = [local.episodeGuide, remote.episodeGuide].filter(Boolean) as NonNullable<
    T['episodeGuide']
  >[];
  if (guides.length) out.episodeGuide = guides.sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt))[0];
  out.updatedAt = wholeTime(remote) > wholeTime(local) ? wholeTime(remote) : wholeTime(local);
  return out as T;
}
