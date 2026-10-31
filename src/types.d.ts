// Shared data types for the JS codebase (checked by `npm run typecheck`).
// Import into JSDoc with: /** @typedef {import('../types').CatalogEntry} CatalogEntry */

export type EntryType = 'book' | 'movie' | 'tv' | 'quote';
export type EntryStatus = 'want' | 'in-progress' | 'finished';

/** One item on the shelf, as stored in IndexedDB. */
export interface CatalogEntry {
  id: string;
  type: EntryType;
  /** External id (Google Books / Open Library / TheTVDB); null for manual entries. */
  sourceId: string | null;
  title: string;
  creators: string[];
  year: number | null;
  summary: string;
  genres: string[];
  thumbnailUrl: string | null;
  /** Locally cached, downscaled cover. */
  thumbnailBlob: Blob | null;
  /** 0.5–5 in half-star steps, or null when unrated. */
  rating: number | null;
  status?: EntryStatus | null;
  notes: string;
  dateAdded: string;
  dateRated: string | null;
  /** Last local modification (ISO); drives sync conflict resolution. */
  updatedAt?: string;
  // Optional / type-specific fields (older records may lack them).
  pageCount?: number | null;
  isbn?: string | null;
  detailUrl?: string | null;
  tags?: string[];
  progress?: { current: number; total: number } | null;
  quoteText?: string;
  source?: string;
  /** Set once TheTVDB extended details have been merged in. */
  enriched?: boolean;
  /** Optional per-aspect scores (e.g. story, writing), same scale as rating. */
  aspectRatings?: Record<string, number>;
  /** Position in the "want to" queue (lower = sooner); fractional so a move rewrites one entry. */
  queueRank?: number | null;
  /** Series membership, e.g. { name: 'The Expanse', position: 3 }. */
  series?: { name: string; position: number | null } | null;
  /** Quotes: the book/movie/show this quote is from. */
  linkedEntryId?: string | null;
  /** Quotes: page number or timestamp, free text ("p. 112", "1:04:20"). */
  location?: string;
  /** TV: episode guide from TheTVDB. */
  episodeGuide?: EpisodeGuide | null;
  /** TV: ids of watched episodes. */
  watchedEpisodes?: number[];
  /** TV: notify (Android) when a new episode airs. */
  remindNewEpisodes?: boolean;
}

export interface Episode {
  id: number;
  /** Season number (0 = specials). */
  s: number;
  /** Episode number within the season. */
  e: number;
  name: string;
  /** Air date, YYYY-MM-DD, if known. */
  aired: string | null;
  runtime?: number | null;
}

export interface EpisodeGuide {
  fetchedAt: string;
  /** TheTVDB series status, e.g. "Continuing", "Ended". */
  status?: string;
  episodes: Episode[];
}

/** A search result before it is saved (no id / user fields yet). */
export type SearchHit = Pick<CatalogEntry, 'type' | 'sourceId' | 'title' | 'creators' | 'year' | 'summary' | 'genres' | 'thumbnailUrl'> &
  Partial<Pick<CatalogEntry, 'pageCount' | 'isbn' | 'detailUrl'>> & { raw?: unknown };

/** Record of a deleted entry, kept so deletions propagate through sync. */
export interface Tombstone {
  id: string;
  deletedAt: string;
}

// Shape Detection API (Chromium) — not yet in TypeScript's DOM lib.
declare global {
  interface DetectedBarcode {
    rawValue: string;
    format: string;
  }
  class BarcodeDetector {
    constructor(options?: { formats?: string[] });
    static getSupportedFormats(): Promise<string[]>;
    detect(source: CanvasImageSource | ImageBitmapSource): Promise<DetectedBarcode[]>;
  }
}
