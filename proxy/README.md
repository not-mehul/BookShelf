# BookShelf TheTVDB proxy (Cloudflare Worker)

A tiny Worker that lets BookShelf search TheTVDB **without putting your API key
on any device** and without a third-party CORS proxy. It holds the key as a
secret, logs in to TheTVDB, caches the bearer token, and forwards a fixed set
of read-only endpoints:

| Proxy path                        | TheTVDB                               |
| :-------------------------------- | :------------------------------------ |
| `GET /search?query=&type=&limit=` | `/v4/search` (type `movie`/`series`, limit ≤ 50) |
| `GET /movies/:id/extended`        | `/v4/movies/:id/extended`             |
| `GET /series/:id/extended`        | `/v4/series/:id/extended`             |
| `GET /series/:id/episodes/default?page=` | `/v4/series/:id/episodes/default` (also `official`; page ≤ 50) |
| `GET /artwork?url=…`              | cover images from `artworks.thetvdb.com` (adds CORS) |

Everything else is `404`; non-GET is `405`. Responses are edge-cached for an
hour. Browser requests are only accepted from `ALLOWED_ORIGINS` (with CORS);
requests without an `Origin` (e.g. the Android app's native HTTP) are allowed.

## Deploy

Needs a (free) Cloudflare account.

```bash
cd proxy
npm install
npx wrangler login
npx wrangler secret put TVDB_API_KEY      # your TheTVDB project key
npx wrangler secret put TVDB_PIN          # optional: subscriber PIN
npx wrangler secret put PROXY_TOKEN       # recommended: any long random string
npx wrangler deploy
```

`wrangler deploy` prints the Worker URL, e.g.
`https://bookshelf-tvdb-proxy.<you>.workers.dev`.

If you host the web app (PWA) somewhere, add its origin to `ALLOWED_ORIGINS`
in `wrangler.toml` (comma-separated) and redeploy. The Android app's origin is
already included.

## Use it in BookShelf

**Settings → TheTVDB:**

- **Proxy URL** — the Worker URL from above.
- **Proxy access token** — the `PROXY_TOKEN` you set (stored in the Android
  Keystore inside the app).

With a proxy URL set, the app no longer needs a TheTVDB API key or PIN.

> Set a `PROXY_TOKEN`. Without one, anyone who learns the Worker URL can
> spend your TheTVDB quota through it.

## Develop / test

```bash
npx wrangler dev --var TVDB_API_KEY:<key>   # local, in workerd
```

Unit tests live in `proxy/test/` and run with the main suite (`npm test` at
the repo root).
