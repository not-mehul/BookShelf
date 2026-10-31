// TV episode tracking: progress, "next up", season grouping and reminders.
// Specials (season 0) are listed but never count toward progress.

/** @typedef {import('../types').CatalogEntry} CatalogEntry */
/** @typedef {import('../types').Episode} Episode */

/** Today's date as YYYY-MM-DD in local time. */
export function localDate(/** @type {Date} */ d = new Date()) {
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** @param {Episode} a @param {Episode} b */
const byOrder = (a, b) => a.s - b.s || a.e - b.e;

/** Regular (non-special) episodes, in order. @param {CatalogEntry} entry */
export function regularEpisodes(entry) {
  return (entry.episodeGuide?.episodes || []).filter((ep) => ep.s > 0).sort(byOrder);
}

/** @param {Episode} ep @param {string} today */
export const hasAired = (ep, today) => Boolean(ep.aired && ep.aired <= today);

/**
 * @param {CatalogEntry} entry
 * @param {string} [today] YYYY-MM-DD
 */
export function episodeProgress(entry, today = localDate()) {
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
 * @param {CatalogEntry} entry
 * @returns {{ season: number, episodes: Episode[] }[]}
 */
export function seasons(entry) {
  /** @type {Map<number, Episode[]>} */
  const map = new Map();
  for (const ep of [...(entry.episodeGuide?.episodes || [])].sort(byOrder)) {
    if (!map.has(ep.s)) map.set(ep.s, []);
    /** @type {Episode[]} */ (map.get(ep.s)).push(ep);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === 0 ? 1 : b === 0 ? -1 : a - b))
    .map(([season, episodes]) => ({ season, episodes }));
}

/**
 * Set episodes watched or unwatched. Returns the new watched list.
 * @param {CatalogEntry} entry
 * @param {number[]} ids
 * @param {boolean} watched
 */
export function setWatched(entry, ids, watched) {
  const set = new Set(entry.watchedEpisodes || []);
  for (const id of ids) watched ? set.add(id) : set.delete(id);
  entry.watchedEpisodes = [...set];
  return entry.watchedEpisodes;
}

/**
 * Progress + status implied by the watched episodes. Status only moves
 * forward automatically: Completed once every aired episode of an ended show
 * is watched; Progressing once anything is watched.
 * @param {CatalogEntry} entry
 * @param {string} [today]
 * @returns {{ progress: { current: number, total: number }, status: 'finished' | 'in-progress' | null }}
 */
export function derivedTvState(entry, today = localDate()) {
  const p = episodeProgress(entry, today);
  const ended = /ended/i.test(entry.episodeGuide?.status || '');
  /** @type {'finished' | 'in-progress' | null} */
  let status = null;
  if (p.caughtUp && ended && !p.upcoming) status = 'finished';
  else if (p.watched > 0) status = 'in-progress';
  return { progress: { current: p.watched, total: p.aired }, status };
}

/** "S2 E3" @param {Episode} ep */
export const episodeCode = (ep) => (ep.s === 0 ? `Special ${ep.e}` : `S${ep.s} E${ep.e}`);

/**
 * Upcoming / just-aired episodes of shows with reminders on, for the native
 * scheduler (window: 2 days back … `days` ahead).
 * @param {CatalogEntry[]} entries
 * @param {string} [today]
 * @param {number} [days]
 */
export function reminderItems(entries, today = localDate(), days = 60) {
  const from = shiftDate(today, -2);
  const to = shiftDate(today, days);
  const items = [];
  for (const entry of entries) {
    if (entry.type !== 'tv' || !entry.remindNewEpisodes) continue;
    for (const ep of regularEpisodes(entry)) {
      if (ep.aired && ep.aired >= from && ep.aired <= to) {
        items.push({ entryId: entry.id, show: entry.title, code: episodeCode(ep), name: ep.name, aired: ep.aired, episodeId: ep.id });
      }
    }
  }
  return items.sort((a, b) => a.aired.localeCompare(b.aired));
}

/**
 * Whether a guide should be re-fetched: never fetched, or older than
 * `maxAgeDays` for a show that is still airing.
 * @param {CatalogEntry} entry
 * @param {Date} [now]
 * @param {number} [maxAgeDays]
 */
export function guideIsStale(entry, now = new Date(), maxAgeDays = 3) {
  const guide = entry.episodeGuide;
  if (!guide) return true;
  if (/ended/i.test(guide.status || '')) return false;
  return now.getTime() - Date.parse(guide.fetchedAt) > maxAgeDays * 86_400_000;
}

/** @param {string} ymd @param {number} days */
function shiftDate(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  return localDate(new Date(y, m - 1, d + days));
}
