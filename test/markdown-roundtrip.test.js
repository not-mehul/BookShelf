// The Markdown export reads back as it was written: titles with dashes,
// synopses with rules or italic lines, dialogue quotes, authors with commas.
import { describe, it, expect, beforeEach, vi } from 'vitest';
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
  year: null,
  summary: '',
  notes: '',
  rating: null,
  sourceId: null,
  thumbnailUrl: null,
  thumbnailBlob: null,
  dateAdded: '2025-01-01T12:00:00.000Z',
  dateRated: null
};

let db;
beforeEach(async () => {
  vi.resetModules();
  db = await import('../src/db/database');
  await db.db.entries.clear();
});

async function roundTrip(entries) {
  for (const e of entries) await db.saveEntry({ ...base, ...e });
  const { exportMarkdown } = await import('../src/export/markdown');
  const { parseMarkdown } = await import('../src/export/import');
  return parseMarkdown(await exportMarkdown());
}

describe('Markdown round trip', () => {
  it('keeps the day something was put down', async () => {
    const [book] = await roundTrip([
      {
        id: 'dnf',
        type: 'book',
        title: 'Infinite Jest',
        status: 'abandoned',
        dateStarted: '2026-01-04T12:00:00.000Z',
        dateStopped: '2026-02-10T12:00:00.000Z'
      }
    ]);
    expect(book.status).toBe('abandoned');
    expect(book.dateStopped?.slice(0, 10)).toBe('2026-02-10');
  });

  it('keeps a title with a dash, its year and rating', async () => {
    const [film] = await roundTrip([
      { id: 'sw', type: 'movie', title: 'Star Wars — A New Hope', year: 1977, rating: 4.5 }
    ]);
    expect(film).toMatchObject({ title: 'Star Wars — A New Hope', year: 1977, rating: 4.5 });
  });

  it('keeps a synopsis with a rule, a heading-like line, an italic line and angle brackets', async () => {
    const summary = 'Part one.\n---\nPart two.\n## Not a section\n*Winner of the Hugo Award*\nA <b> tag';
    const out = await roundTrip([
      { id: 'b', type: 'book', title: 'Book A', creators: ['Ann Author'], summary },
      { id: 'c', type: 'book', title: 'Book B', creators: ['Bea Writer'] }
    ]);
    expect(out).toHaveLength(2);
    const a = out.find((e) => e.title === 'Book A');
    expect(a.creators).toEqual(['Ann Author']);
    expect(a.summary).toBe(summary);
  });

  it('keeps a quote that opens with a dialogue dash, an author with a comma, the location and notes', async () => {
    const [q] = await roundTrip([
      {
        id: 'q',
        type: 'quote',
        title: '— Not now, he said.',
        quoteText: '— Not now, he said.\nLater.',
        creators: ['Le Guin, Ursula K.'],
        source: 'The Dispossessed',
        location: 'p. 12',
        notes: 'line one\nline two'
      }
    ]);
    expect(q).toMatchObject({
      quoteText: '— Not now, he said.\nLater.',
      creators: ['Le Guin, Ursula K.'],
      source: 'The Dispossessed',
      location: 'p. 12',
      notes: 'line one\nline two'
    });
  });

  it('importing the same export twice adds nothing the second time', async () => {
    await db.saveEntry({ ...base, id: 'd', type: 'book', title: 'Dune', creators: ['Frank Herbert'] });
    const { exportMarkdown } = await import('../src/export/markdown');
    const { importMarkdown } = await import('../src/export/import');
    const md = await exportMarkdown();
    await db.db.entries.clear();
    expect(await importMarkdown(md)).toEqual({ imported: 1, skipped: 0 });
    expect(await importMarkdown(md)).toEqual({ imported: 0, skipped: 1 });
    expect(await db.db.entries.count()).toBe(1);
  });
});
