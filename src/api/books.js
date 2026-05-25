// Google Books API client. Key is optional but recommended to raise quota.

import { getSetting } from '../util/settings.js';
import { normalizeBook } from './normalize.js';

const BASE = 'https://www.googleapis.com/books/v1';

export async function searchBooks(query, { maxResults = 20 } = {}) {
  if (!query.trim()) return [];
  const apiKey = await getSetting('google_books_api_key', '');
  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
    printType: 'books'
  });
  if (apiKey) params.set('key', apiKey);

  const res = await fetch(`${BASE}/volumes?${params}`);
  if (!res.ok) {
    throw new Error(`Google Books search failed (${res.status})`);
  }
  const data = await res.json();
  const items = data.items || [];
  return items.map(normalizeBook);
}

export async function getBook(volumeId) {
  const apiKey = await getSetting('google_books_api_key', '');
  const params = new URLSearchParams();
  if (apiKey) params.set('key', apiKey);
  const qs = params.toString();
  const res = await fetch(`${BASE}/volumes/${encodeURIComponent(volumeId)}${qs ? `?${qs}` : ''}`);
  if (!res.ok) {
    throw new Error(`Google Books detail failed (${res.status})`);
  }
  const data = await res.json();
  return normalizeBook(data);
}
