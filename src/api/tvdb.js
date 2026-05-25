// TheTVDB v4 client.
// Login → bearer token (≈1 month lifetime). We cache the token and refresh proactively.

import { getSetting, setSetting } from '../util/settings.js';
import {
  normalizeTvdbSearchHit,
  enrichFromTvdbDetail
} from './normalize.js';

const BASE = 'https://api4.thetvdb.com/v4';
const TOKEN_TTL_MS = 25 * 24 * 60 * 60 * 1000; // 25 days — refresh before the 30-day limit

async function getToken() {
  const cached = await getSetting('tvdb_token', '');
  const issuedAt = parseInt(await getSetting('tvdb_token_issued', '0'), 10) || 0;
  if (cached && Date.now() - issuedAt < TOKEN_TTL_MS) return cached;
  return refreshToken();
}

async function refreshToken() {
  const apikey = await getSetting('tvdb_api_key', '');
  if (!apikey) throw new Error('TheTVDB API key is not set. Open Settings to add it.');
  const pin = await getSetting('tvdb_pin', '');

  const body = pin ? { apikey, pin } : { apikey };
  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    throw new Error(`TheTVDB login failed (${res.status})`);
  }
  const json = await res.json();
  const token = json?.data?.token;
  if (!token) throw new Error('TheTVDB login returned no token');
  await setSetting('tvdb_token', token);
  await setSetting('tvdb_token_issued', String(Date.now()));
  return token;
}

async function tvdbFetch(path, params) {
  let token = await getToken();
  const qs = params ? `?${new URLSearchParams(params)}` : '';
  let res = await fetch(`${BASE}${path}${qs}`, {
    headers: { authorization: `Bearer ${token}` }
  });
  if (res.status === 401) {
    token = await refreshToken();
    res = await fetch(`${BASE}${path}${qs}`, {
      headers: { authorization: `Bearer ${token}` }
    });
  }
  if (!res.ok) {
    throw new Error(`TheTVDB request failed (${res.status})`);
  }
  return res.json();
}

// type: 'movie' | 'tv' | 'any'
export async function searchTvdb(query, type = 'any') {
  if (!query.trim()) return [];
  const params = { query, limit: '20' };
  if (type === 'movie') params.type = 'movie';
  if (type === 'tv') params.type = 'series';
  const json = await tvdbFetch('/search', params);
  const hits = (json?.data || []).filter((h) => {
    if (type === 'movie') return h.type === 'movie';
    if (type === 'tv') return h.type === 'series';
    return h.type === 'movie' || h.type === 'series';
  });
  return hits.map(normalizeTvdbSearchHit);
}

export async function getMovie(id) {
  const json = await tvdbFetch(`/movies/${encodeURIComponent(id)}/extended`);
  return json?.data || null;
}

export async function getSeries(id) {
  const json = await tvdbFetch(`/series/${encodeURIComponent(id)}/extended`);
  return json?.data || null;
}

export async function enrichEntry(entry) {
  try {
    const detail =
      entry.type === 'movie'
        ? await getMovie(entry.sourceId)
        : await getSeries(entry.sourceId);
    return enrichFromTvdbDetail(entry, detail);
  } catch {
    return entry;
  }
}
