// A fresh entry with every field at its default.

import { newEntryId } from '../db/database';
import type { CatalogEntry, EntryType } from '../types';

export function newEntry(type: EntryType, fields: Partial<CatalogEntry> & { title: string }): CatalogEntry {
  return {
    id: newEntryId(),
    type,
    sourceId: null,
    creators: [],
    year: null,
    summary: '',
    genres: [],
    thumbnailUrl: null,
    thumbnailBlob: null,
    tags: [],
    progress: null,
    rating: null,
    status: null,
    notes: '',
    dateAdded: new Date().toISOString(),
    dateRated: null,
    ...fields
  };
}
