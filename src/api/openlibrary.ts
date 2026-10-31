// Open Library client — a keyless fallback/supplement to Google Books.
// Used when Google Books returns nothing or rate-limits, and for ISBN lookups.

import { normalizeOpenLibraryDoc, type OpenLibraryDoc } from './normalize';
import type { SearchHit } from '../types';

const SEARCH = 'https://openlibrary.org/search.json';

const ISBN_RE = /^(?:\d[\s-]?){9}[\dxX]$|^(?:\d[\s-]?){13}$/;

export function looksLikeIsbn(query: string): boolean {
  return ISBN_RE.test(query.trim());
}

export async function searchOpenLibrary(query: string, { maxResults = 20 } = {}): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const params = new URLSearchParams({
    q,
    limit: String(maxResults),
    fields: 'key,title,author_name,first_publish_year,cover_i,subject,number_of_pages_median,isbn'
  });
  if (looksLikeIsbn(q)) {
    params.delete('q');
    params.set('isbn', q.replace(/[\s-]/g, ''));
  }
  const res = await fetch(`${SEARCH}?${params}`);
  if (!res.ok) throw new Error(`Open Library search failed (${res.status})`);
  const data = await res.json();
  return ((data.docs || []) as OpenLibraryDoc[]).map(normalizeOpenLibraryDoc);
}
