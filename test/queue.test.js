import { describe, it, expect } from 'vitest';
import { queueOrder, rankBetween, normalizeRanks, rankForMove, rankAtEnd, pickFromQueue } from '../src/util/queue';

const want = (id, queueRank, extra = {}) => ({ id, type: 'book', title: id, status: 'want', queueRank, dateAdded: `2026-01-0${id.length}`, ...extra });

describe('queue ordering', () => {
  it('lists only queued, non-quote entries: ranked first, then unranked by date added', () => {
    const entries = [
      want('c', null, { dateAdded: '2026-01-03' }),
      want('a', 2),
      { id: 'x', type: 'book', title: 'x', status: 'finished', queueRank: 1 },
      want('b', 1),
      want('q', 0, { type: 'quote' }),
      want('d', null, { dateAdded: '2026-01-01' })
    ];
    expect(queueOrder(entries).map((e) => e.id)).toEqual(['b', 'a', 'd', 'c']);
  });

  it('computes ranks between neighbours', () => {
    expect(rankBetween(1, 2)).toBe(1.5);
    expect(rankBetween(null, 1)).toBe(0);
    expect(rankBetween(3, null)).toBe(4);
    expect(rankBetween(null, null)).toBe(1);
  });

  it('moving an item changes only its rank, and lands it where asked', () => {
    const ordered = [want('a', 1), want('b', 2), want('c', 3), want('d', 4)];
    // Move d (index 3) to the top.
    ordered[3].queueRank = rankForMove(ordered, 3, 0);
    expect(queueOrder(ordered).map((e) => e.id)).toEqual(['d', 'a', 'b', 'c']);
    // Move a (now index 1) to the end.
    const now = queueOrder(ordered);
    now[1].queueRank = rankForMove(now, 1, 3);
    expect(queueOrder(ordered).map((e) => e.id)).toEqual(['d', 'b', 'c', 'a']);
  });

  it('assigns ranks to unranked entries and re-spaces crowded ones', () => {
    const ordered = [want('a', 1), want('b', null)];
    expect(normalizeRanks(ordered).map((e) => e.id)).toEqual(['b']);
    expect(ordered.map((e) => e.queueRank)).toEqual([1, 2]);
    const crowded = [want('a', 1), want('b', 1 + 1e-9), want('c', 3)];
    expect(normalizeRanks(crowded).map((e) => e.id)).toEqual(['b']); // c already holds rank 3
    expect(crowded.map((e) => e.queueRank)).toEqual([1, 2, 3]);
    expect(normalizeRanks([want('a', 1), want('b', 2)])).toEqual([]);
  });

  it('puts new entries at the end', () => {
    expect(rankAtEnd([want('a', 4), want('b', 7)])).toBe(8);
    expect(rankAtEnd([])).toBe(1);
  });
});

describe('pickFromQueue', () => {
  const q = [
    want('dune', 1, { pageCount: 600, genres: ['Sci-Fi'] }),
    want('hobbit', 2, { pageCount: 290, genres: ['Fantasy'] }),
    want('alien', 3, { type: 'movie', genres: ['Sci-Fi'] })
  ];
  it('respects type, length and genre filters', () => {
    expect(pickFromQueue(q, { type: 'movie' })?.id).toBe('alien');
    expect(pickFromQueue(q, { short: true })?.id).toBe('hobbit');
    expect(pickFromQueue(q, { genre: 'Fantasy' })?.id).toBe('hobbit');
    expect(pickFromQueue(q, { type: 'tv' })).toBeNull();
  });
  it('is weighted toward the top of the queue', () => {
    // weights 3,2,1 of 6: r < 0.5 → first, < 0.833 → second, else third
    expect(pickFromQueue(q, {}, () => 0.1)?.id).toBe('dune');
    expect(pickFromQueue(q, {}, () => 0.6)?.id).toBe('hobbit');
    expect(pickFromQueue(q, {}, () => 0.99)?.id).toBe('alien');
  });
  it('avoids repeating the previous pick when there is a choice', () => {
    expect(pickFromQueue(q, {}, () => 0, 'dune')?.id).toBe('hobbit');
    expect(pickFromQueue(q, { type: 'movie' }, () => 0, 'alien')?.id).toBe('alien');
  });
});
