// Keeping TV episode guides fresh, and handing reminders to the Android app.

import { listEntries, patchEntry } from '../db/database';
import { getEpisodeGuide, isTvdbConfigured } from './tvdb';
import { guideIsStale, derivedTvState, reminderItems } from '../util/episodes';
import { isNativeShell, callNative } from '../platform/native';
import type { CatalogEntry } from '../types';

/**
 * Fetch (or re-fetch) one show's guide and update its derived progress.
 * Saved without bumping updatedAt: it's reference data, not a user edit, so it
 * never wins a sync conflict against someone ticking episodes elsewhere.
 * Only the guide and progress are written, onto the stored copy, so an edit
 * made while the guide was downloading is kept.
 * @returns The entry as now stored (or as given, if it has left the shelf).
 */
export async function loadEpisodeGuide(entry: CatalogEntry): Promise<CatalogEntry> {
  if (entry.type !== 'tv' || !entry.sourceId) return entry;
  const guide = await getEpisodeGuide(entry.sourceId);
  const saved = await patchEntry(
    entry.id,
    (d) => {
      d.episodeGuide = guide;
      if (d.watchedEpisodes?.length) d.progress = derivedTvState(d).progress;
    },
    { touch: false }
  );
  return saved ?? entry;
}

/**
 * Refresh stale guides for shows being followed (in progress or with
 * reminders on). Quietly skips when TheTVDB isn't set up or a fetch fails.
 * @param [onUpdated] Called once if anything changed.
 */
export async function refreshFollowedGuides(onUpdated?: () => void) {
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
 */
export async function pushEpisodeReminders(entries: CatalogEntry[]) {
  if (!isNativeShell()) return;
  try {
    await callNative('episodeReminders', { items: reminderItems(entries) });
  } catch (err) {
    console.warn('Episode reminders update failed:', err);
  }
}
