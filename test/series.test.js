import { describe, it, expect } from 'vitest';
import { parseSeriesFromTitle, seriesKey, seriesEntries, nextInSeries } from '../src/util/series';

describe('parseSeriesFromTitle', () => {
  it.each([
    ["Abaddon's Gate (The Expanse, #3)", 'The Expanse', 3],
    ['Guards! Guards! (Discworld #8)', 'Discworld', 8],
    ['Foundation and Empire (Foundation, Book 2)', 'Foundation', 2],
    ['The Shadow Rising: Book Four of The Wheel of Time', null, null],
    ['The Great Hunt: Book 2 of the Wheel of Time', 'Wheel of Time', 2],
    ['Children of Time: Children of Time, Book 1', 'Children of Time', 1],
    ['Edgedancer (The Stormlight Archive, #2.5)', 'The Stormlight Archive', 2.5]
  ])('%s', (title, name, position) => {
    const s = parseSeriesFromTitle(title);
    if (name === null) expect(s).toBeNull();
    else expect(s).toEqual({ name, position });
  });

  it('leaves ordinary titles alone', () => {
    for (const t of ['Dune', '1984', 'Catch-22', 'Blade Runner 2049', 'Apollo 13']) {
      expect(parseSeriesFromTitle(t), t).toBeNull();
    }
  });
});

describe('series ordering', () => {
  const e = (id, title, position, extra = {}) => ({ id, type: 'book', title, series: { name: 'The Expanse', position }, year: 2011, ...extra });
  const shelf = [
    e('3', "Abaddon's Gate", 3),
    e('1', 'Leviathan Wakes', 1),
    e('n', 'Memory\'s Legion', null),
    e('5', 'Nemesis Games', 5),
    { id: 'x', type: 'book', title: 'Dune', series: { name: 'Dune', position: 1 } }
  ];

  it('normalizes names for comparison', () => {
    expect(seriesKey('The Expanse')).toBe(seriesKey('expanse'));
  });

  it('orders a series by position, unnumbered last', () => {
    expect(seriesEntries(shelf, 'expanse').map((x) => x.id)).toEqual(['1', '3', '5', 'n']);
  });

  it('finds the next entry, the next position and the gaps', () => {
    const r = nextInSeries(shelf, shelf[1]); // #1
    expect(r.next?.id).toBe('3');
    expect(r.nextPosition).toBe(2);
    expect(r.onShelf).toBe(false);
    expect(r.missing).toEqual([2, 4]);
    const last = nextInSeries(shelf, shelf[3]); // #5
    expect(last.next).toBeNull();
    expect(last.nextPosition).toBe(6);
  });
});
