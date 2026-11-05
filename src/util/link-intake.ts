// bookshelf:// links from the sibling apps (style.md §14.1), turned into what
// the add flow opens with. A link only ever prefills: the person picks the
// search result, so nothing is saved that they didn't see.
//
//   bookshelf://log?title=…&author=…&isbn=…&finished=YYYY-MM-DD&progress=0.42&source=rosetta
//   bookshelf://open
//
// Anything else that names BookShelf just opens it.

import { dateParam, fractionParam, parseLink } from '../platform/links';
import type { AddOptions } from '../state/ui.svelte';

export type LinkIntake = { kind: 'add'; options: AddOptions } | { kind: 'open' } | null;

export function readBookShelfLink(url: string): LinkIntake {
  const link = parseLink(url, 'bookshelf');
  if (!link) return null;
  if (link.action !== 'log') return { kind: 'open' };
  const { title = '', author = '', isbn = '' } = link.params;
  const cleanIsbn = isbn.replace(/[^0-9Xx]/g, '');
  if (!title && !cleanIsbn) return { kind: 'open' };
  const finished = dateParam(link.params.finished);
  const progress = fractionParam(link.params.progress);
  return {
    kind: 'add',
    options: {
      startWith: 'search',
      searchType: 'book',
      prefill: {
        quoteText: '',
        author,
        source: title,
        // An ISBN finds the exact edition; otherwise title and author.
        query: cleanIsbn || [title, author].filter(Boolean).join(' '),
        link: null
      },
      // The sender's reading state, applied to the result the person picks.
      seed: finished
        ? { status: 'finished' }
        : progress !== null && progress > 0
          ? { status: 'in-progress', progress }
          : undefined
    }
  };
}
