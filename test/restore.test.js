// Restoring a backup: deleted entries come back for good, and records that
// aren't entries are left out instead of breaking the library.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { mergeSnapshots } from '../src/sync/merge';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};

const book = {
  id: 'b1',
  type: 'book',
  title: 'Dune',
  creators: ['Frank Herbert'],
  genres: [],
  tags: [],
  year: 1965,
  summary: '',
  notes: '',
  rating: 4,
  sourceId: null,
  thumbnailUrl: null,
  dateAdded: '2025-01-01T00:00:00.000Z',
  dateRated: null,
  updatedAt: '2025-06-01T00:00:00.000Z'
};

beforeEach(async () => {
  vi.resetModules();
  const { db } = await import('../src/db/database');
  await db.entries.clear();
  await db.tombstones.clear();
});

describe('restoring a deleted entry', () => {
  it('stamps it now, so the deletion kept for sync does not remove it again', async () => {
    const db = await import('../src/db/database');
    const { importJson } = await import('../src/export/json');
    await db.saveEntry({ ...book, thumbnailBlob: null }, { touch: false });
    await db.deleteEntry('b1', '2025-09-01T00:00:00.000Z');
    await importJson(JSON.stringify({ entries: [book] }));
    const restored = await db.getEntry('b1');
    expect(restored.updatedAt > '2025-09-01T00:00:00.000Z').toBe(true);
    expect(await db.listTombstones()).toEqual([]);
    // The sync file still holds the deletion; the restore wins.
    const { toDelete, merged } = mergeSnapshots(
      { entries: [restored], tombstones: [] },
      { entries: [], tombstones: [{ id: 'b1', deletedAt: '2025-09-01T00:00:00.000Z' }] },
      { now: new Date('2025-09-02') }
    );
    expect(toDelete).toEqual([]);
    expect(merged.entries.map((e) => e.id)).toEqual(['b1']);
  });

  it('keeps the backup’s timestamp when overwriting an entry that is still here', async () => {
    const db = await import('../src/db/database');
    const { importJson } = await import('../src/export/json');
    await db.saveEntry({ ...book, thumbnailBlob: null, notes: 'newer' });
    await importJson(JSON.stringify({ entries: [book] }));
    expect((await db.getEntry('b1')).updatedAt).toBe(book.updatedAt);
  });
});

describe('records that are not entries', () => {
  it('are left out or given the shape every screen expects', async () => {
    const db = await import('../src/db/database');
    const { importJson } = await import('../src/export/json');
    const r = await importJson(
      JSON.stringify({
        entries: [
          { id: 'notitle', type: 'book' },
          { id: 'odd', type: 'book', title: 7, creators: 'Someone', rating: 9, status: 'read' },
          { id: 'mag', type: 'magazine', title: 'Wired' },
          { type: 'book', title: 'No id' },
          null
        ]
      })
    );
    expect(r).toMatchObject({ imported: 2, skippedInvalid: 3, total: 5 });
    const notitle = await db.getEntry('notitle');
    expect(notitle).toMatchObject({ title: 'Untitled', creators: [], genres: [], tags: [], finishes: [] });
    const odd = await db.getEntry('odd');
    expect(odd).toMatchObject({ title: '7', creators: ['Someone'], rating: null, status: null });
  });

  it('a catalog import afterwards still works', async () => {
    const db = await import('../src/db/database');
    // Already on the shelf from an older version, before records were checked.
    await db.db.entries.put({ id: 'bare', type: 'book' });
    const { importCatalogExport } = await import('../src/export/catalog-import');
    const file = {
      name: 'goodreads.csv',
      arrayBuffer: async () =>
        new TextEncoder().encode('Title,Author,Exclusive Shelf\nDune,Frank Herbert,read\n').buffer
    };
    await expect(importCatalogExport([file])).resolves.toMatchObject({ added: 1 });
  });
});
