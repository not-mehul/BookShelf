// The ranked "want to" queue.
//
// Entries with status 'want' are ordered by a fractional `queueRank`: moving an
// item gives it a rank between its new neighbours, so a reorder writes one
// entry (and syncs cleanly). Ranks are re-spaced if they get too close.

import type { CatalogEntry } from '../types';

const MIN_GAP = 1e-6;

/**
 * Queued entries in order: ranked first (ascending), then unranked by date added.
 */
export function queueOrder(entries: CatalogEntry[]) {
  return entries
    .filter((e) => e.status === 'want' && e.type !== 'quote')
    .sort((a, b) => {
      const ra = a.queueRank ?? Infinity;
      const rb = b.queueRank ?? Infinity;
      return ra - rb || (a.dateAdded || '').localeCompare(b.dateAdded || '');
    });
}

/**
 * A rank strictly between two neighbours (either may be missing).
 */
export function rankBetween(before: number | null | undefined, after: number | null | undefined) {
  if (before == null && after == null) return 1;
  if (before == null) return (after as number) - 1;
  if (after == null) return before + 1;
  return (before + after) / 2;
}

/**
 * Give every queued entry a rank (1, 2, 3… in current order) if any is
 * missing or neighbours are too close. Returns only the entries that changed.
 * @param ordered Output of queueOrder().
 */
export function normalizeRanks(ordered: CatalogEntry[]) {
  const crowded = ordered.some(
    (e, i) => i > 0 && (e.queueRank ?? 0) - (ordered[i - 1]!.queueRank ?? 0) < MIN_GAP
  );
  const missing = ordered.some((e) => e.queueRank == null);
  if (!crowded && !missing) return [];
  const changed: CatalogEntry[] = [];
  ordered.forEach((e, i) => {
    if (e.queueRank !== i + 1) {
      e.queueRank = i + 1;
      changed.push(e);
    }
  });
  return changed;
}

/**
 * New rank for the item at `from` once moved to index `to` (in `ordered`).
 */
export function rankForMove(ordered: CatalogEntry[], from: number, to: number) {
  const rest = ordered.filter((_, i) => i !== from);
  const before = rest[to - 1]?.queueRank;
  const after = rest[to]?.queueRank;
  return rankBetween(before, after);
}

/**
 * Rank that puts an entry at the end of the queue.
 */
export function rankAtEnd(entries: CatalogEntry[]) {
  const ranks = queueOrder(entries)
    .map((e) => e.queueRank)
    .filter((r) => r != null);
  return ranks.length ? Math.max(...ranks) + 1 : 1;
}

export interface PickFilters {
  type?: 'all' | 'book' | 'movie' | 'tv';
  /** Books of at most SHORT_BOOK_PAGES pages. */
  short?: boolean;
  genre?: string;
}
export const SHORT_BOOK_PAGES = 300;

/**
 * Pick something from the queue matching the filters, weighted toward the top
 * (the n-th of N items has weight N − n + 1). Null if nothing matches.
 * @param [random] Injectable for tests.
 * @param [excludeId] Avoid repeating the previous pick.
 */
export function pickFromQueue(
  ordered: CatalogEntry[],
  filters: PickFilters = {},
  random: () => number = Math.random,
  excludeId?: string
) {
  const { type = 'all', short = false, genre = '' } = filters;
  let pool = ordered.filter(
    (e) =>
      (type === 'all' || e.type === type) &&
      (!short || (e.type === 'book' && e.pageCount != null && e.pageCount <= SHORT_BOOK_PAGES)) &&
      (!genre || (e.genres || []).includes(genre))
  );
  if (pool.length > 1 && excludeId) pool = pool.filter((e) => e.id !== excludeId);
  if (!pool.length) return null;
  const weights = pool.map((_, i) => pool.length - i);
  let r = random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i]!;
    if (r < 0) return pool[i];
  }
  return pool[pool.length - 1];
}
