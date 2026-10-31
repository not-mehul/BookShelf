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
export interface TvdbSearchHit {
  type?: string;
  tvdb_id?: string | number;
  id?: string | number;
  name?: string;
  title?: string;
  year?: string;
  overview?: string;
  genres?: string[];
  image_url?: string;
  thumbnail?: string;
  url?: string;
}
export interface TvdbDetail {
  image?: string;
  overview?: string;
  genres?: { name?: string }[];
  characters?: { peopleType?: string; personName?: string }[];
}
export interface TvdbEpisode {
  id?: number | string;
  seasonNumber?: number | string;
  number?: number | string;
  name?: string;
  aired?: unknown;
  runtime?: number;
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

// TheTVDB /search returns a heterogeneous list with `type`: 'movie' | 'series' | etc.
export function normalizeTvdbSearchHit(hit: TvdbSearchHit): SearchHit {
  const isSeries = hit.type === 'series';
  const type = isSeries ? 'tv' : 'movie';
  const year = hit.year ? parseInt(hit.year, 10) : NaN;
  return {
    type,
    sourceId: String(hit.tvdb_id || hit.id),
    title: hit.name || hit.title || 'Untitled',
    creators: [],
    year: Number.isFinite(year) ? year : null,
    summary: hit.overview || '',
    genres: hit.genres || [],
    thumbnailUrl: hit.image_url || hit.thumbnail || null,
    detailUrl: hit.url || null,
    raw: { type: hit.type }
  };
}

// Full /movies/{id}/extended or /series/{id}/extended detail enrichment.
export function enrichFromTvdbDetail(entry: CatalogEntry, detail: TvdbDetail | null): CatalogEntry {
  if (!detail) return entry;
  const next = { ...entry };
  if (detail.image) next.thumbnailUrl = next.thumbnailUrl || detail.image;
  if (detail.overview) next.summary = next.summary || detail.overview;
  const genres = (detail.genres || []).map((g) => g.name).filter((n): n is string => Boolean(n));
  if (genres.length) next.genres = genres;
  const directors = (detail.characters || [])
    .filter((c) => /director/i.test(c.peopleType || ''))
    .map((c) => c.personName)
    .filter((n): n is string => Boolean(n));
  if (directors.length) next.creators = directors;
  next.enriched = true;
  return next;
}

// TheTVDB EpisodeBaseRecord → compact Episode (see types.d.ts).
export function normalizeEpisode(ep: TvdbEpisode | null | undefined): Episode | null {
  if (!ep || ep.id == null || ep.seasonNumber == null || ep.number == null) return null;
  return {
    id: Number(ep.id),
    s: Number(ep.seasonNumber),
    e: Number(ep.number),
    name: ep.name || '',
    aired: typeof ep.aired === 'string' && /^\d{4}-\d{2}-\d{2}/.test(ep.aired) ? ep.aired.slice(0, 10) : null,
    runtime: ep.runtime != null && Number.isFinite(ep.runtime) ? ep.runtime : null
  };
}
