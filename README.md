# BookShelf

A personal catalog for books, films, and TV shows — searchable, ratable, exportable. A web app that also ships as a native Android application via a thin WebView shell (no Capacitor). Styled with *Editorial Dusk & Dawn* — a warm, two-theme editorial aesthetic.

- **Books** — Google Books search
- **Movies & TV** — TheTVDB v4
- **Storage** — Local IndexedDB (Dexie) with cached cover thumbnails
- **Export** — Markdown, grouped by type and sorted by rating
- **Themes** — Dusk (dark) / Dawn (light), honoring `prefers-color-scheme` on first load

## Quick start (development)

```bash
npm install
npm run dev
```

Open the shown localhost URL. Visit **Settings** and paste:

- A **TheTVDB API key** (project key from your TheTVDB account)
- Your **TheTVDB subscriber PIN** (if your project key uses end-user subscription funding)
- Optionally a **Google Books API key** (raises the daily quota)

Keys are stored locally. They never leave the device.

## Android

The native Android project lives in [`android-app/`](./android-app) — a standalone
Android Studio project that bundles the web build inside a `WebView`. See
[`android-app/README.md`](./android-app/README.md) for how to open, run, and
build an APK.

After changing the web app, refresh the bundled copy:

```bash
npm run android:assets   # vite build, then copy dist/ into android-app assets
```

The shell provides two native bridges (`src/util/android-bridge.js` wires them up):
native HTTP to bypass WebView CORS for TheTVDB, and a Markdown export/share path.
Both are feature-detected, so the same build runs unchanged in a plain browser.

## Project structure

```
src/
  api/
    books.js         Google Books client
    tvdb.js          TheTVDB v4 client (login + token cache)
    normalize.js     API responses → unified CatalogEntry shape
  db/
    database.js      Dexie schema + CRUD
  ui/
    theme.js         Dusk/Dawn toggle
    library.js       Library grid (sort, filter, type segmented)
    search.js        Search across books / movies / TV
    detail-modal.js  Entry detail + rating + notes
    settings.js      API key entry
    components.js    DOM helpers, segmented control, notices
    rating.js        5-star rating control
  export/
    markdown.js      DB → Markdown serializer
  util/
    settings.js      localStorage-backed settings
    android-bridge.js Native HTTP + export bridges (no-op in a browser)
    icons.js         Inlined Lucide icons
    thumbs.js        Cover blob caching
  styles/
    tokens.css       Both theme blocks (Dusk + Dawn)
    app.css          Component styles, glow layer
  main.js            Boot + tab routing
index.html
vite.config.js
android-app/         Native Android Studio project (WebView shell)
```

## Notes on the APIs

**TheTVDB v4** issues a bearer token from `/login` that lasts ~1 month. The client caches it and refreshes when it ages past 25 days, or whenever a request returns 401. Movies and series are both served from `/search`. On Android the request is routed through the native HTTP bridge to bypass WebView CORS.

**Google Books** requires no auth for basic use. Adding an API key raises the daily quota.

## Design system

Every color is a semantic CSS variable defined in `src/styles/tokens.css`. The `:root` block holds Dusk (dark, default). `[data-theme="light"]` holds Dawn (light). A literal hex outside those blocks is a bug. See `style.md` for the full reference.
