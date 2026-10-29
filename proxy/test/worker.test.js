import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker, { route, _resetTokenCache } from '../src/index.js';

const ENV = { TVDB_API_KEY: 'key', ALLOWED_ORIGINS: 'https://appassets.androidwebview.com' };
const ctx = { waitUntil: () => {} };
const call = (path, { env = ENV, headers = {}, method = 'GET' } = {}) =>
  worker.fetch(new Request(`https://proxy.example${path}`, { method, headers }), env, ctx);

// Fake TheTVDB: /login issues tokens; API calls require the current one.
let upstream;
beforeEach(() => {
  _resetTokenCache();
  upstream = { logins: 0, validToken: 'tok-1', calls: [] };
  vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
    const u = String(url);
    upstream.calls.push(u);
    if (u.endsWith('/v4/login')) {
      upstream.logins++;
      expect(JSON.parse(init.body)).toMatchObject({ apikey: 'key' });
      return Response.json({ data: { token: upstream.validToken } });
    }
    if (u.startsWith('https://artworks.thetvdb.com/')) {
      return new Response('img', { headers: { 'Content-Type': 'image/jpeg' } });
    }
    if (init.headers?.Authorization !== `Bearer ${upstream.validToken}`) return new Response('no', { status: 401 });
    return Response.json({ data: [{ name: 'Firefly' }], url: u });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('route', () => {
  const r = (p) => route(new URL(`https://proxy.example${p}`));
  it('maps the allowlisted endpoints onto TheTVDB', () => {
    expect(r('/search?query=dune&type=series')?.url).toBe('https://api4.thetvdb.com/v4/search?query=dune&limit=20&type=series');
    expect(r('/movies/123/extended')?.url).toBe('https://api4.thetvdb.com/v4/movies/123/extended');
    expect(r('/series/9/extended/')?.url).toBe('https://api4.thetvdb.com/v4/series/9/extended');
  });
  it('clamps the limit and drops unknown types', () => {
    expect(r('/search?query=x&limit=999&type=people')?.url).toBe('https://api4.thetvdb.com/v4/search?query=x&limit=50');
  });
  it('rejects everything else', () => {
    for (const p of ['/', '/login', '/search', '/movies/abc/extended', '/series/1', '/user/favorites',
      '/artwork?url=https://evil.example/x.jpg', '/artwork?url=http://artworks.thetvdb.com/x.jpg']) {
      expect(r(p), p).toBeNull();
    }
  });
});

describe('worker', () => {
  it('proxies a search, logging in once and reusing the token', async () => {
    const a = await call('/search?query=firefly');
    expect(a.status).toBe(200);
    expect((await a.json()).data[0].name).toBe('Firefly');
    await call('/series/1/extended');
    expect(upstream.logins).toBe(1);
  });

  it('re-logs in once when the cached token is rejected', async () => {
    await call('/search?query=a');
    upstream.validToken = 'tok-2'; // TheTVDB revoked the old token
    const res = await call('/search?query=b');
    expect(res.status).toBe(200);
    expect(upstream.logins).toBe(2);
  });

  it('adds CORS for allowed origins and answers preflight', async () => {
    const origin = { Origin: 'https://appassets.androidwebview.com' };
    const res = await call('/search?query=x', { headers: origin });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin.Origin);
    const pre = await call('/search', { method: 'OPTIONS', headers: origin });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
  });

  it('refuses unknown browser origins and non-GET methods', async () => {
    expect((await call('/search?query=x', { headers: { Origin: 'https://evil.example' } })).status).toBe(403);
    expect((await call('/search?query=x', { method: 'POST' })).status).toBe(405);
    expect(upstream.calls).toHaveLength(0);
  });

  it('enforces PROXY_TOKEN when configured', async () => {
    const env = { ...ENV, PROXY_TOKEN: 's3cret' };
    expect((await call('/search?query=x', { env })).status).toBe(401);
    expect((await call('/search?query=x', { env, headers: { Authorization: 'Bearer wrong' } })).status).toBe(401);
    expect((await call('/search?query=x', { env, headers: { Authorization: 'Bearer s3cret' } })).status).toBe(200);
  });

  it('serves TheTVDB artwork with CORS but nothing else', async () => {
    const ok = await call('/artwork?url=https://artworks.thetvdb.com/banners/x.jpg', {
      headers: { Origin: 'https://appassets.androidwebview.com' }
    });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Content-Type')).toBe('image/jpeg');
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('https://appassets.androidwebview.com');
    expect((await call('/artwork?url=https://example.com/x.jpg')).status).toBe(404);
  });

  it('answers 502 (not a crash) when TheTVDB login fails', async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response('bad key', { status: 401 }));
    const res = await call('/search?query=x');
    expect(res.status).toBe(502);
    expect(await res.text()).toMatch(/login failed \(401\)/);
  });

  it('never forwards the client Authorization header upstream', async () => {
    await call('/search?query=x', { env: { ...ENV, PROXY_TOKEN: 't' }, headers: { Authorization: 'Bearer t' } });
    const apiCall = vi.mocked(fetch).mock.calls.find(([u]) => String(u).includes('/search'));
    expect(apiCall?.[1]?.headers?.Authorization).toBe('Bearer tok-1');
  });
});
