// bookshelf:// links from the sibling apps (style.md §14.1), turned into what
// the add flow opens with. A link only ever prefills: the person picks the
// search result, so nothing is saved that they didn't see.
//
//   bookshelf://log?title=…&author=…&isbn=…&finished=YYYY-MM-DD&progress=0.42&note=…&source=rosetta
//   bookshelf://quote?text=…&title=…&author=…&where=…&note=…&source=rosetta
//   bookshelf://open
//
// Anything else that names BookShelf just opens it.

import { dateParam, fractionParam, parseLink } from '../platform/links';
import { fromDay } from './journal';
import type { AddOptions, AddSeed } from '../state/ui.svelte';

export type LinkIntake = { kind: 'add'; options: AddOptions } | { kind: 'open' } | null;

export function readBookShelfLink(url: string): LinkIntake {
  const link = parseLink(url, 'bookshelf');
  if (!link) return null;
  if (link.action === 'quote') return quoteIntake(link.params);
  if (link.action !== 'log') return { kind: 'open' };
  const { title = '', author = '', isbn = '' } = link.params;
  const cleanIsbn = isbn.replace(/[^0-9Xx]/g, '');
  if (!title && !cleanIsbn) return { kind: 'open' };
  const finished = dateParam(link.params.finished);
  const progress = fractionParam(link.params.progress);
  const notes = (link.params.note ?? '').slice(0, MAX_NOTE);
  const finishedAt = finished ? fromDay(finished) : null;
  const status: AddSeed | undefined = finishedAt
    ? { status: 'finished', finishedAt }
    : progress !== null && progress > 0
      ? { status: 'in-progress' }
      : undefined;
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
      // The sender's reading state (and note), applied to the result the person picks.
      seed: status || notes ? { ...status, ...(notes ? { notes } : {}) } : undefined
    }
  };
}

/** A highlight, a line of a script, a page's note: long enough for any, short enough for a link. */
const MAX_QUOTE = 4000;
const MAX_NOTE = 2000;

/** A quote from another app: the quote form, filled in, for the person to save. */
function quoteIntake(params: Record<string, string>): LinkIntake {
  const text = (params.text ?? '').slice(0, MAX_QUOTE);
  if (!text.trim()) return { kind: 'open' };
  const location = (params.where ?? '').slice(0, 200);
  const notes = (params.note ?? '').slice(0, MAX_NOTE);
  return {
    kind: 'add',
    options: {
      startWith: 'quote',
      prefill: {
        quoteText: text,
        author: params.author ?? '',
        source: params.title ?? '',
        query: '',
        link: null
      },
      ...(location || notes
        ? { quote: { ...(location ? { location } : {}), ...(notes ? { notes } : {}) } }
        : {})
    }
  };
}
