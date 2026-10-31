// TheTVDB v4 client.
// Either talks to TheTVDB directly (login → bearer token, ≈1 month lifetime,
// cached and refreshed proactively), or — when a BookShelf proxy URL is set —
// to the proxy Worker (proxy/), which holds the API key server-side and
// exposes the same paths.

import { getSetting, setSetting } from '../util/settings.js';
import { isNativeShell } from '../platform/native.js';
import {
  normalizeTvdbSearchHit,
  enrichFromTvdbDetail,
  normalizeEpisode
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
  const url = `${BASE}/login`;
  const proxy = isNativeShell() ? '' : await getSetting('cors_proxy', '');
  const finalUrl = proxy ? `${proxy}${url}` : url;

  const res = await fetch(finalUrl, {
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

/** Base URL of a BookShelf TheTVDB proxy, if configured ('' otherwise). */
async function proxyBase() {
  return (await getSetting('tvdb_proxy_url', '')).trim().replace(/\/+$/, '');
}

/** Movie/TV search works with either a proxy or a TheTVDB API key. */
export async function isTvdbConfigured() {
  return Boolean((await proxyBase()) || (await getSetting('tvdb_api_key', '')));
}

/**
 * @param {string} path
 * @param {Record<string, string>} [params]
 */
async function tvdbFetch(path, params) {
  const proxyUrl = await proxyBase();
  if (proxyUrl) return proxyFetch(proxyUrl, path, params);

  let token = await getToken();
  const qs = params ? `?${new URLSearchParams(params)}` : '';
  const url = `${BASE}${path}${qs}`;
  const proxy = isNativeShell() ? '' : await getSetting('cors_proxy', '');
  const finalUrl = proxy ? `${proxy}${url}` : url;

  let res = await fetch(finalUrl, {
    headers: { authorization: `Bearer ${token}` }
  });
  if (res.status === 401) {
    token = await refreshToken();
    res = await fetch(finalUrl, {
      headers: { authorization: `Bearer ${token}` }
    });
  }
  if (!res.ok) {
    throw new Error(`TheTVDB request failed (${res.status})`);
  }
  return res.json();
}

/**
 * @param {string} base
 * @param {string} path
 * @param {Record<string, string>} [params]
 */
async function proxyFetch(base, path, params) {
  const proxyToken = await getSetting('tvdb_proxy_token', '');
  const qs = params ? `?${new URLSearchParams(params)}` : '';
  const res = await fetch(`${base}${path}${qs}`, {
    headers: proxyToken ? { authorization: `Bearer ${proxyToken}` } : {}
  });
  if (res.status === 401) throw new Error('The TheTVDB proxy rejected the access token. Check it in Settings.');
  if (!res.ok) throw new Error(`TheTVDB proxy request failed (${res.status})`);
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

const EPISODE_PAGE_SIZE = 500; // TheTVDB's page size for episode lists
const MAX_EPISODE_PAGES = 20;

/**
 * Collect every page of an episode list. Follows `links.next`; if a response
 * has no links, a full page is taken to mean there may be more.
 * @param {(page: number) => Promise<any>} fetchPage
 */
export async function collectEpisodePages(fetchPage) {
  /** @type {any[]} */
  const episodes = [];
  /** @type {any} */
  let series = null;
  for (let page = 0; page < MAX_EPISODE_PAGES; page++) {
    const json = await fetchPage(page);
    const batch = json?.data?.episodes || [];
    series ??= json?.data?.series || null;
    episodes.push(...batch);
    const more = json?.links ? Boolean(json.links.next) : batch.length >= EPISODE_PAGE_SIZE;
    if (!more || !batch.length) break;
  }
  return { episodes, series };
}

/**
 * Full episode guide for a TheTVDB series (aired order).
 * @param {string} seriesId
 * @returns {Promise<import('../types').EpisodeGuide>}
 */
export async function getEpisodeGuide(seriesId) {
  const { episodes, series } = await collectEpisodePages((page) =>
    tvdbFetch(`/series/${encodeURIComponent(seriesId)}/episodes/default`, { page: String(page) })
  );
  return {
    fetchedAt: new Date().toISOString(),
    status: series?.status?.name || undefined,
    episodes: episodes.map(normalizeEpisode).filter((e) => e !== null)
  };
}
