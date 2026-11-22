import { describe, it, expect } from 'vitest';
import { readBookShelfLink } from '../src/util/link-intake';
import { newEntry } from '../src/util/new-entry';

describe('readBookShelfLink', () => {
  it('opens a book search for a log link, keeping the reading state', () => {
    const intake = readBookShelfLink(
      'bookshelf://log?title=Dune&author=Frank+Herbert&finished=2026-11-01&progress=1.00&source=rosetta'
    );
    expect(intake).toEqual({
      kind: 'add',
      options: {
        startWith: 'search',
        searchType: 'book',
        prefill: {
          quoteText: '',
          author: 'Frank Herbert',
          source: 'Dune',
          query: 'Dune Frank Herbert',
          link: null
        },
        seed: { status: 'finished', finishedAt: new Date(2026, 10, 1, 12).toISOString() }
      }
    });
  });

  it('marks a book in progress when only progress is given', () => {
    const intake = readBookShelfLink('bookshelf://log?title=Dune&progress=0.42');
    expect(intake.options.seed).toEqual({ status: 'in-progress', progress: 0.42 });
  });

  it('adds no status for a book not started, or a bad date', () => {
    expect(readBookShelfLink('bookshelf://log?title=Dune&progress=0').options.seed).toBeUndefined();
    expect(readBookShelfLink('bookshelf://log?title=Dune&finished=soon').options.seed).toBeUndefined();
  });

  it('searches by ISBN when there is one', () => {
    expect(readBookShelfLink('bookshelf://log?title=Dune&isbn=978-0-441-17271-9').options.prefill.query).toBe(
      '9780441172719'
    );
  });

  it('just opens for open, unknown actions, and logs with nothing to search', () => {
    expect(readBookShelfLink('bookshelf://open')).toEqual({ kind: 'open' });
    expect(readBookShelfLink('bookshelf://shelve?title=Dune')).toEqual({ kind: 'open' });
    expect(readBookShelfLink('bookshelf://log?author=Herbert')).toEqual({ kind: 'open' });
  });

  it('ignores links to other apps', () => {
    expect(readBookShelfLink('rosetta://open?id=1')).toBeNull();
  });
});

describe('quotes from another app', () => {
  it('opens the quote form filled in, with where it is and the note', () => {
    const intake = readBookShelfLink(
      'bookshelf://quote?text=Call+me+Ishmael.&title=Moby-Dick&author=Herman+Melville&where=Loomings&note=The+opening.&source=rosetta'
    );
    expect(intake).toEqual({
      kind: 'add',
      options: {
        startWith: 'quote',
        prefill: {
          quoteText: 'Call me Ishmael.',
          author: 'Herman Melville',
          source: 'Moby-Dick',
          query: '',
          link: null
        },
        quote: { location: 'Loomings', notes: 'The opening.' }
      }
    });
  });

  it('needs the words of the quote, and keeps them to a sane length', () => {
    expect(readBookShelfLink('bookshelf://quote?title=Moby-Dick')).toEqual({ kind: 'open' });
    const long = readBookShelfLink(`bookshelf://quote?text=${'a'.repeat(5000)}`);
    expect(long.options.prefill.quoteText).toHaveLength(4000);
    expect(long.options.quote).toBeUndefined();
  });

  it('carries a note on the book with a log', () => {
    const intake = readBookShelfLink('bookshelf://log?title=Dune&finished=2026-11-01&note=Spice.');
    expect(intake.options.seed).toEqual({
      status: 'finished',
      finishedAt: new Date(2026, 10, 1, 12).toISOString(),
      notes: 'Spice.'
    });
    expect(readBookShelfLink('bookshelf://log?title=Dune&note=Spice.').options.seed).toEqual({
      notes: 'Spice.'
    });
  });

  it('logs the book on the day the sender finished it, not today', () => {
    const { seed } = readBookShelfLink('bookshelf://log?title=Dune&finished=2025-12-30').options;
    // What the search step saves for the picked result.
    const entry = newEntry('book', { title: 'Dune', status: seed.status, finishes: [seed.finishedAt] });
    expect(entry.finishes).toEqual([new Date(2025, 11, 30, 12).toISOString()]);
    expect(new Date(entry.finishes[0]).getFullYear()).toBe(2025);
  });
});
