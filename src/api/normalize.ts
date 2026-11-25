// Normalize external API responses into the unified CatalogEntry shape
// (see types.d.ts). The API shapes below list only the fields we read.

import type { CatalogEntry, Episode, SearchHit } from '../types';

interface GoogleImageLinks {
  extraLarge?: string;
  large?: string;
  medium?: string;
  thumbnail?: string;
  smallThumbnail?: string;
}
export interface GoogleVolume {
  id: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    publishedDate?: string;
    description?: string;
    categories?: string[];
    pageCount?: number;
    imageLinks?: GoogleImageLinks;
    infoLink?: string;
  };
}
export interface OpenLibraryDoc {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  subject?: string[];
  number_of_pages_median?: number;
  isbn?: string[];
}
export interface TmdbHit {
  id: number;
  /** Films. */
  title?: string;
  original_title?: string;
  release_date?: string;
  /** Shows. */
  name?: string;
  original_name?: string;
  first_air_date?: string;
  overview?: string;
  poster_path?: string | null;
  genre_ids?: number[];
}
export interface TmdbDetail extends TmdbHit {
  genres?: { id: number; name: string }[];
  runtime?: number | null;
  status?: string;
  created_by?: { name?: string }[];
  seasons?: { season_number?: number; episode_count?: number }[];
  belongs_to_collection?: { id: number; name?: string } | null;
  credits?: { crew?: { job?: string; name?: string }[] };
}
export interface TmdbEpisode {
  id?: number;
  season_number?: number;
  episode_number?: number;
  name?: string;
  air_date?: string | null;
  runtime?: number | null;
}

export function normalizeBook(volume: GoogleVolume): SearchHit {
  const info = volume.volumeInfo || {};
  const year = info.publishedDate ? parseInt(info.publishedDate.slice(0, 4), 10) : NaN;
  return {
    type: 'book' as const,
    sourceId: String(volume.id),
    title: info.title || 'Untitled',
    creators: info.authors || [],
    year: Number.isFinite(year) ? year : null,
    summary: info.description || '',
    genres: info.categories || [],
    pageCount: info.pageCount || null,
    thumbnailUrl: pickBookThumb(info.imageLinks),
    detailUrl: info.infoLink || null
  };
}

function pickBookThumb(links: GoogleImageLinks | undefined): string | null {
  if (!links) return null;
  const raw =
    links.extraLarge || links.large || links.medium || links.thumbnail || links.smallThumbnail || null;
  if (!raw) return null;
  return raw.replace(/^http:\/\//, 'https://');
}

// Open Library /search.json doc → unified book shape.
export function normalizeOpenLibraryDoc(doc: OpenLibraryDoc): SearchHit {
  const year =
    doc.first_publish_year != null && Number.isFinite(doc.first_publish_year) ? doc.first_publish_year : null;
  const coverId = doc.cover_i;
  return {
    type: 'book' as const,
    sourceId: `ol:${doc.key || doc.isbn?.[0] || Math.random().toString(36).slice(2)}`,
    title: doc.title || 'Untitled',
    creators: doc.author_name || [],
    year,
    summary: '',
    genres: (doc.subject || []).slice(0, 8),
    pageCount: doc.number_of_pages_median || null,
    isbn: doc.isbn?.[0] || null,
    thumbnailUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : null,
    detailUrl: doc.key ? `https://openlibrary.org${doc.key}` : null
  };
}

/** A TMDB poster at a size that suits a cover. */
export const tmdbPoster = (path: string | null | undefined) =>
  path ? `https://image.tmdb.org/t/p/w500${path}` : null;

const yearOf = (date: string | undefined) => {
  const n = parseInt((date || '').slice(0, 4), 10);
  return Number.isFinite(n) ? n : null;
};

// TMDB /search/movie or /search/tv result → unified shape. Titles come in
// English (the client asks for en-US); the original stays alongside.
export function normalizeTmdbHit(hit: TmdbHit, type: 'movie' | 'tv', genres: Map<number, string>): SearchHit {
  const title = (type === 'movie' ? hit.title : hit.name)?.trim() || '';
  const original = (type === 'movie' ? hit.original_title : hit.original_name)?.trim() || '';
  return {
    type,
    sourceId: `tmdb:${hit.id}`,
    title: title || original || 'Untitled',
    originalTitle: original && title && original !== title ? original : null,
    creators: [],
    year: yearOf(type === 'movie' ? hit.release_date : hit.first_air_date),
    summary: hit.overview || '',
    genres: (hit.genre_ids || []).map((id) => genres.get(id)).filter((n): n is string => Boolean(n)),
    thumbnailUrl: tmdbPoster(hit.poster_path),
    detailUrl: `https://www.themoviedb.org/${type}/${hit.id}`
  };
}

// /movie/{id} or /tv/{id} with credits: genres, the director (films) or the
// creators (shows), and anything the search result lacked.
export function enrichFromTmdbDetail(entry: CatalogEntry, detail: TmdbDetail | null): CatalogEntry {
  if (!detail) return entry;
  const next = { ...entry };
  next.thumbnailUrl = next.thumbnailUrl || tmdbPoster(detail.poster_path);
  if (detail.overview) next.summary = next.summary || detail.overview;
  const genres = (detail.genres || []).map((g) => g.name).filter(Boolean);
  if (genres.length) next.genres = genres;
  const people =
    entry.type === 'movie'
      ? (detail.credits?.crew || []).filter((c) => c.job === 'Director').map((c) => c.name)
      : (detail.created_by || []).map((c) => c.name);
  const creators = [...new Set(people.filter((n): n is string => Boolean(n)))];
  if (creators.length) next.creators = creators;
  if (entry.type === 'movie' && detail.runtime) next.runtime = detail.runtime;
  next.enriched = true;
  return next;
}

// TMDB season episode → compact Episode (see types.d.ts).
export function normalizeTmdbEpisode(ep: TmdbEpisode | null | undefined): Episode | null {
  if (!ep || ep.id == null || ep.season_number == null || ep.episode_number == null) return null;
  return {
    id: Number(ep.id),
    s: Number(ep.season_number),
    e: Number(ep.episode_number),
    name: ep.name || '',
    aired:
      typeof ep.air_date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(ep.air_date)
        ? ep.air_date.slice(0, 10)
        : null,
    runtime: ep.runtime != null && Number.isFinite(ep.runtime) ? ep.runtime : null
  };
}
