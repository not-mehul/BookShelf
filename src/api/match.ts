// Find a match: linking an entry that came from outside search (an import, the
// manual form, a film TheTVDB→TMDB couldn't place) to the catalog, for its
// cover and details. Only catalog fields are filled in, and only where empty;
// the user's title, status, rating, dates, notes and tags are never touched.

import { patchEntry } from '../db/database';
import { foldText } from '../util/fold';
import { fetchThumbBlob } from '../util/thumbs';
import type { CatalogEntry, SearchHit } from '../types';
import { searchAllBooks } from './books';
import { carryWatched, pickFilm } from './tmdb-move';
import { getEpisodeGuide, searchTmdb } from './tmdb';

/** An entry with no catalog record behind it: no id, or a TheTVDB one TMDB couldn't place. */
export const lacksMatch = (e: CatalogEntry) => e.type !== 'quote' && (!e.sourceId || Boolean(e.needsMatch));

/** What a search for this entry starts from: the ISBN, else the title (and author, for a book). */
export function defaultQuery(e: CatalogEntry): string {
  if (e.type === 'book') return e.isbn || [e.title, e.creators?.[0]].filter(Boolean).join(' ');
  return e.title;
}

/** Catalog hits for an entry, from `query` or what the entry knows. */
export async function findCandidates(e: CatalogEntry, query = defaultQuery(e)): Promise<SearchHit[]> {
  if (e.type === 'book') {
    const hits = await searchAllBooks(query);
    // An ISBN the catalogs don't know: try the title and author instead.
    if (!hits.length && query === e.isbn)
      return searchAllBooks([e.title, e.creators?.[0]].filter(Boolean).join(' '));
    return hits;
  }
  if (e.type !== 'movie' && e.type !== 'tv') return [];
  // The entry's own year narrows a first search, unless the user typed one.
  if (query === e.title && e.year) {
    const hits = await searchTmdb(query, e.type, e.year);
    if (hits.length) return hits;
  }
  return searchTmdb(query, e.type);
}

const surname = (name: string | undefined) =>
  foldText(name ?? '')
    .trim()
    .split(/\s+/)
    .at(-1) ?? '';
const sameText = (a: string | null | undefined, b: string | null | undefined) =>
  Boolean(a && b) && foldText(a!).replace(/\W+/g, ' ').trim() === foldText(b!).replace(/\W+/g, ' ').trim();

/**
 * The hit that is surely this entry, or null. A book: the same ISBN, or the
 * same title and author (editions of one book count as one). A film or show:
 * the only one with the same title and year.
 */
export function confidentPick(e: CatalogEntry, hits: SearchHit[]): SearchHit | null {
  if (e.type === 'book') {
    if (e.isbn) {
      const byIsbn = hits.find((h) => h.isbn === e.isbn);
      if (byIsbn) return byIsbn;
    }
    const author = surname(e.creators?.[0]);
    return (
      hits.find(
        (h) => sameText(h.title, e.title) && (!author || h.creators.some((c) => surname(c) === author))
      ) ?? null
    );
  }
  return pickFilm(e, hits);
}

const empty = (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0);
const isTvdbArtwork = (url: string | null | undefined) => /(^|\.)thetvdb\.com\//.test(url ?? '');

/** The parts of an entry a match would fill in, by name, for the preview. */
export function matchFills(e: CatalogEntry, hit: SearchHit): string[] {
  const fills: string[] = [];
  if (hit.thumbnailUrl && (empty(e.thumbnailUrl) || isTvdbArtwork(e.thumbnailUrl))) fills.push('Cover');
  if (hit.summary && empty(e.summary)) fills.push('Synopsis');
  if (hit.genres.length && empty(e.genres)) fills.push('Genres');
  if (hit.creators.length && empty(e.creators)) fills.push(e.type === 'book' ? 'Author' : 'Creators');
  if (hit.year && empty(e.year)) fills.push('Year');
  if (hit.pageCount && empty(e.pageCount)) fills.push('Page count');
  if (hit.isbn && empty(e.isbn)) fills.push('ISBN');
  if (e.type === 'movie' || e.type === 'tv')
    fills.push(e.type === 'tv' ? 'Seasons and details' : 'Director and details');
  return fills;
}

/** Fill in `draft` from `hit` (see the top of this file). */
export function applyMatch(draft: CatalogEntry, hit: SearchHit, cover: Blob | null = null): void {
  draft.sourceId = hit.sourceId;
  if (hit.detailUrl) draft.detailUrl = hit.detailUrl;
  if (hit.thumbnailUrl && (empty(draft.thumbnailUrl) || isTvdbArtwork(draft.thumbnailUrl))) {
    draft.thumbnailUrl = hit.thumbnailUrl;
    draft.thumbnailBlob = cover;
  }
  if (empty(draft.summary)) draft.summary = hit.summary;
  if (empty(draft.genres)) draft.genres = hit.genres;
  if (empty(draft.creators)) draft.creators = hit.creators;
  if (empty(draft.year)) draft.year = hit.year;
  if (empty(draft.pageCount) && hit.pageCount) draft.pageCount = hit.pageCount;
  if (empty(draft.isbn) && hit.isbn) draft.isbn = hit.isbn;
  if (empty(draft.originalTitle) && hit.originalTitle) draft.originalTitle = hit.originalTitle;
  delete draft.needsMatch;
  // Films and shows load their credits (and a show its seasons) when opened.
  if (draft.type === 'movie' || draft.type === 'tv') draft.enriched = false;
}

/** Link entry `id` to `hit`, with its cover; a show's ticked episodes carry over. */
export async function matchEntry(id: string, hit: SearchHit): Promise<CatalogEntry | null> {
  // A plain copy: the hit may be a component's reactive state, which IndexedDB can't store.
  hit = JSON.parse(JSON.stringify(hit)) as SearchHit;
  const cover = hit.thumbnailUrl ? await fetchThumbBlob(hit.thumbnailUrl) : null;
  const guide = hit.type === 'tv' ? await getEpisodeGuide(hit.sourceId!).catch(() => null) : null;
  return patchEntry(id, (d) => {
    const oldEpisodes = d.episodeGuide?.episodes ?? [];
    applyMatch(d, hit, cover);
    if (d.type === 'tv') {
      d.watchedEpisodes = guide ? carryWatched(oldEpisodes, d.watchedEpisodes ?? [], guide.episodes) : [];
      d.episodeGuide = guide;
    }
  });
}
