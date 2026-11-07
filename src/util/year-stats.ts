// Year in review: what was finished when, how the year's goal is going, and
// the all-time lists (creators, decades) on the Statistics screen. Pure.

import { daysToFinish } from './journal';
import type { CatalogEntry } from '../types';

export type FinishedType = 'book' | 'movie' | 'tv';
export const FINISHED_TYPES: FinishedType[] = ['book', 'movie', 'tv'];

export interface Finish {
  entry: CatalogEntry;
  /** ISO time of this completion. */
  at: string;
}

const isFinishedType = (e: CatalogEntry): e is CatalogEntry & { type: FinishedType } =>
  e.type === 'book' || e.type === 'movie' || e.type === 'tv';

/** Every completion, one per finish (a re-read counts again), oldest first. */
export function allFinishes(entries: CatalogEntry[]): Finish[] {
  const out: Finish[] = [];
  for (const e of entries) {
    if (!isFinishedType(e)) continue;
    for (const at of e.finishes || []) out.push({ entry: e, at });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/** Completions in a calendar year (local time). */
export function finishesIn(entries: CatalogEntry[], year: number): Finish[] {
  return allFinishes(entries).filter((f) => new Date(f.at).getFullYear() === year);
}

/** Years with at least one completion, newest first, always including `current`. */
export function journalYears(entries: CatalogEntry[], current: number): number[] {
  const years = new Set([current]);
  for (const f of allFinishes(entries)) years.add(new Date(f.at).getFullYear());
  return [...years].sort((a, b) => b - a);
}

/** Entries marked finished that carry no finish date (finished before dates were kept). */
export function undatedFinished(entries: CatalogEntry[]): CatalogEntry[] {
  return entries.filter((e) => isFinishedType(e) && e.status === 'finished' && !e.finishes?.length);
}

/** Twelve months of completions, split by type. */
export function monthly(finishes: Finish[]): Record<FinishedType, number>[] {
  const months = Array.from({ length: 12 }, () => ({ book: 0, movie: 0, tv: 0 }));
  for (const f of finishes) {
    const type = f.entry.type;
    if (type === 'quote') continue;
    months[new Date(f.at).getMonth()]![type]++;
  }
  return months;
}

/** Pages in a finished book: its page count, or the total its progress ran to. */
export function bookPages(e: CatalogEntry): number {
  return e.pageCount || e.progress?.total || 0;
}

export interface Pace {
  /** Books finished so far. */
  done: number;
  goal: number;
  /** Where an even pace would be by now. */
  expected: number;
  /** done − expected, rounded: positive is ahead. */
  delta: number;
  /** The year is over (or not this year): the pace no longer moves. */
  closed: boolean;
}

/**
 * Progress towards a yearly goal. For the current year the expected count is
 * the goal spread evenly over the days so far; for any other year it is the goal.
 */
export function goalPace(done: number, goal: number, year: number, now: Date = new Date()): Pace {
  const closed = year !== now.getFullYear();
  let expected = goal;
  if (!closed) {
    const start = new Date(year, 0, 1).getTime();
    const end = new Date(year + 1, 0, 1).getTime();
    expected = (goal * (now.getTime() - start)) / (end - start);
  }
  return { done, goal, expected, delta: Math.round(done - expected), closed };
}

/** One plain sentence about a goal's pace, in the house voice. */
export function paceSentence(p: Pace, now: Date = new Date()): string {
  if (p.goal <= 0) return '';
  if (p.done >= p.goal) {
    const over = p.done - p.goal;
    return over ? `Goal met, and ${over} past it.` : 'Goal met.';
  }
  const left = p.goal - p.done;
  if (p.closed) return `${left} short of the goal.`;
  const daysLeft = Math.max(
    1,
    Math.ceil((new Date(now.getFullYear() + 1, 0, 1).getTime() - now.getTime()) / 86_400_000)
  );
  const every = Math.max(1, Math.floor(daysLeft / left));
  const cadence = every === 1 ? 'about one a day' : `about one every ${every} days`;
  if (p.delta > 0) return `${p.delta} ahead of pace. ${left} to go.`;
  if (p.delta < 0) return `${-p.delta} behind pace; ${cadence} would catch up.`;
  return `On pace; ${cadence} keeps it there.`;
}

export interface Highlight {
  label: string;
  entry: CatalogEntry;
  detail: string;
}

/** A few noteworthy finishes of a year: the longest book, the quickest read, the best rated. */
export function highlights(finishes: Finish[]): Highlight[] {
  const out: Highlight[] = [];
  const unique = [...new Map(finishes.map((f) => [f.entry.id, f.entry])).values()];
  const books = unique.filter((e) => e.type === 'book');

  const longest = books.filter((e) => bookPages(e) > 0).sort((a, b) => bookPages(b) - bookPages(a))[0];
  if (longest) out.push({ label: 'Longest book', entry: longest, detail: `${bookPages(longest)} pages` });

  const quickest = books
    .map((e) => ({ e, d: daysToFinish(e) }))
    .filter((x): x is { e: CatalogEntry; d: number } => x.d != null && x.e !== longest)
    .sort((a, b) => a.d - b.d)[0];
  if (quickest)
    out.push({
      label: 'Quickest read',
      entry: quickest.e,
      detail: quickest.d <= 0 ? 'in a day' : `in ${quickest.d === 1 ? '1 day' : `${quickest.d} days`}`
    });

  const best = unique
    .filter((e) => e.rating != null && !out.some((h) => h.entry === e))
    .sort(
      (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.dateRated || '').localeCompare(a.dateRated || '')
    )[0];
  if (best) out.push({ label: 'Rated highest', entry: best, detail: `${best.rating}/5` });

  return out;
}

/** Median days from start to finish across books with both dates. */
export function medianDays(finishes: Finish[]): number | null {
  const days = [...new Set(finishes.map((f) => f.entry))]
    .filter((e) => e.type === 'book')
    .map(daysToFinish)
    .filter((d): d is number => d != null)
    .sort((a, b) => a - b);
  if (!days.length) return null;
  const mid = Math.floor(days.length / 2);
  return days.length % 2 ? days[mid]! : Math.round((days[mid - 1]! + days[mid]!) / 2);
}

/** Most frequent creators (authors, directors) among the given entries. */
export function topCreators(entries: CatalogEntry[], limit = 5): [string, number][] {
  const counts = new Map<string, number>();
  for (const e of entries) {
    if (e.type === 'quote') continue;
    for (const c of new Set(e.creators || [])) {
      const name = c.trim();
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

/** Entries per decade of release, oldest first ("1990s"). */
export function decades(entries: CatalogEntry[]): [string, number][] {
  const counts = new Map<number, number>();
  for (const e of entries) {
    if (e.type === 'quote' || !e.year || e.year < 1000) continue;
    const d = Math.floor(e.year / 10) * 10;
    counts.set(d, (counts.get(d) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([d, n]) => [`${d}s`, n]);
}
