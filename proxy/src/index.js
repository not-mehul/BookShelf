// BookShelf TheTVDB proxy — a Cloudflare Worker.
//
// Lets BookShelf search TheTVDB without shipping an API key to devices and
// without a browser CORS proxy. The Worker holds the key/PIN as secrets, logs
// in, caches the bearer token, and forwards a small allowlist of read-only
// endpoints. Responses carry CORS headers for the configured origins.
//
// Environment (wrangler.toml / `wrangler secret put`):
//   TVDB_API_KEY     (secret, required)  TheTVDB project API key
//   TVDB_PIN         (secret, optional)  subscriber PIN
//   PROXY_TOKEN      (secret, optional)  if set, clients must send
//                                        `Authorization: Bearer <token>`
//   ALLOWED_ORIGINS  (var)               comma-separated browser origins

const TVDB = 'https://api4.thetvdb.com/v4';
const TOKEN_TTL_MS = 25 * 24 * 60 * 60 * 1000; // TheTVDB tokens last ~1 month
const CACHE_TTL_S = 60 * 60; // edge-cache API responses for an hour
const ARTWORK_HOSTS = ['artworks.thetvdb.com', 'thetvdb.com'];

/** @type {{ token: string, expires: number } | null} */
let cachedToken = null;

/**
 * @typedef {object} Env
 * @property {string} TVDB_API_KEY
 * @property {string} [TVDB_PIN]
 * @property {string} [PROXY_TOKEN]
 * @property {string} [ALLOWED_ORIGINS]
 */

export default {
  /**
   * @param {Request} request
   * @param {Env} env
   * @param {{ waitUntil(p: Promise<unknown>): void }} ctx
   */
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin, env);
    // Browsers send Origin; native apps and curl don't. Reject unknown browser origins.
    if (origin && !cors) return text('Origin not allowed', 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors || {} });
    if (request.method !== 'GET') return text('Method not allowed', 405, cors);

    if (env.PROXY_TOKEN && request.headers.get('Authorization') !== `Bearer ${env.PROXY_TOKEN}`) {
      return text('Unauthorized', 401, cors);
    }

    const url = new URL(request.url);
    const target = route(url);
    if (!target) return text('Not found', 404, cors);
    if (target.kind === 'artwork') return artwork(target.url, cors);

    // Shared edge cache, keyed on the upstream URL (never on the client's token).
    const cache = /** @type {any} */ (globalThis).caches?.default;
    const cacheKey = new Request(target.url);
    const hit = cache && (await cache.match(cacheKey));
    if (hit) return withHeaders(hit, cors);

    let upstream;
    try {
      upstream = await tvdbGet(target.url, env);
    } catch (err) {
      // Login failed (bad key, TheTVDB outage, network): a clean 502, not a crash.
      return text(`Upstream error: ${err instanceof Error ? err.message : String(err)}`, 502, cors);
    }
    const response = new Response(upstream.body, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CACHE_TTL_S}` }
    });
    if (cache && upstream.ok) ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return withHeaders(response, cors);
  }
};

/**
 * Map a proxy path onto an allowlisted upstream URL.
 * @param {URL} url
 * @returns {{ kind: 'api' | 'artwork', url: string } | null}
 */
export function route(url) {
  const path = url.pathname.replace(/\/+$/, '');
  if (path === '/search') {
    const query = url.searchParams.get('query');
    if (!query) return null;
    const params = new URLSearchParams({ query, limit: clampLimit(url.searchParams.get('limit')) });
    const type = url.searchParams.get('type');
    if (type === 'movie' || type === 'series') params.set('type', type);
    return { kind: 'api', url: `${TVDB}/search?${params}` };
  }
  const detail = path.match(/^\/(movies|series)\/(\d{1,12})\/extended$/);
  if (detail) return { kind: 'api', url: `${TVDB}/${detail[1]}/${detail[2]}/extended` };
  const episodes = path.match(/^\/series\/(\d{1,12})\/episodes\/(default|official)$/);
  if (episodes) {
    const page = Math.min(Math.max(Number.parseInt(url.searchParams.get('page') || '0', 10) || 0, 0), 50);
    return { kind: 'api', url: `${TVDB}/series/${episodes[1]}/episodes/${episodes[2]}?page=${page}` };
  }
  if (path === '/artwork') {
    const raw = url.searchParams.get('url') || '';
    try {
      const art = new URL(raw);
      if (art.protocol === 'https:' && ARTWORK_HOSTS.includes(art.hostname)) return { kind: 'artwork', url: art.href };
    } catch {
      /* invalid URL */
    }
    return null;
  }
  return null;
}

/** @param {string | null} raw */
function clampLimit(raw) {
  const n = Number.parseInt(raw || '20', 10);
  return String(Number.isFinite(n) ? Math.min(Math.max(n, 1), 50) : 20);
}

/**
 * GET an upstream TheTVDB URL with a (cached) bearer token; re-login once on 401.
 * @param {string} url
 * @param {Env} env
 */
async function tvdbGet(url, env) {
  let res = await fetch(url, { headers: { Authorization: `Bearer ${await token(env)}` } });
  if (res.status === 401) {
    cachedToken = null;
    res = await fetch(url, { headers: { Authorization: `Bearer ${await token(env)}` } });
  }
  return res;
}

/** @param {Env} env */
async function token(env) {
  if (cachedToken && cachedToken.expires > Date.now()) return cachedToken.token;
  if (!env.TVDB_API_KEY) throw new Error('TVDB_API_KEY is not configured');
  const body = env.TVDB_PIN ? { apikey: env.TVDB_API_KEY, pin: env.TVDB_PIN } : { apikey: env.TVDB_API_KEY };
  const res = await fetch(`${TVDB}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const json = /** @type {any} */ (await res.json().catch(() => null));
  const value = json?.data?.token;
  if (!res.ok || !value) throw new Error(`TheTVDB login failed (${res.status})`);
  cachedToken = { token: value, expires: Date.now() + TOKEN_TTL_MS };
  return value;
}

/**
 * Stream a cover image, adding CORS so browsers can cache it as a blob.
 * @param {string} url
 * @param {Record<string, string> | null} cors
 */
async function artwork(url, cors) {
  const res = await fetch(url);
  const type = res.headers.get('Content-Type') || '';
  if (!res.ok || !type.startsWith('image/')) return text('Artwork unavailable', 502, cors);
  return new Response(res.body, {
    headers: { ...cors, 'Content-Type': type, 'Cache-Control': 'public, max-age=604800' }
  });
}

/**
 * @param {string | null} origin
 * @param {Env} env
 * @returns {Record<string, string> | null} null when a browser origin is not allowed.
 */
export function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!origin) return {};
  if (!allowed.includes(origin) && !allowed.includes('*')) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

/**
 * @param {Response} res
 * @param {Record<string, string> | null} extra
 */
function withHeaders(res, extra) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(extra || {})) out.headers.set(k, v);
  return out;
}

/**
 * @param {string} body
 * @param {number} status
 * @param {Record<string, string> | null} [headers]
 */
function text(body, status, headers) {
  return new Response(body, { status, headers: { ...headers, 'Content-Type': 'text/plain' } });
}

/** Test hook: forget the cached TheTVDB token. */
export function _resetTokenCache() {
  cachedToken = null;
}
