// Library refresh: what an entry is missing, which entries a refresh looks
// at (and which the user left as they were), and what a match would add.
import { describe, it, expect, beforeEach } from 'vitest';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};

const { missingParts, refreshTodo, markChecked, refreshFills } = await import('../src/api/refresh.ts');

const entry = (fields) => ({
  id: 'e1',
  type: 'book',
  sourceId: 'gb:1',
  title: 'Piranesi',
  creators: ['Susanna Clarke'],
  genres: ['Fantasy'],
  summary: 'A house of endless halls.',
  year: 2020,
  thumbnailUrl: 'https://covers.test/p.png',
  thumbnailBlob: null,
  ...fields
});
const hit = (fields) => ({
  type: 'book',
  sourceId: 'gb:1',
  title: 'Piranesi',
  creators: ['Susanna Clarke'],
  genres: ['Fantasy'],
  summary: 'A house of endless halls.',
  year: 2020,
  thumbnailUrl: 'https://covers.test/p.png',
  ...fields
});

beforeEach(() => store.clear());

describe('missingParts', () => {
  it('finds nothing missing on a complete, matched entry', () => {
    expect(missingParts(entry())).toEqual([]);
  });
  it('names a missing match, cover, synopsis and details', () => {
    expect(missingParts(entry({ sourceId: null, thumbnailUrl: null, summary: '  ', year: null }))).toEqual([
      'match',
      'cover',
      'synopsis',
      'details'
    ]);
    expect(missingParts(entry({ creators: [] }))).toEqual(['details']);
  });
  it('counts a stored cover, and a film TMDB could not place', () => {
    expect(missingParts(entry({ thumbnailUrl: null, thumbnailBlob: {} }))).toEqual([]);
    expect(missingParts(entry({ type: 'movie', needsMatch: true }))).toEqual(['match']);
  });
  it('leaves quotes alone', () => {
    expect(missingParts(entry({ type: 'quote', sourceId: null, summary: '' }))).toEqual([]);
  });
});

describe('refreshTodo and markChecked', () => {
  it('skips an entry left as it was until what it is missing changes', () => {
    const e = entry({ summary: '' });
    expect(refreshTodo([e, entry({ id: 'e2' })]).map((x) => x.id)).toEqual(['e1']);
    markChecked(e);
    expect(refreshTodo([e])).toEqual([]);
    // Its cover goes missing too: offered again.
    expect(refreshTodo([{ ...e, thumbnailUrl: null }])).toHaveLength(1);
  });
});

describe('refreshFills', () => {
  it('names only what is empty', () => {
    expect(refreshFills(entry({ summary: '' }), hit())).toEqual(['Synopsis']);
    expect(refreshFills(entry(), hit())).toEqual([]);
  });
  it('adds credits only for a film not yet matched', () => {
    const film = entry({ type: 'movie', summary: '' });
    expect(refreshFills(film, hit({ type: 'movie' }))).toEqual(['Synopsis']);
    expect(refreshFills({ ...film, sourceId: null }, hit({ type: 'movie' }))).toContain(
      'Director and details'
    );
  });
});
