// Status shelves: the library seen by where things stand. Each is a filter
// over what the user already recorded; none asks for anything more.

import type { CatalogEntry, EntryType } from '../types';

export type ShelfId = 'all' | 'now' | 'want' | 'finished' | 'year' | 'abandoned' | 'unrated' | 'unmatched';

const finishedIn = (e: CatalogEntry, year: number) =>
  (e.finishes || []).some((f) => new Date(f).getFullYear() === year);

/** A shelf's short name, worded for the tab it is on ("Reading" on Books). */
export function shelfLabel(id: ShelfId, type: EntryType | 'all' = 'all'): string {
  return {
    all: 'All',
    now: type === 'book' ? 'Reading' : type === 'all' ? 'In progress' : 'Watching',
    want: 'Wishlist',
    finished: 'Finished',
    year: 'This year',
    abandoned: 'Did not finish',
    unrated: 'Unrated',
    unmatched: 'Needs a match'
  }[id];
}

/** What a shelf holds, said in full, for screen readers. */
export function shelfDescription(id: ShelfId, year: number): string {
  return {
    all: 'Everything',
    now: 'Reading or watching now',
    want: 'Wishlist',
    finished: 'Finished',
    year: `Finished in ${year}`,
    abandoned: 'Did not finish',
    unrated: 'Finished but not rated',
    unmatched: 'Not matched to the catalog'
  }[id];
}

export const SHELF_IDS: ShelfId[] = [
  'all',
  'now',
  'want',
  'finished',
  'year',
  'abandoned',
  'unrated',
  'unmatched'
];

/** Whether `e` is on shelf `id`. Unrated means finished but not yet rated. */
export function onShelf(e: CatalogEntry, id: ShelfId, year: number): boolean {
  switch (id) {
    case 'all':
      return true;
    case 'now':
      return e.status === 'in-progress';
    case 'want':
      return e.status === 'want';
    case 'finished':
      return e.status === 'finished';
    case 'year':
      return finishedIn(e, year);
    case 'abandoned':
      return e.status === 'abandoned';
    case 'unrated':
      return e.status === 'finished' && e.rating == null;
    case 'unmatched':
      return Boolean(e.needsMatch);
  }
}

/** Last finished first; things never finished (or undated) after, as given. */
export function byLastFinish(a: CatalogEntry, b: CatalogEntry): number {
  const last = (e: CatalogEntry) => e.finishes?.at(-1) ?? '';
  return last(b).localeCompare(last(a));
}
