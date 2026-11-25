// Moving films and shows added through TheTVDB over to TMDB, once, as soon as
// a TMDB key is saved. Everything the user wrote (status, rating, dates,
// notes, tags, ticked seasons) stays; only the catalog id, cover and details
// change.
//
// - A show is looked up by its TheTVDB id, which TMDB keeps for series.
//   Ticked episodes carry over by season and episode number.
// - A film is matched by title and year (TMDB can't look films up by a
//   TheTVDB id), and only when exactly one film fits.
// - Anything that can't be matched keeps its cover and details and is marked
//   `needsMatch`, for Find a match.

import { listEntries, patchEntry } from '../db/database';
import { foldText } from '../util/fold';
import { derivedTvState } from '../util/episodes';
import { fetchThumbBlob } from '../util/thumbs';
import type { CatalogEntry, Episode, SearchHit } from '../types';
import { enrichFromTmdbDetail } from './normalize';
import {
  fetchDetail,
  findShowByTvdbId,
  getEpisodeGuide,
  isTmdbConfigured,
  searchTmdb,
  tmdbNumber,
  tmdbSourceId
} from './tmdb';

export interface MoveReport {
  moved: number;
  needMatch: number;
}

/** A film or show still on a TheTVDB id, not yet tried. */
export const isLegacy = (e: CatalogEntry) =>
  (e.type === 'movie' || e.type === 'tv') && Boolean(e.sourceId) && !tmdbNumber(e.sourceId) && !e.needsMatch;

const sameTitle = (a: string | null | undefined, b: string | null | undefined) =>
  Boolean(a && b) && foldText(a!).trim() === foldText(b!).trim();

/** The one film among `hits` that is this entry, or null when none or several fit. */
export function pickFilm(entry: Pick<CatalogEntry, 'title' | 'originalTitle' | 'year'>, hits: SearchHit[]) {
  const titled = hits.filter(
    (h) =>
      sameTitle(h.title, entry.title) ||
      sameTitle(h.originalTitle, entry.title) ||
      sameTitle(h.title, entry.originalTitle) ||
      sameTitle(h.originalTitle, entry.originalTitle)
  );
  const fits = entry.year ? titled.filter((h) => h.year === entry.year) : titled;
  return fits.length === 1 ? fits[0]! : null;
}

/** Ticked episodes, by season and episode number, as ids in the new guide. */
export function carryWatched(old: Episode[], watched: number[], next: Episode[]): number[] {
  const seen = new Set(old.filter((ep) => watched.includes(ep.id)).map((ep) => `${ep.s}:${ep.e}`));
  return next.filter((ep) => seen.has(`${ep.s}:${ep.e}`)).map((ep) => ep.id);
}

const isTvdbArtwork = (url: string | null | undefined) => /(^|\.)thetvdb\.com\//.test(url ?? '');

async function moveOne(entry: CatalogEntry): Promise<boolean> {
  let tmdbId: string | null = null;
  if (entry.type === 'tv') {
    const found = await findShowByTvdbId(entry.sourceId!);
    tmdbId = found ? String(found) : null;
  } else {
    const hit = pickFilm(entry, await searchTmdb(entry.title, 'movie', entry.year));
    tmdbId = tmdbNumber(hit?.sourceId);
  }
  if (!tmdbId) {
    await patchEntry(entry.id, (d) => void (d.needsMatch = true), { touch: false });
    return false;
  }
  const sourceId = tmdbSourceId(tmdbId);
  const detail = await fetchDetail({ type: entry.type, sourceId });
  const guide = entry.type === 'tv' ? await getEpisodeGuide(sourceId) : null;
  // A TheTVDB cover gives way to TMDB's poster; one the user chose stays.
  const preview = enrichFromTmdbDetail({ ...entry, sourceId, thumbnailUrl: null }, detail);
  const newCover = isTvdbArtwork(entry.thumbnailUrl) || !entry.thumbnailUrl ? preview.thumbnailUrl : null;
  const blob = newCover ? await fetchThumbBlob(newCover) : null;

  await patchEntry(entry.id, (d) => {
    if (d.sourceId !== entry.sourceId) return false;
    const oldGuide = d.episodeGuide?.episodes ?? [];
    d.sourceId = sourceId;
    d.detailUrl = `https://www.themoviedb.org/${d.type}/${tmdbId}`;
    delete d.needsMatch;
    Object.assign(d, enrichFromTmdbDetail(d, detail));
    if (newCover) {
      d.thumbnailUrl = newCover;
      if (blob) d.thumbnailBlob = blob;
    }
    if (guide) {
      d.watchedEpisodes = carryWatched(oldGuide, d.watchedEpisodes ?? [], guide.episodes);
      d.episodeGuide = guide;
      if (d.watchedEpisodes.length) d.progress = derivedTvState(d).progress;
    }
  });
  return true;
}

let running: Promise<MoveReport> | null = null;

/**
 * Move every film and show still on a TheTVDB id. Runs once at a time; does
 * nothing without a TMDB key. A failure (offline) leaves that entry for the
 * next run.
 */
export function moveToTmdb(onProgress?: (done: number, total: number) => void): Promise<MoveReport> {
  running ??= (async () => {
    const report: MoveReport = { moved: 0, needMatch: 0 };
    if (!(await isTmdbConfigured())) return report;
    const todo = (await listEntries()).filter(isLegacy);
    for (const [i, entry] of todo.entries()) {
      try {
        if (await moveOne(entry)) report.moved++;
        else report.needMatch++;
      } catch (err) {
        console.warn('Could not move to TMDB:', entry.title, err);
        // A rejected key stops the run; anything else is tried again next time.
        if (/didn’t accept the key/.test(String(err))) break;
      }
      onProgress?.(i + 1, todo.length);
    }
    return report;
  })().finally(() => {
    running = null;
  });
  return running;
}
