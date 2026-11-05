import { describe, it, expect } from 'vitest';
import { readBookShelfLink } from '../src/util/link-intake';

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
        seed: { status: 'finished' }
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
