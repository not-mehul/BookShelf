import { describe, it, expect } from 'vitest';
import { mergeSnapshots } from '../src/sync/merge.js';

const T = (n) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString(); // T(1) < T(2) < …
const entry = (id, n, extra = {}) => ({ id, type: 'book', title: id, updatedAt: T(n), dateAdded: T(0), ...extra });
const tomb = (id, n) => ({ id, deletedAt: T(n) });
const snap = (entries = [], tombstones = []) => ({ entries, tombstones });
const NOW = { now: new Date(Date.UTC(2026, 0, 2)) };
const ids = (list) => list.map((x) => x.id).sort();

describe('mergeSnapshots', () => {
  it('first sync: pushes local entries into an empty file', () => {
    const r = mergeSnapshots(snap([entry('a', 1)]), snap(), NOW);
    expect(ids(r.merged.entries)).toEqual(['a']);
    expect(r.toPut).toEqual([]);
    expect(r.pushNeeded).toBe(true);
  });

  it('pulls entries this device does not have', () => {
    const r = mergeSnapshots(snap(), snap([entry('b', 1)]), NOW);
    expect(ids(r.toPut)).toEqual(['b']);
    expect(r.pushNeeded).toBe(false);
  });

  it('keeps the later edit of the same entry, either way round', () => {
    const local = entry('a', 2, { title: 'local' });
    const remote = entry('a', 1, { title: 'remote' });
    let r = mergeSnapshots(snap([local]), snap([remote]), NOW);
    expect(r.merged.entries[0].title).toBe('local');
    expect(r.toPut).toEqual([]);
    expect(r.pushNeeded).toBe(true);

    r = mergeSnapshots(snap([remote]), snap([local]), NOW);
    expect(r.toPut[0].title).toBe('local');
    expect(r.pushNeeded).toBe(false);
  });

  it('is a no-op when both sides already agree', () => {
    const r = mergeSnapshots(snap([entry('a', 1)], [tomb('x', 1)]), snap([entry('a', 1)], [tomb('x', 1)]), NOW);
    expect(r.toPut).toEqual([]);
    expect(r.toDelete).toEqual([]);
    expect(r.pushNeeded).toBe(false);
  });

  it('propagates a remote deletion of an entry not edited since', () => {
    const r = mergeSnapshots(snap([entry('a', 1)]), snap([], [tomb('a', 2)]), NOW);
    expect(r.toDelete).toEqual([tomb('a', 2)]);
    expect(r.merged.entries).toEqual([]);
    expect(r.pushNeeded).toBe(false);
  });

  it('pushes a local deletion over a stale remote copy', () => {
    const r = mergeSnapshots(snap([], [tomb('a', 2)]), snap([entry('a', 1)]), NOW);
    expect(r.merged.tombstones).toEqual([tomb('a', 2)]);
    expect(r.toPut).toEqual([]);
    expect(r.pushNeeded).toBe(true);
  });

  it('an edit made after a deletion brings the entry back', () => {
    const r = mergeSnapshots(snap([], [tomb('a', 1)]), snap([entry('a', 2)]), NOW);
    expect(ids(r.toPut)).toEqual(['a']);
    expect(r.merged.tombstones).toEqual([]);
  });

  it('records remote tombstones for ids this device never had', () => {
    const r = mergeSnapshots(snap(), snap([], [tomb('z', 1)]), NOW);
    expect(r.newTombstones).toEqual([tomb('z', 1)]);
    expect(r.pushNeeded).toBe(false);
  });

  it('drops tombstones older than the retention window', () => {
    const old = { id: 'gone', deletedAt: '2020-01-01T00:00:00.000Z' };
    const r = mergeSnapshots(snap(), snap([], [old]), NOW);
    expect(r.merged.tombstones).toEqual([]);
    expect(r.newTombstones).toEqual([]);
    expect(r.pushNeeded).toBe(true); // rewrite the file without it
  });

  it('treats entries without updatedAt (pre-sync data) by their dateAdded', () => {
    const legacy = { id: 'a', type: 'book', title: 'old', dateAdded: T(1) };
    const r = mergeSnapshots(snap([legacy]), snap([entry('a', 2, { title: 'new' })]), NOW);
    expect(r.toPut[0].title).toBe('new');
  });
});
