// Writes to one entry never undo each other: a change starts from the stored
// copy, waits for earlier writes, and background refreshes write only their
// own fields.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};

const show = () => ({
  id: 'tv1',
  type: 'tv',
  sourceId: '123',
  title: 'Show',
  status: 'in-progress',
  rating: null,
  creators: [],
  genres: [],
  tags: [],
  notes: '',
  summary: '',
  year: null,
  dateAdded: '2025-01-01T00:00:00.000Z',
  dateRated: null,
  thumbnailUrl: null,
  thumbnailBlob: null,
  updatedAt: '2025-01-01T00:00:00.000Z'
});

const tick = (ms) => new Promise((r) => setTimeout(r, ms));

beforeEach(async () => {
  vi.resetModules();
  const { db } = await import('../src/db/database');
  await db.entries.clear();
  await db.tombstones.clear();
});

describe('patchEntry', () => {
  it('runs changes to one entry one after another, each on the stored copy', async () => {
    const db = await import('../src/db/database');
    await db.saveEntry(show());
    // A slow change (one that reads the queue or fetches a cover) and a quick one after it.
    const slow = db.patchEntry('tv1', async (d) => {
      await tick(30);
      d.notes = 'slow';
    });
    const quick = db.patchEntry('tv1', (d) => void (d.rating = 4));
    await Promise.all([slow, quick]);
    const saved = await db.getEntry('tv1');
    expect(saved.notes).toBe('slow');
    expect(saved.rating).toBe(4);
  });

  it('returns null and saves nothing for an entry that is gone', async () => {
    const db = await import('../src/db/database');
    expect(await db.patchEntry('missing', (d) => void (d.rating = 1))).toBeNull();
    expect(await db.getEntry('missing')).toBeUndefined();
  });

  it('leaves the entry unsaved when the change returns false', async () => {
    const db = await import('../src/db/database');
    await db.saveEntry(show(), { touch: false });
    await db.patchEntry('tv1', () => false);
    expect((await db.getEntry('tv1')).updatedAt).toBe('2025-01-01T00:00:00.000Z');
  });
});

describe('episode guide refresh', () => {
  it('keeps an edit made while the guide downloads, and its timestamp', async () => {
    vi.doMock('../src/api/tvdb', () => ({
      isTvdbConfigured: async () => true,
      getEpisodeGuide: async () => {
        await tick(40);
        return { fetchedAt: new Date().toISOString(), status: 'Continuing', episodes: [] };
      }
    }));
    const db = await import('../src/db/database');
    const { refreshFollowedGuides } = await import('../src/api/episode-sync');
    await db.saveEntry(show());
    const running = refreshFollowedGuides();
    await tick(10);
    const edited = await db.patchEntry('tv1', (d) => {
      d.rating = 4.5;
      d.notes = 'great';
    });
    await running;
    const after = await db.getEntry('tv1');
    expect(after.rating).toBe(4.5);
    expect(after.notes).toBe('great');
    expect(after.updatedAt).toBe(edited.updatedAt);
    expect(after.episodeGuide.status).toBe('Continuing');
    vi.doUnmock('../src/api/tvdb');
  });
});
