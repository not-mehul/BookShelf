// Feed the Android home-screen widget.
//
// The widget (BookShelfWidget.kt) can't read the WebView's IndexedDB, so after
// every change the page sends it a small summary over the native bridge.

import { isNativeShell, callNative } from './native';
import type { CatalogEntry } from '../types';

export interface WidgetSummary {
  total: number;
  counts: { book: number; movie: number; tv: number; quote: number };
  /** Up to 3 items marked in progress, most recently touched first; progress is 0–1. */
  inProgress: { title: string; creator: string; type: string; progress: number | null }[];
  /** The most recently added quote. */
  quote: { text: string; author: string } | null;
  /** Matches the app's Dusk/Dawn choice. */
  theme: 'light' | 'dark';
}

const MAX_IN_PROGRESS = 3;
const MAX_QUOTE_CHARS = 240;

const touched = (e: CatalogEntry) => e.updatedAt || e.dateAdded || '';
export function buildWidgetSummary(entries: CatalogEntry[], theme: 'light' | 'dark'): WidgetSummary {
  const counts = { book: 0, movie: 0, tv: 0, quote: 0 };
  for (const e of entries) if (e.type in counts) counts[e.type]++;

  const inProgress = entries
    .filter((e) => e.status === 'in-progress' && e.type !== 'quote')
    .sort((a, b) => touched(b).localeCompare(touched(a)))
    .slice(0, MAX_IN_PROGRESS)
    .map((e) => ({
      title: e.title,
      creator: e.creators?.[0] || '',
      type: e.type,
      progress: e.progress && e.progress.total > 0 ? Math.min(1, e.progress.current / e.progress.total) : null
    }));

  const latestQuote = entries
    .filter((e) => e.type === 'quote')
    .sort((a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || ''))[0];
  const quoteText = latestQuote ? latestQuote.quoteText || latestQuote.title : '';

  return {
    total: entries.length,
    counts,
    inProgress,
    quote: latestQuote
      ? {
          text:
            quoteText.length > MAX_QUOTE_CHARS ? `${quoteText.slice(0, MAX_QUOTE_CHARS - 1)}…` : quoteText,
          author: latestQuote.creators?.[0] || latestQuote.source || ''
        }
      : null,
    theme
  };
}

/**
 * Send the current summary to the widget (no-op outside the Android app).
 */
export async function pushWidgetSummary(entries: CatalogEntry[]) {
  if (!isNativeShell()) return;
  const theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  try {
    await callNative('widgetUpdate', { summary: buildWidgetSummary(entries, theme) });
  } catch (err) {
    console.warn('Widget update failed:', err);
  }
}
