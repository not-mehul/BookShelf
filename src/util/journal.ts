// The reading journal: when something was started and finished.
//
// `dateStarted` is the latest start. `finishes` lists every completion, oldest
// first, so a re-read or a rewatch counts in the year it happened, and an
// entry finished three times says so. Both are stamped by status changes
// (applyStatus, newEntry) and can be corrected by hand on the detail view.

import type { CatalogEntry, EntryStatus, EntryType } from '../types';

/** Leaving "finished" this soon after finishing is a correction, not a second start. */
const CORRECTION_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Stamp journal dates for a status change. Mutates `entry`; does not save.
 * Call before `entry.status` changes (it reads the old status from `from`).
 */
export function stampStatusDates(
  entry: CatalogEntry,
  from: EntryStatus | null | undefined,
  to: EntryStatus | null | undefined,
  now: Date = new Date()
): void {
  if (from === to) return;
  const iso = now.toISOString();
  const finishes = [...(entry.finishes || [])];

  // Un-finishing straight after finishing undoes that finish (a mis-tap, or a
  // progress number typed past the end and corrected).
  if (from === 'finished') {
    const last = finishes.at(-1);
    if (last && now.getTime() - Date.parse(last) < CORRECTION_MS) finishes.pop();
  }
  if (to === 'in-progress') entry.dateStarted = iso;
  if (to === 'finished') finishes.push(iso);
  entry.finishes = finishes;
}

/** The most recent completion, if any. */
export function lastFinish(entry: CatalogEntry): string | null {
  return entry.finishes?.at(-1) ?? null;
}

/** A local calendar day, YYYY-MM-DD, for date inputs. */
export function toDay(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** YYYY-MM-DD from a date input → an ISO time at local noon (safe from time-zone edges). */
export function fromDay(day: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).toISOString();
}

/** Whole calendar days between two times (0 = the same day). */
export function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso);
  const b = new Date(toIso);
  const start = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const end = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((end - start) / DAY_MS);
}

/** Days from the latest start to the finish after it, or null. */
export function daysToFinish(entry: CatalogEntry): number | null {
  const start = entry.dateStarted;
  if (!start) return null;
  const finish = (entry.finishes || []).find((f) => f >= start);
  if (!finish) return null;
  return daysBetween(start, finish);
}

/** "the same day", "1 day", "15 days". */
export function durationLabel(days: number): string {
  if (days <= 0) return 'the same day';
  return days === 1 ? '1 day' : `${days} days`;
}

/** "3 Mar 2026", in the reader's locale. */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "Read again", "Watch again". */
export function againLabel(type: EntryType): string {
  return type === 'book' ? 'Read again' : 'Watch again';
}

/** "Read twice", "Watched 3 times". Empty for one finish or none. */
export function timesLabel(type: EntryType, n: number): string {
  if (n < 2) return '';
  const verb = type === 'book' ? 'Read' : 'Watched';
  return n === 2 ? `${verb} twice` : `${verb} ${n} times`;
}

/**
 * Reading pace from the latest start: pages (or episodes) a day, and the day
 * it would end at that pace. Null until there is a day and a page to go on.
 */
export function pace(
  entry: CatalogEntry,
  now: Date = new Date()
): { perDay: number; eta: Date; daysLeft: number } | null {
  const p = entry.progress;
  if (!entry.dateStarted || entry.status !== 'in-progress' || !p || p.current <= 0 || p.total <= p.current)
    return null;
  const days = daysBetween(entry.dateStarted, now.toISOString());
  if (days < 1) return null;
  const perDay = p.current / days;
  const daysLeft = Math.ceil((p.total - p.current) / perDay);
  const eta = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysLeft, 12);
  return { perDay, eta, daysLeft };
}
