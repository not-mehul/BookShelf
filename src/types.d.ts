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
