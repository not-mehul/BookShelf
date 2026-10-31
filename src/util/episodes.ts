// TV episode tracking: progress, "next up", season grouping and reminders.
// Specials (season 0) are listed but never count toward progress.

import type { CatalogEntry, Episode } from '../types';

/** Today's date as YYYY-MM-DD in local time. */
export function localDate(d: Date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const byOrder = (a: Episode, b: Episode) => a.s - b.s || a.e - b.e;

/** Regular (non-special) episodes, in order. @param entry */
export function regularEpisodes(entry: CatalogEntry) {
  return (entry.episodeGuide?.episodes || []).filter((ep) => ep.s > 0).sort(byOrder);
}

export const hasAired = (ep: Episode, today: string) => Boolean(ep.aired && ep.aired <= today);

/**
 * @param [today] YYYY-MM-DD
 */
export function episodeProgress(entry: CatalogEntry, today: string = localDate()) {
  const watched = new Set(entry.watchedEpisodes || []);
  const regular = regularEpisodes(entry);
  const aired = regular.filter((ep) => hasAired(ep, today));
  const watchedCount = regular.filter((ep) => watched.has(ep.id)).length;
  const next = aired.find((ep) => !watched.has(ep.id)) || null;
  const upcoming = regular.find((ep) => ep.aired && ep.aired > today) || null;
  return {
    watched: watchedCount,
    aired: aired.length,
    total: regular.length,
    next,
    upcoming,
    caughtUp: aired.length > 0 && !next
  };
}

/**
 * Episodes grouped by season (specials last).
 */
export function seasons(entry: CatalogEntry): { season: number; episodes: Episode[] }[] {
  const map: Map<number, Episode[]> = new Map();
  for (const ep of [...(entry.episodeGuide?.episodes || [])].sort(byOrder)) {
    if (!map.has(ep.s)) map.set(ep.s, []);
    (map.get(ep.s) as Episode[]).push(ep);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === 0 ? 1 : b === 0 ? -1 : a - b))
    .map(([season, episodes]) => ({ season, episodes }));
}

/**
 * Set episodes watched or unwatched. Returns the new watched list.
 */
export function setWatched(entry: CatalogEntry, ids: number[], watched: boolean) {
  const set = new Set(entry.watchedEpisodes || []);
  for (const id of ids) {
    if (watched) set.add(id);
    else set.delete(id);
  }
  entry.watchedEpisodes = [...set];
  return entry.watchedEpisodes;
}

/**
 * Progress + status implied by the watched episodes. Status only moves
 * forward automatically: Completed once every aired episode of an ended show
 * is watched; Progressing once anything is watched.
 */
export function derivedTvState(
  entry: CatalogEntry,
  today: string = localDate()
): { progress: { current: number; total: number }; status: 'finished' | 'in-progress' | null } {
  const p = episodeProgress(entry, today);
  const ended = /ended/i.test(entry.episodeGuide?.status || '');
  let status: 'finished' | 'in-progress' | null = null;
  if (p.caughtUp && ended && !p.upcoming) status = 'finished';
  else if (p.watched > 0) status = 'in-progress';
  return { progress: { current: p.watched, total: p.aired }, status };
}

/** "S2 E3" @param ep */
export const episodeCode = (ep: Episode) => (ep.s === 0 ? `Special ${ep.e}` : `S${ep.s} E${ep.e}`);

/**
 * Upcoming / just-aired episodes of shows with reminders on, for the native
 * scheduler (window: 2 days back … `days` ahead).
 */
export function reminderItems(entries: CatalogEntry[], today: string = localDate(), days: number = 60) {
  const from = shiftDate(today, -2);
  const to = shiftDate(today, days);
  const items = [];
  for (const entry of entries) {
    if (entry.type !== 'tv' || !entry.remindNewEpisodes) continue;
    for (const ep of regularEpisodes(entry)) {
      if (ep.aired && ep.aired >= from && ep.aired <= to) {
        items.push({
          entryId: entry.id,
          show: entry.title,
          code: episodeCode(ep),
          name: ep.name,
          aired: ep.aired,
          episodeId: ep.id
        });
      }
    }
  }
  return items.sort((a, b) => a.aired.localeCompare(b.aired));
}

/**
 * Whether a guide should be re-fetched: never fetched, or older than
 * `maxAgeDays` for a show that is still airing.
 */
export function guideIsStale(entry: CatalogEntry, now: Date = new Date(), maxAgeDays: number = 3) {
  const guide = entry.episodeGuide;
  if (!guide) return true;
  if (/ended/i.test(guide.status || '')) return false;
  return now.getTime() - Date.parse(guide.fetchedAt) > maxAgeDays * 86_400_000;
}

function shiftDate(ymd: string, days: number) {
  const [y, m, d] = ymd.split('-').map(Number);
  return localDate(new Date(y!, m! - 1, d! + days));
}
