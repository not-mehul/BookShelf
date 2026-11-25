// TMDB (The Movie Database) v3 client for films and TV, called straight from
// the phone with the user's own free key: no proxy, no BookShelf server.
// The key is either a v3 API key (sent as `api_key`) or a v4 read access
// token (sent as a bearer token); both come from themoviedb.org's API page.
//
// Ids on the shelf are `tmdb:<number>`, so a film or show added before the
// move from TheTVDB (a bare number) is told apart until it is matched.

import { getSetting } from '../util/settings';
import {
  enrichFromTmdbDetail,
  normalizeTmdbEpisode,
  normalizeTmdbHit,
  type TmdbDetail,
  type TmdbEpisode,
  type TmdbHit
} from './normalize';
import type { CatalogEntry, Episode, EpisodeGuide, SearchHit } from '../types';

const BASE = 'https://api.themoviedb.org/3';
export const TMDB_KEY = 'tmdb_api_key';
const PREFIX = 'tmdb:';

/** A shelf id for a TMDB record. */
export const tmdbSourceId = (id: number | string) => `${PREFIX}${id}`;
/** The TMDB number in a shelf id, or null for anything else (a TheTVDB id from before). */
export function tmdbNumber(sourceId: string | null | undefined): string | null {
  return sourceId?.startsWith(PREFIX) ? sourceId.slice(PREFIX.length) : null;
}

async function apiKey() {
  return (await getSetting(TMDB_KEY, '')).trim();
}

/** Film and TV search works once a TMDB key is saved in Settings. */
export async function isTmdbConfigured() {
  return Boolean(await apiKey());
}

/** A v4 read access token is a JWT; anything else is a v3 key. */
const isToken = (key: string) => key.startsWith('eyJ');

async function tmdbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const key = await apiKey();
  if (!key) throw new Error('TMDB isn’t set up. Add your free TMDB key in Settings.');
  const query = new URLSearchParams({ language: 'en-US', ...params });
  if (!isToken(key)) query.set('api_key', key);
  const res = await fetch(`${BASE}${path}?${query}`, {
    headers: isToken(key) ? { authorization: `Bearer ${key}`, accept: 'application/json' } : {}
  });
  if (res.status === 401) throw new Error('TMDB didn’t accept the key. Check it in Settings.');
  if (res.status === 429) throw new Error('TMDB is busy. Try again in a moment.');
  if (!res.ok) throw new Error(`TMDB request failed (${res.status})`);
  return (await res.json()) as T;
}

// Genre names, fetched once a session: search results carry only their ids.
const genreLists = new Map<'movie' | 'tv', Promise<Map<number, string>>>();
function genreNames(kind: 'movie' | 'tv') {
  let list = genreLists.get(kind);
  if (!list) {
    list = tmdbFetch<{ genres?: { id: number; name: string }[] }>(`/genre/${kind}/list`)
      .then((json) => new Map((json.genres || []).map((g) => [g.id, g.name])))
      .catch(() => {
        genreLists.delete(kind);
        return new Map<number, string>();
      });
    genreLists.set(kind, list);
  }
  return list;
}

export async function searchTmdb(
  query: string,
  type: 'movie' | 'tv',
  year?: number | null
): Promise<SearchHit[]> {
  if (!query.trim()) return [];
  const params: Record<string, string> = { query, include_adult: 'false' };
  if (year) params[type === 'movie' ? 'year' : 'first_air_date_year'] = String(year);
  const [json, genres] = await Promise.all([
    tmdbFetch<{ results?: TmdbHit[] }>(`/search/${type}`, params),
    genreNames(type)
  ]);
  return (json.results || []).slice(0, 20).map((hit) => normalizeTmdbHit(hit, type, genres));
}

/** TMDB's full record (with credits) for a film or show on the shelf, or null (not TMDB, offline, no key). */
export async function fetchDetail(
  entry: Pick<CatalogEntry, 'type' | 'sourceId'>
): Promise<TmdbDetail | null> {
  const id = tmdbNumber(entry.sourceId);
  if (!id || (entry.type !== 'movie' && entry.type !== 'tv')) return null;
  try {
    const detail = await tmdbFetch<TmdbDetail>(`/${entry.type}/${id}`, { append_to_response: 'credits' });
    if (entry.type === 'movie' && detail.belongs_to_collection) {
      detail.collection_position = await collectionPosition(detail.belongs_to_collection.id, detail.id);
    }
    return detail;
  } catch {
    return null;
  }
}

/** A film's place in its TMDB collection, counting by release date (unreleased last). */
async function collectionPosition(collectionId: number, filmId: number): Promise<number | null> {
  try {
    const json = await tmdbFetch<{ parts?: { id: number; release_date?: string }[] }>(
      `/collection/${collectionId}`
    );
    const parts = [...(json.parts || [])].sort((a, b) =>
      (a.release_date || '9999').localeCompare(b.release_date || '9999')
    );
    const i = parts.findIndex((p) => p.id === filmId);
    return i >= 0 ? i + 1 : null;
  } catch {
    return null;
  }
}

export async function enrichEntry(entry: CatalogEntry): Promise<CatalogEntry> {
  return enrichFromTmdbDetail(entry, await fetchDetail(entry));
}

/** A film's or show's English title on TMDB, or '' when it has none. */
export async function getEnglishTitle(entry: Pick<CatalogEntry, 'type' | 'sourceId'>): Promise<string> {
  const detail = await fetchDetail(entry);
  return String(detail?.title || detail?.name || '').trim();
}

/** The TMDB show a TheTVDB series id points to, or null. */
export async function findShowByTvdbId(tvdbId: string): Promise<number | null> {
  const json = await tmdbFetch<{ tv_results?: { id: number }[] }>(`/find/${encodeURIComponent(tvdbId)}`, {
    external_source: 'tvdb_id'
  });
  return json.tv_results?.[0]?.id ?? null;
}

/** Every season of a TMDB show, specials included (aired order). */
export async function getEpisodeGuide(sourceId: string): Promise<EpisodeGuide> {
  const id = tmdbNumber(sourceId);
  if (!id) throw new Error('Not a TMDB show');
  const show = await tmdbFetch<TmdbDetail>(`/tv/${id}`);
  const episodes: Episode[] = [];
  for (const season of show.seasons || []) {
    if (season.season_number == null || !season.episode_count) continue;
    const json = await tmdbFetch<{ episodes?: TmdbEpisode[] }>(`/tv/${id}/season/${season.season_number}`);
    for (const ep of json.episodes || []) {
      const one = normalizeTmdbEpisode(ep);
      if (one) episodes.push(one);
    }
  }
  return { fetchedAt: new Date().toISOString(), status: show.status || undefined, episodes };
}
