import { describe, it, expect } from 'vitest';
import {
  normalizeBook,
  normalizeOpenLibraryDoc,
  normalizeTmdbHit,
  normalizeTmdbEpisode,
  enrichFromTmdbDetail
} from '../src/api/normalize';

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

const GENRES = new Map([
  [18, 'Drama'],
  [16, 'Animation']
]);

describe('normalizeTmdbHit', () => {
  it('maps a film with its English title, original title, year, genres and poster', () => {
    const out = normalizeTmdbHit(
      {
        id: 129,
        title: 'Spirited Away',
        original_title: '千と千尋の神隠し',
        release_date: '2001-07-20',
        overview: 'A girl in a spirit world.',
        poster_path: '/abc.jpg',
        genre_ids: [16, 99]
      },
      'movie',
      GENRES
    );
    expect(out).toMatchObject({
      type: 'movie',
      sourceId: 'tmdb:129',
      title: 'Spirited Away',
      originalTitle: '千と千尋の神隠し',
      year: 2001,
      genres: ['Animation'],
      thumbnailUrl: 'https://image.tmdb.org/t/p/w500/abc.jpg',
      detailUrl: 'https://www.themoviedb.org/movie/129'
    });
  });

  it('maps a show, with no original title when it is already English', () => {
    const out = normalizeTmdbHit(
      {
        id: 1437,
        name: 'Firefly',
        original_name: 'Firefly',
        first_air_date: '2002-09-20',
        poster_path: null
      },
      'tv',
      GENRES
    );
    expect(out).toMatchObject({
      type: 'tv',
      sourceId: 'tmdb:1437',
      year: 2002,
      originalTitle: null,
      thumbnailUrl: null
    });
  });
});

describe('enrichFromTmdbDetail', () => {
  it('fills genres, the director and the runtime of a film', () => {
    const base = { type: 'movie', title: 'X', creators: [], genres: [] };
    const out = enrichFromTmdbDetail(base, {
      id: 1,
      runtime: 117,
      genres: [{ id: 1, name: 'Science Fiction' }],
      credits: {
        crew: [
          { job: 'Director', name: 'Ridley Scott' },
          { job: 'Writer', name: 'Hampton Fancher' }
        ]
      }
    });
    expect(out.genres).toEqual(['Science Fiction']);
    expect(out.creators).toEqual(['Ridley Scott']);
    expect(out.runtime).toBe(117);
    expect(out.enriched).toBe(true);
  });

  it("names a show's creators", () => {
    const out = enrichFromTmdbDetail(
      { type: 'tv', title: 'Severance' },
      { id: 2, created_by: [{ name: 'Dan Erickson' }] }
    );
    expect(out.creators).toEqual(['Dan Erickson']);
  });

  it('returns the entry untouched when there is no detail', () => {
    const base = { type: 'movie', title: 'X' };
    expect(enrichFromTmdbDetail(base, null)).toBe(base);
  });
});

describe('episodes from TMDB', () => {
  it('normalizes episode records and drops unusable ones', () => {
    expect(
      normalizeTmdbEpisode({
        id: 7,
        season_number: 2,
        episode_number: 3,
        name: 'Hello',
        air_date: '2026-10-20',
        runtime: 52
      })
    ).toEqual({ id: 7, s: 2, e: 3, name: 'Hello', aired: '2026-10-20', runtime: 52 });
    expect(
      normalizeTmdbEpisode({ id: 8, season_number: 1, episode_number: 1, air_date: null }).aired
    ).toBeNull();
    expect(normalizeTmdbEpisode({ id: 9, episode_number: 1 })).toBeNull();
  });
});
