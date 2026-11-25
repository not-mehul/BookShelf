// Field-level merging: each group of fields comes from the copy that changed
// it last, so edits on two devices both survive.
import { describe, it, expect } from 'vitest';
import { fieldTime, mergeEntry, stampFields } from '../src/sync/fields';

const T = (n) => `2026-01-01T00:00:0${n}.000Z`;
const base = {
  id: 'a',
  type: 'book',
  title: 'Dune',
  rating: null,
  tags: [],
  notes: '',
  status: null,
  updatedAt: T(0)
};

describe('stamping', () => {
  it('records the groups an edit changed, from a base for the rest', () => {
    const after = { ...base, rating: 4, dateRated: T(1) };
    stampFields(base, after, T(1));
    expect(after.fieldTimes).toEqual({ _base: T(0), rating: T(1) });
    expect(fieldTime(after, 'tags')).toBe(T(0));
    expect(fieldTime(after, 'rating')).toBe(T(1));
  });

  it('treats a status change and its journal dates as one change', () => {
    const after = { ...base, status: 'finished', finishes: [T(2)] };
    stampFields(base, after, T(2));
    expect(Object.keys(after.fieldTimes).sort()).toEqual(['_base', 'journal']);
  });
});

describe('merging two copies', () => {
  it('keeps a rating from one device and a tag from the other', () => {
    const phone = { ...base, rating: 4, updatedAt: T(1) };
    stampFields(base, phone, T(1));
    const tablet = { ...base, tags: ['sci-fi'], updatedAt: T(2) };
    stampFields(base, tablet, T(2));
    const merged = mergeEntry(phone, tablet);
    expect(merged).toMatchObject({ rating: 4, tags: ['sci-fi'], updatedAt: T(2) });
    expect(mergeEntry(tablet, phone)).toMatchObject({ rating: 4, tags: ['sci-fi'] });
  });

  it('takes the later edit of the same field, and the newer episode guide', () => {
    const a = { ...base, notes: 'first', updatedAt: T(1), episodeGuide: { fetchedAt: T(5), episodes: [] } };
    stampFields(base, a, T(1));
    const b = { ...base, notes: 'second', updatedAt: T(3), episodeGuide: { fetchedAt: T(4), episodes: [] } };
    stampFields(base, b, T(3));
    const merged = mergeEntry(a, b);
    expect(merged.notes).toBe('second');
    expect(merged.episodeGuide.fetchedAt).toBe(T(5));
  });

  it('falls back to whole-entry times for copies without field times', () => {
    const older = { ...base, notes: 'old', updatedAt: T(1) };
    const newer = { ...base, notes: 'new', rating: 2, updatedAt: T(2) };
    expect(mergeEntry(older, newer)).toMatchObject({ notes: 'new', rating: 2 });
  });
});
