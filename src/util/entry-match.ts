// Finding shelf entries by title, for linking a quote to its book, film or show.

import type { CatalogEntry } from '../types';

export const MAX_OPTIONS = 6;

/**
 * Entries whose title or creators contain the query (case-insensitive),
 * title-prefix matches first. Quotes are never candidates.
 */
export function matchEntries(entries: CatalogEntry[], query: string, limit = MAX_OPTIONS): CatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return entries
    .filter((e) => e.type !== 'quote')
    .map((e) => {
      const title = e.title.toLowerCase();
      const inCreators = (e.creators || []).some((c) => c.toLowerCase().includes(q));
      const score = title.startsWith(q) ? 0 : title.includes(q) ? 1 : inCreators ? 2 : -1;
      return { e, score };
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) => a.score - b.score || a.e.title.localeCompare(b.e.title))
    .slice(0, limit)
    .map((x) => x.e);
}

/**
 * The entry whose title equals `title` (ignoring case, punctuation and a
 * leading "The"/"A"), for auto-linking shared quotes. Null if none / ambiguous.
 */
export function findEntryByTitle(entries: CatalogEntry[], title: string): CatalogEntry | null {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .replace(/^(the|a|an)\s+/, '')
      .replace(/\s+/g, ' ')
      .trim();
  const target = norm(title || '');
  if (!target) return null;
  const hits = entries.filter((e) => e.type !== 'quote' && norm(e.title) === target);
  return hits.length === 1 ? hits[0]! : null;
}
