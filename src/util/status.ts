// The app's status vocabulary, in one place (cards, detail view, series, queue,
// share cards). The same four words everywhere; "under way" says what you are
// doing with it: reading a book, watching a film or a show.

import type { EntryStatus, EntryType } from '../types';

export const STATUS_LABEL: Record<EntryStatus, string> = {
  want: 'Wishlist',
  'in-progress': 'In progress',
  finished: 'Finished',
  abandoned: 'Did not finish'
};

/** The status as a word; "Reading" or "Watching" for something under way, when the type is known. */
export function statusLabel(status: EntryStatus | null | undefined, type?: EntryType): string {
  if (!status) return '';
  if (status === 'in-progress' && type && type !== 'quote') return type === 'book' ? 'Reading' : 'Watching';
  return STATUS_LABEL[status] || '';
}
