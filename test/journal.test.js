import { describe, it, expect } from 'vitest';
import {
  stampStatusDates,
  daysToFinish,
  daysBetween,
  fromDay,
  toDay,
  pace,
  timesLabel
} from '../src/util/journal';
import { newEntry } from '../src/util/new-entry';

const at = (s) => new Date(s);
const book = (fields = {}) => newEntry('book', { title: 'Middlemarch', ...fields });

describe('reading journal', () => {
  it('stamps a start and a finish', () => {
    const e = book();
    stampStatusDates(e, null, 'in-progress', at('2026-03-03T09:00:00Z'));
    e.status = 'in-progress';
    stampStatusDates(e, 'in-progress', 'finished', at('2026-03-18T21:00:00Z'));
    expect(e.dateStarted).toBe('2026-03-03T09:00:00.000Z');
    expect(e.finishes).toEqual(['2026-03-18T21:00:00.000Z']);
    expect(daysToFinish(e)).toBe(daysBetween(e.dateStarted, e.finishes[0]));
  });

  it('treats un-finishing within a day as a correction', () => {
    const e = book({ finishes: ['2026-03-18T21:00:00.000Z'], status: 'finished' });
    stampStatusDates(e, 'finished', 'in-progress', at('2026-03-19T08:00:00Z'));
    expect(e.finishes).toEqual([]);
  });

  it('keeps an older finish when starting again (a re-read)', () => {
    const e = book({ finishes: ['2025-01-10T12:00:00.000Z'], status: 'finished' });
    stampStatusDates(e, 'finished', 'in-progress', at('2026-02-01T12:00:00Z'));
    stampStatusDates(e, 'in-progress', 'finished', at('2026-02-20T12:00:00Z'));
    expect(e.finishes).toHaveLength(2);
    expect(timesLabel('book', 2)).toBe('Read twice');
    expect(timesLabel('movie', 3)).toBe('Watched 3 times');
    expect(timesLabel('book', 1)).toBe('');
  });

  it('does nothing when the status stays the same', () => {
    const e = book({ status: 'finished', finishes: ['2026-01-01T12:00:00.000Z'] });
    stampStatusDates(e, 'finished', 'finished');
    expect(e.finishes).toHaveLength(1);
  });

  it('starts the journal for entries added already started or finished', () => {
    expect(book({ status: 'in-progress' }).dateStarted).toBeTruthy();
    expect(book({ status: 'finished' }).finishes).toHaveLength(1);
    expect(book().dateStarted).toBeUndefined();
  });

  it('round-trips calendar days at local noon', () => {
    const iso = fromDay('2026-03-18');
    expect(toDay(iso)).toBe('2026-03-18');
    expect(new Date(iso).getHours()).toBe(12);
    expect(fromDay('nope')).toBeNull();
  });

  it('forecasts an end date from the pace so far', () => {
    const e = book({
      status: 'in-progress',
      dateStarted: fromDay('2026-03-01'),
      progress: { current: 100, total: 300 }
    });
    const p = pace(e, new Date(2026, 2, 11, 12));
    expect(p.perDay).toBe(10);
    expect(p.daysLeft).toBe(20);
    expect(toDay(p.eta.toISOString())).toBe('2026-03-31');
    expect(pace({ ...e, progress: { current: 0, total: 300 } })).toBeNull();
  });
});
