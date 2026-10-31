// The app's status vocabulary, in one place (cards, detail view, series, queue).

/** @typedef {import('../types').EntryStatus} EntryStatus */

/** @type {Record<EntryStatus, string>} */
export const STATUS_LABEL = { want: 'Wishlist', 'in-progress': 'Progressing', finished: 'Completed' };

/** @param {EntryStatus | null | undefined} status */
export function statusLabel(status) {
  return status ? STATUS_LABEL[status] || '' : '';
}
