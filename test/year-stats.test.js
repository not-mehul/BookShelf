import { describe, it, expect } from 'vitest';
import {
  finishesIn,
  journalYears,
  monthly,
  highlights,
  medianDays,
  topCreators,
  decades,
  undatedFinished
} from '../src/util/year-stats';
import { fromDay } from '../src/util/journal';
import { dailyIndex } from '../src/util/daily';
import { newEntry } from '../src/util/new-entry';

const finished = (type, title, days, fields = {}) =>
  newEntry(type, { title, status: 'finished', finishes: days.map(fromDay), ...fields });

const shelf = [
  finished('book', 'Long', ['2026-01-20'], {
    pageCount: 900,
    dateStarted: fromDay('2026-01-01'),
    creators: ['A']
  }),
  finished('book', 'Short', ['2026-03-05'], {
    pageCount: 120,
    dateStarted: fromDay('2026-03-02'),
    creators: ['A'],
    rating: 4
  }),
  finished('movie', 'Film', ['2026-03-09'], { rating: 5, year: 1994 }),
  finished('book', 'Again', ['2025-06-01', '2026-07-01'], { year: 2001, creators: ['B'] }),
  newEntry('book', { title: 'Old', status: 'finished' }),
  newEntry('quote', { title: 'q', quoteText: 'q' })
];
// newEntry stamps "today" for finished entries with no dates: clear the one meant to be undated.
shelf[4].finishes = [];

describe('year in review', () => {
  it('counts each finish in its own year', () => {
    expect(finishesIn(shelf, 2026)).toHaveLength(4);
    expect(finishesIn(shelf, 2025).map((f) => f.entry.title)).toEqual(['Again']);
    expect(journalYears(shelf, 2026)).toEqual([2026, 2025]);
    expect(undatedFinished(shelf).map((e) => e.title)).toEqual(['Old']);
  });

  it('splits months by type', () => {
    const m = monthly(finishesIn(shelf, 2026));
    expect(m[0]).toEqual({ book: 1, movie: 0, tv: 0 });
    expect(m[2]).toEqual({ book: 1, movie: 1, tv: 0 });
  });

  it('picks highlights without repeating an entry', () => {
    const h = highlights(finishesIn(shelf, 2026));
    expect(h.map((x) => [x.label, x.entry.title])).toEqual([
      ['Longest book', 'Long'],
      ['Quickest read', 'Short'],
      ['Rated highest', 'Film']
    ]);
    expect(medianDays(finishesIn(shelf, 2026))).toBe(11);
  });

  it('lists creators seen more than once and decades', () => {
    expect(topCreators(shelf)).toEqual([['A', 2]]);
    expect(decades(shelf)).toEqual([
      ['1990s', 1],
      ['2000s', 1]
    ]);
  });

  it('picks the same quote all day', () => {
    expect(dailyIndex('2026-11-05', 7)).toBe(dailyIndex('2026-11-05', 7));
    expect(dailyIndex('2026-11-05', 7)).toBeLessThan(7);
    expect(dailyIndex('x', 0)).toBe(0);
  });
});

describe('year in review wording', () => {
  it('shows the highest rating on the chosen scale', async () => {
    const { setRatingScale } = await import('../src/util/stars');
    const e = { id: 'a', type: 'movie', title: 'A', rating: 3.75, finishes: ['2025-05-01T12:00:00.000Z'] };
    const detail = () =>
      highlights([{ entry: e, at: e.finishes[0] }]).find((h) => h.label === 'Rated highest').detail;
    setRatingScale(10);
    expect(detail()).toBe('7.5/10');
    setRatingScale(5);
    expect(detail()).toBe('3.75/5');
  });
});

describe('hours watched', () => {
  it('adds finished films once per finish and ticked episodes', async () => {
    const { hoursWatched } = await import('../src/util/year-stats');
    const film = { type: 'movie', status: 'finished', runtime: 120, finishes: ['2025-01-01', '2026-01-01'] };
    const unwatched = { type: 'movie', status: 'want', runtime: 600 };
    const show = {
      type: 'tv',
      watchedEpisodes: [1, 2],
      episodeGuide: {
        episodes: [
          { id: 1, runtime: 60 },
          { id: 2, runtime: 60 },
          { id: 3, runtime: 60 }
        ]
      }
    };
    expect(hoursWatched([film, unwatched, show])).toBe(6);
  });
});
