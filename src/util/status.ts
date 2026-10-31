// The app's status vocabulary, in one place (cards, detail view, series, queue).

import type { EntryStatus } from '../types';
export const STATUS_LABEL: Record<EntryStatus, string> = {
  want: 'Wishlist',
  'in-progress': 'Progressing',
  finished: 'Completed'
};

export function statusLabel(status: EntryStatus | null | undefined) {
  return status ? STATUS_LABEL[status] || '' : '';
}
