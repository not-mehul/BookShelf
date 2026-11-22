// Share a single catalog entry as text, through the Android share sheet.

import { nativeExport } from '../platform/native';
import { starString, ratingLabel } from '../util/stars';
import type { CatalogEntry } from '../types';
export function entryToText(entry: CatalogEntry): string {
  if (entry.type === 'quote') {
    const cite = [entry.creators?.[0], entry.source].filter(Boolean).join(', ');
    return `“${entry.quoteText || entry.title}”${cite ? `\n— ${cite}` : ''}`;
  }
  const parts = [entry.title + (entry.year ? ` (${entry.year})` : '')];
  if (entry.creators?.length) parts.push(entry.creators.join(', '));
  if (entry.rating != null) parts.push(`${starString(entry.rating)} ${ratingLabel(entry.rating)}`);
  if (entry.summary) parts.push('\n' + entry.summary.trim());
  return parts.join('\n');
}

/** Hands the entry, as text, to the Android share sheet. */
export function shareEntry(entry: CatalogEntry): void {
  const title = entry.type === 'quote' ? 'A quote' : entry.title;
  const safe = (title || 'entry').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 40);
  nativeExport(`${safe}.txt`, entryToText(entry));
}
