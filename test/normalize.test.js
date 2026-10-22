import { describe, it, expect } from 'vitest';
import {
  normalizeBook,
  normalizeOpenLibraryDoc,
  normalizeTvdbSearchHit,
  enrichFromTvdbDetail
} from '../src/api/normalize.js';

describe('normalizeBook', () => {
  it('maps Google Books volume fields and upgrades http thumbnails to https', () => {
    const out = normalizeBook({
      id: 'abc',
      volumeInfo: {
        title: 'Dune',
        authors: ['Frank Herbert'],
        publishedDate: '1965-08-01',
        categories: ['Science Fiction'],
        pageCount: 412,
        imageLinks: { thumbnail: 'http://books.example/cover.jpg' },
        infoLink: 'https://books.example/dune'
      }
    });
    expect(out).toMatchObject({
      type: 'book',
      sourceId: 'abc',
      title: 'Dune',
      creators: ['Frank Herbert'],
      year: 1965,
      pageCount: 412
    });
    expect(out.thumbnailUrl).toBe('https://books.example/cover.jpg');
  });

  it('falls back gracefully on sparse volumes', () => {
    const out = normalizeBook({ id: 'x', volumeInfo: {} });
    expect(out.title).toBe('Untitled');
    expect(out.year).toBeNull();
    expect(out.thumbnailUrl).toBeNull();
  });
});

describe('normalizeOpenLibraryDoc', () => {
  it('builds a cover URL from cover_i and trims subjects', () => {
    const out = normalizeOpenLibraryDoc({
      key: '/works/OL1W',
      title: '1984',
      author_name: ['George Orwell'],
      first_publish_year: 1949,
      cover_i: 12345,
      subject: Array.from({ length: 20 }, (_, i) => `s${i}`),
      isbn: ['9780451524935']
    });
    expect(out.type).toBe('book');
    expect(out.title).toBe('1984');
    expect(out.year).toBe(1949);
    expect(out.isbn).toBe('9780451524935');
    expect(out.genres).toHaveLength(8);
    expect(out.thumbnailUrl).toBe('https://covers.openlibrary.org/b/id/12345-L.jpg');
  });
});

describe('normalizeTvdbSearchHit', () => {
  it('maps a series hit to type tv', () => {
    const out = normalizeTvdbSearchHit({ type: 'series', tvdb_id: 42, name: 'Firefly', year: '2002' });
    expect(out.type).toBe('tv');
    expect(out.sourceId).toBe('42');
    expect(out.year).toBe(2002);
  });
  it('maps a movie hit to type movie', () => {
    const out = normalizeTvdbSearchHit({ type: 'movie', id: 7, title: 'Blade Runner' });
    expect(out.type).toBe('movie');
    expect(out.title).toBe('Blade Runner');
  });
});

describe('enrichFromTvdbDetail', () => {
  it('fills genres and directors and sets the enriched flag', () => {
    const base = { type: 'movie', title: 'X', creators: [], genres: [] };
    const out = enrichFromTvdbDetail(base, {
      genres: [{ name: 'Sci-Fi' }, { name: 'Noir' }],
      characters: [
        { peopleType: 'Director', personName: 'Ridley Scott' },
        { peopleType: 'Actor', personName: 'Harrison Ford' }
      ]
    });
    expect(out.genres).toEqual(['Sci-Fi', 'Noir']);
    expect(out.creators).toEqual(['Ridley Scott']);
    expect(out.enriched).toBe(true);
  });
  it('returns the entry untouched when there is no detail', () => {
    const base = { type: 'movie', title: 'X' };
    expect(enrichFromTvdbDetail(base, null)).toBe(base);
  });
});
