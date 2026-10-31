// Keeping TV episode guides fresh, and handing reminders to the Android app.

import { listEntries, saveEntry } from '../db/database.js';
import { getEpisodeGuide, isTvdbConfigured } from './tvdb.js';
import { guideIsStale, derivedTvState, reminderItems } from '../util/episodes.js';
import { isNativeShell, callNative } from '../platform/native.js';

/** @typedef {import('../types').CatalogEntry} CatalogEntry */

/**
 * Fetch (or re-fetch) one show's guide and update its derived progress.
 * Saved without bumping updatedAt: it's reference data, not a user edit, so it
 * never wins a sync conflict against someone ticking episodes elsewhere.
 * @param {CatalogEntry} entry
 */
export async function loadEpisodeGuide(entry) {
  if (entry.type !== 'tv' || !entry.sourceId) return entry;
  entry.episodeGuide = await getEpisodeGuide(entry.sourceId);
  if (entry.watchedEpisodes?.length) entry.progress = derivedTvState(entry).progress;
  await saveEntry(entry, { touch: false });
  return entry;
}

/**
 * Refresh stale guides for shows being followed (in progress or with
 * reminders on). Quietly skips when TheTVDB isn't set up or a fetch fails.
 * @param {() => void} [onUpdated] Called once if anything changed.
 */
export async function refreshFollowedGuides(onUpdated) {
  if (!(await isTvdbConfigured())) return;
  let changed = false;
  for (const entry of await listEntries()) {
    const followed = entry.status === 'in-progress' || entry.remindNewEpisodes;
    if (entry.type !== 'tv' || !entry.sourceId || !followed || !guideIsStale(entry)) continue;
    try {
      await loadEpisodeGuide(entry);
      changed = true;
    } catch (err) {
      console.warn('Episode guide refresh failed:', entry.title, err);
    }
  }
  if (changed) onUpdated?.();
}

/**
 * Give the Android app the upcoming episodes it should notify about.
 * @param {CatalogEntry[]} entries
 */
export async function pushEpisodeReminders(entries) {
  if (!isNativeShell()) return;
  try {
    await callNative('episodeReminders', { items: reminderItems(entries) });
  } catch (err) {
    console.warn('Episode reminders update failed:', err);
  }
}
