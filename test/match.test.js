// Find a match and duplicates: a sure match is picked only when it is surely
// the same thing, a match fills in only what is empty, and merging two copies
// keeps everything the user wrote on either.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};

const entry = (fields) => ({
  id: fields.id ?? Math.random().toString(36).slice(2),
  type: 'book',
  sourceId: null,
  title: '',
  creators: [],
  genres: [],
  tags: [],
  notes: '',
  summary: '',
  year: null,
  rating: null,
  status: null,
  thumbnailUrl: null,
  thumbnailBlob: null,
  dateAdded: '2025-01-01T00:00:00.000Z',
  dateRated: null,
  ...fields
});
const hit = (fields) => ({
  type: 'book',
  sourceId: 'g1',
  title: '',
  creators: [],
  year: null,
  summary: '',
  genres: [],
  thumbnailUrl: null,
  ...fields
});

let match;
let dups;
let db;
beforeEach(async () => {
  vi.resetModules();
  store.clear();
  match = await import('../src/api/match');
  dups = await import('../src/util/duplicates');
  db = await import('../src/db/database');
  await db.db.entries.clear();
});

describe('a sure match', () => {
  it('is the same ISBN, or the same title by the same author', () => {
    const book = entry({ title: 'Leviathan Wakes', creators: ['James S.A. Corey'], isbn: '9780316129084' });
    const other = hit({ sourceId: 'a', title: 'Leviathan Wakes', creators: ['Someone Else'] });
    const same = hit({ sourceId: 'b', title: 'Leviathan wakes', creators: ['James S. A. Corey'] });
    const byIsbn = hit({ sourceId: 'c', title: 'Leviathan Wakes (Expanse 1)', isbn: '9780316129084' });
    expect(match.confidentPick(book, [other, same, byIsbn])?.sourceId).toBe('c');
    expect(match.confidentPick({ ...book, isbn: null }, [other, same])?.sourceId).toBe('b');
    expect(match.confidentPick({ ...book, isbn: null }, [other])).toBeNull();
  });

  it('for a film, is the only one with the title and year', () => {
    const film = entry({ type: 'movie', title: 'Dune', year: 2021 });
    const hits = [
      hit({ type: 'movie', sourceId: 'tmdb:1', title: 'Dune', year: 1984 }),
      hit({ type: 'movie', sourceId: 'tmdb:2', title: 'Dune', year: 2021 })
    ];
    expect(match.confidentPick(film, hits)?.sourceId).toBe('tmdb:2');
  });

  it('for a film, folds accents and reads original titles, and stays unsure with two that fit', () => {
    const amelie = { title: 'Amélie', originalTitle: null, year: 2001 };
    const film = (id, title, year, more = {}) =>
      hit({ type: 'movie', sourceId: `tmdb:${id}`, title, year, ...more });
    expect(match.pickFilm(amelie, [film(1, 'Amelie', 2001), film(2, 'Amélie', 1990)])?.sourceId).toBe(
      'tmdb:1'
    );
    expect(match.pickFilm(amelie, [film(1, 'Amelie', 2001), film(3, 'Amélie', 2001)])).toBeNull();
    expect(match.pickFilm(amelie, [film(4, 'Amélie: Behind the Scenes', 2001)])).toBeNull();
    expect(
      match.pickFilm({ title: 'Spirited Away', year: 2001 }, [
        film(5, 'Sen to Chihiro', 2001, { originalTitle: 'Spirited Away' })
      ])?.sourceId
    ).toBe('tmdb:5');
  });
});

describe('what lacks a match', () => {
  it('is anything without an id, and a film or show without a TMDB one', () => {
    expect(match.lacksMatch(entry({ sourceId: null }))).toBe(true);
    expect(match.lacksMatch(entry({ sourceId: 'gb:1' }))).toBe(false);
    expect(match.lacksMatch(entry({ type: 'movie', sourceId: '12345' }))).toBe(true);
    expect(match.lacksMatch(entry({ type: 'tv', sourceId: 'tmdb:95396' }))).toBe(false);
    expect(match.lacksMatch(entry({ type: 'quote', sourceId: null }))).toBe(false);
  });
});

describe('ticked episodes on a show matched again', () => {
  it('carry over by season and episode number', () => {
    const old = [
      { id: 11, s: 1, e: 1 },
      { id: 12, s: 1, e: 2 },
      { id: 21, s: 2, e: 1 }
    ];
    const next = [
      { id: 901, s: 1, e: 1 },
      { id: 902, s: 1, e: 2 },
      { id: 903, s: 2, e: 1 }
    ];
    expect(match.carryWatched(old, [11, 21], next)).toEqual([901, 903]);
  });
});

describe('applying a match', () => {
  it('fills only what is empty and never touches what the user wrote', () => {
    const d = entry({
      title: 'My title',
      creators: ['Me'],
      rating: 4,
      status: 'finished',
      notes: 'Loved it',
      tags: ['sci-fi']
    });
    const h = hit({
      sourceId: 'g9',
      title: 'Catalog title',
      creators: ['Catalog author'],
      summary: 'A synopsis',
      genres: ['Fiction'],
      pageCount: 592,
      thumbnailUrl: 'https://covers.test/x.jpg',
      detailUrl: 'https://books.test/x'
    });
    expect(match.matchFills(d, h)).toEqual(['Cover', 'Synopsis', 'Genres', 'Page count']);
    match.applyMatch(d, h);
    expect(d).toMatchObject({
      sourceId: 'g9',
      title: 'My title',
      creators: ['Me'],
      rating: 4,
      status: 'finished',
      notes: 'Loved it',
      tags: ['sci-fi'],
      summary: 'A synopsis',
      pageCount: 592,
      thumbnailUrl: 'https://covers.test/x.jpg'
    });
  });
});

describe('duplicates', () => {
  it('pairs copies, keeping the matched one, and remembers a pair kept apart', () => {
    const a = entry({ id: 'a', title: 'Piranesi', creators: ['Susanna Clarke'] });
    const b = entry({ id: 'b', title: 'Piranesi', creators: ['Susanna Clarke'], sourceId: 'g1' });
    const c = entry({ id: 'c', title: 'Jonathan Strange', creators: ['Susanna Clarke'] });
    const pairs = dups.findDuplicates([a, b, c]);
    expect(pairs.map(([k, d]) => [k.id, d.id])).toEqual([['b', 'a']]);
    dups.markNotDuplicates('a', 'b');
    expect(dups.findDuplicates([a, b, c])).toEqual([]);
  });

  it('finds the shelf copy of a search result by ISBN or title and author', () => {
    const shelf = [entry({ id: 'a', title: 'Piranesi', creators: ['Susanna Clarke'] })];
    expect(dups.findCopy(shelf, hit({ title: 'Piranesi', creators: ['Susanna Clarke'] }))?.id).toBe('a');
    expect(dups.findCopy(shelf, hit({ title: 'Piranesi', creators: ['Another Clarke'] }))?.id).toBe('a');
    expect(dups.findCopy(shelf, hit({ title: 'Piranesi', creators: ['Ann Leckie'] }))).toBeNull();
  });

  it('merges two copies into one, keeping what each had and moving quotes', async () => {
    await db.saveEntry(
      entry({
        id: 'keep',
        title: 'Piranesi',
        creators: ['Susanna Clarke'],
        sourceId: 'g1',
        rating: 4.5,
        tags: ['fav']
      })
    );
    await db.saveEntry(
      entry({
        id: 'drop',
        title: 'Piranesi',
        creators: ['Susanna Clarke'],
        status: 'finished',
        finishes: ['2024-05-01T12:00:00.000Z'],
        notes: 'Read on holiday',
        tags: ['2024']
      })
    );
    await db.saveEntry(
      entry({ id: 'q', type: 'quote', title: 'The beauty of the House…', linkedEntryId: 'drop' })
    );
    await dups.mergeDuplicate('keep', 'drop');
    const kept = await db.getEntry('keep');
    expect(kept).toMatchObject({ rating: 4.5, status: 'finished', notes: 'Read on holiday', sourceId: 'g1' });
    expect(kept.tags.sort()).toEqual(['2024', 'fav']);
    expect(kept.finishes).toEqual(['2024-05-01T12:00:00.000Z']);
    expect(await db.getEntry('drop')).toBeUndefined();
    expect((await db.getEntry('q')).linkedEntryId).toBe('keep');
  });
});
