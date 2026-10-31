// Display names and icons for each kind of entry.

import type { IconName } from './icons';
import type { EntryType } from '../types';

export const TYPE_LABEL: Record<EntryType, string> = {
  book: 'Book',
  movie: 'Movie',
  tv: 'TV Show',
  quote: 'Quote'
};
/** Shorter, for chips and list rows. */
export const TYPE_SHORT: Record<EntryType, string> = {
  book: 'Book',
  movie: 'Movie',
  tv: 'TV',
  quote: 'Quote'
};
export const TYPE_ICON: Record<EntryType, IconName> = {
  book: 'book',
  movie: 'film',
  tv: 'tv',
  quote: 'quote'
};

/** "1 entry", "3 books"… */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
