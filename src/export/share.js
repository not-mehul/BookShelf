// Share a single catalog entry. Uses the Android export bridge on-device,
// the Web Share API where available, and a clipboard copy as a last resort.

import { isNativeShell, nativeExport } from '../platform/native.js';
import { starString, ratingLabel } from '../util/stars.js';


export function entryToText(entry) {
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

// Returns a short status string for UI feedback.
export async function shareEntry(entry) {
  const text = entryToText(entry);
  const title = entry.type === 'quote' ? 'A quote' : entry.title;

  if (isNativeShell()) {
    const safe = (title || 'entry').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 40);
    nativeExport(`${safe}.txt`, text);
    return 'shared';
  }
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return 'copied';
    } catch {
      return 'failed';
    }
  }
  return 'failed';
}
