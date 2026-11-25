// Films and shows on TheTVDB ids move to TMDB once: shows by their TheTVDB id,
// films by a single title-and-year match, ticked episodes by season and
// number. What the user wrote is never touched.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};

const base = {
  creators: [],
  genres: [],
  tags: [],
  notes: '',
  summary: '',
  rating: null,
  dateAdded: '2025-01-01T00:00:00.000Z',
  dateRated: null,
  thumbnailBlob: null,
  updatedAt: '2025-01-01T00:00:00.000Z'
};

const hit = (id, title, year, extra = {}) => ({
  type: 'movie',
  sourceId: `tmdb:${id}`,
  title,
  originalTitle: null,
  year,
  creators: [],
  summary: '',
  genres: [],
  thumbnailUrl: null,
  ...extra
});

beforeEach(() => {
  vi.resetModules();
  vi.doMock('../src/util/thumbs', () => ({ fetchThumbBlob: async () => null }));
});
afterEach(() => {
  vi.doUnmock('../src/api/tmdb');
  vi.doUnmock('../src/util/thumbs');
});

async function withTmdb(fake) {
  vi.doMock('../src/api/tmdb', async () => ({
    ...(await vi.importActual('../src/api/tmdb')),
    isTmdbConfigured: async () => true,
    ...fake
  }));
  const db = await import('../src/db/database');
  await db.db.entries.clear();
  return { db, move: await import('../src/api/tmdb-move') };
}

describe('picking the film', () => {
  it('takes the one film with the same title and year, and none when unsure', async () => {
    const { pickFilm } = await import('../src/api/tmdb-move');
    const entry = { title: 'Amélie', originalTitle: null, year: 2001 };
    expect(pickFilm(entry, [hit(1, 'Amelie', 2001), hit(2, 'Amélie', 1990)])?.sourceId).toBe('tmdb:1');
    expect(pickFilm(entry, [hit(1, 'Amelie', 2001), hit(3, 'Amélie', 2001)])).toBeNull();
    expect(pickFilm(entry, [hit(4, 'Amélie: Behind the Scenes', 2001)])).toBeNull();
    expect(
      pickFilm({ title: 'Spirited Away', year: 2001 }, [
        hit(5, 'Sen to Chihiro', 2001, { originalTitle: 'Spirited Away' })
      ])?.sourceId
    ).toBe('tmdb:5');
  });
});

describe('ticked episodes', () => {
  it('carry over by season and episode number', async () => {
    const { carryWatched } = await import('../src/api/tmdb-move');
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
    expect(carryWatched(old, [11, 21], next)).toEqual([901, 903]);
  });
});

describe('moving the shelf', () => {
  it('moves a show and a film, keeps what the user wrote, and marks what it cannot match', async () => {
    const { db, move } = await withTmdb({
      findShowByTvdbId: async (id) => (id === '371980' ? 95396 : null),
      searchTmdb: async (q) =>
        q === 'Arrival' ? [hit(329865, 'Arrival', 2016)] : [hit(1, q, 1999), hit(2, q, 1999)],
      fetchDetail: async ({ type }) =>
        type === 'movie'
          ? {
              id: 329865,
              runtime: 116,
              genres: [{ id: 1, name: 'Drama' }],
              credits: { crew: [{ job: 'Director', name: 'Denis Villeneuve' }] }
            }
          : { id: 95396, genres: [{ id: 2, name: 'Mystery' }], created_by: [{ name: 'Dan Erickson' }] },
      getEpisodeGuide: async () => ({
        fetchedAt: '2026-11-25T00:00:00.000Z',
        status: 'Returning Series',
        episodes: [
          { id: 901, s: 1, e: 1, name: '', aired: '2022-02-18' },
          { id: 902, s: 1, e: 2, name: '', aired: '2022-02-18' }
        ]
      })
    });
    await db.saveEntry({
      ...base,
      id: 'sev',
      type: 'tv',
      title: 'Severance',
      year: 2022,
      sourceId: '371980',
      status: 'in-progress',
      rating: 4.5,
      notes: 'Mind-bending',
      thumbnailUrl: 'https://artworks.thetvdb.com/banners/sev.jpg',
      watchedEpisodes: [11],
      episodeGuide: {
        fetchedAt: '2025-01-01T00:00:00.000Z',
        episodes: [
          { id: 11, s: 1, e: 1 },
          { id: 12, s: 1, e: 2 }
        ]
      }
    });
    await db.saveEntry({
      ...base,
      id: 'arr',
      type: 'movie',
      title: 'Arrival',
      year: 2016,
      sourceId: '12345',
      status: 'finished'
    });
    await db.saveEntry({
      ...base,
      id: 'amb',
      type: 'movie',
      title: 'Twins',
      year: 1999,
      sourceId: '777',
      tags: ['comfort']
    });

    const report = await move.moveToTmdb();
    expect(report).toEqual({ moved: 2, needMatch: 1 });

    const sev = await db.getEntry('sev');
    expect(sev).toMatchObject({
      sourceId: 'tmdb:95396',
      rating: 4.5,
      notes: 'Mind-bending',
      creators: ['Dan Erickson']
    });
    expect(sev.watchedEpisodes).toEqual([901]);
    expect(sev.episodeGuide.status).toBe('Returning Series');
    expect(sev.detailUrl).toBe('https://www.themoviedb.org/tv/95396');

    const arr = await db.getEntry('arr');
    expect(arr).toMatchObject({
      sourceId: 'tmdb:329865',
      status: 'finished',
      creators: ['Denis Villeneuve'],
      runtime: 116
    });

    const amb = await db.getEntry('amb');
    expect(amb).toMatchObject({ sourceId: '777', needsMatch: true, tags: ['comfort'] });

    // A second run has nothing left to do.
    expect(await move.moveToTmdb()).toEqual({ moved: 0, needMatch: 0 });
  });

  it('does nothing without a key', async () => {
    const { db, move } = await withTmdb({ isTmdbConfigured: async () => false });
    await db.saveEntry({
      ...base,
      id: 'arr',
      type: 'movie',
      title: 'Arrival',
      year: 2016,
      sourceId: '12345'
    });
    expect(await move.moveToTmdb()).toEqual({ moved: 0, needMatch: 0 });
    expect((await db.getEntry('arr')).sourceId).toBe('12345');
  });
});
