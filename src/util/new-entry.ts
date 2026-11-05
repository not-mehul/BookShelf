// A fresh entry with every field at its default.

import { newEntryId } from '../db/database';
import { stampStatusDates } from './journal';
import type { CatalogEntry, EntryType } from '../types';

export function newEntry(type: EntryType, fields: Partial<CatalogEntry> & { title: string }): CatalogEntry {
  const entry: CatalogEntry = {
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
  // Added already started or finished (a link from a sibling app, a seeded search):
  // the journal starts today.
  if (!entry.dateStarted && !entry.finishes?.length) stampStatusDates(entry, null, entry.status);
  return entry;
}
