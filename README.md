# BookShelf

A personal catalog for books, films, TV shows, and quotes — searchable, ratable, exportable. A web app (installable as a PWA) that also ships as a native Android application via a thin WebView shell (no Capacitor). Styled with *Editorial Dusk & Dawn* — a warm, two-theme editorial aesthetic.

- **Books** — Google Books search, with an Open Library fallback and ISBN lookup
- **Movies & TV** — TheTVDB v4 (cast/genre enrichment on open)
- **Quotes** — manual entry with author + source
- **Manual entry** — add anything by hand when search comes up empty, and edit any entry afterward
- **Organize** — 5-star ratings, status, reading/watching progress bars, free-form notes, and tags/collections
- **Statistics** — totals, rating distribution, top genres, activity
- **Storage** — local IndexedDB (Dexie) with cached cover thumbnails; nothing leaves the device
- **Backup** — lossless JSON export/import (re-importable without duplicates) plus human-readable Markdown export
- **Share** — share a single entry via the system share sheet / Web Share API
- **Themes** — Dusk (dark) / Dawn (light), honoring `prefers-color-scheme` on first load

## Quick start (development)

Requires **Node 22.12+** (Node 24 LTS recommended — see `.nvmrc`).

```bash
npm install
npm run dev
```

Open the shown localhost URL. Open **Settings** (gear, top-right) and paste:

- A **TheTVDB API key** (project key from your TheTVDB account)
- Your **TheTVDB subscriber PIN** (if your project key uses end-user subscription funding)
- Optionally a **Google Books API key** (raises the daily quota)

> **Privacy:** API keys, the cached TheTVDB token, and all catalog data are stored
> locally (localStorage + IndexedDB) in plain form on the device. They are never
> transmitted anywhere except directly to the respective API when you search.

In a plain browser, TheTVDB blocks cross-origin requests; set a CORS proxy base
URL under Settings → Browser Compatibility to enable movie/TV search. The Android
app does not need this.

## Scripts

```bash
npm run dev          # Vite dev server
npm run build        # production build (single self-contained index.html)
npm run test         # Vitest unit tests
npm run lint         # ESLint
npm run format       # Prettier (write)
npm run check        # lint + test + build (what CI runs)
npm run android:assets  # build, then copy dist/ into the Android assets (cross-platform)
```

Toolchain: Vite 8 (Rolldown), Vitest 5, ESLint 10 (flat config), Prettier 3, Dexie 4.

## Android

The native Android project lives in [`android-app/`](./android-app) — a standalone
Android Studio project that bundles the web build inside a `WebView`. See
[`android-app/README.md`](./android-app/README.md) for how to open, run, and
build an APK.

The shell is Kotlin on AGP 9.5 / Gradle 9.8, targeting Android 17 (API 37). It
draws edge-to-edge, supports predictive back (Back closes an open modal), and
talks to the page over a single origin-scoped message channel
(`src/platform/native.js` ↔ `NativeBridge.kt`): native HTTP to bypass WebView
CORS (restricted to the app's API hosts), file export/share, and theme / back
signalling. Everything is feature-detected, so the same build runs unchanged in
a plain browser.

## Project structure

```
src/
  api/
    books.js         Google Books client
    openlibrary.js   Open Library client + ISBN detection
    tvdb.js          TheTVDB v4 client (login, token cache, extended enrichment)
    normalize.js     API responses → unified CatalogEntry shape
  db/
    database.js      Dexie schema (v2) + CRUD + tag index
  ui/
    theme.js         Dusk/Dawn toggle
    library.js       Library grid (sort, filter, full-text search, tag chips)
    add-flow.js      Add modal: choose medium → search / manual / quote
    detail-modal.js  Modal system (native <dialog>) + entry detail/edit/rating/progress/tags/share
    stats.js         Statistics overview modal
    settings.js      API keys + JSON/Markdown backup & restore
    forms.js         Shared form-field builders
    components.js    DOM helpers, segmented control, cover images
    rating.js        5-star rating control (radiogroup)
  export/
    markdown.js      DB → Markdown serializer
    import.js        Markdown parser (best-effort)
    json.js          Lossless JSON backup / restore
    share.js         Single-entry share
  platform/
    native.js        Android shell bridge: native HTTP, export, theme, back (no-op in a browser)
  util/
    settings.js      localStorage-backed settings
    icons.js         Inlined Lucide icons
    thumbs.js        Cover blob fetch + downscale
  styles/
    tokens.css       Both theme blocks (Dusk + Dawn)
    app.css          Component styles, glow layer
  main.js            Boot + service-worker registration
public/
  manifest.webmanifest, sw.js, icon.svg   PWA assets
scripts/
  sync-android-assets.mjs  Copies dist/ into the Android app's assets
test/                Vitest unit tests
index.html
android-app/         Native Android Studio project (WebView shell)
```

## Notes on the APIs

**TheTVDB v4** issues a bearer token from `/login` that lasts ~1 month. The client caches it and refreshes when it ages past 25 days, or whenever a request returns 401. Movies and series are both served from `/search`; opening a saved entry enriches it with cast/genre from `/extended`. On Android the request is routed through the native HTTP bridge to bypass WebView CORS.

**Google Books** requires no auth for basic use; an API key raises the daily quota. **Open Library** is keyless and used as a fallback and for ISBN lookups.

## Testing & CI

Web unit tests (Vitest) cover API normalization, ISBN detection, the Markdown parser, share formatting, and the native bridge protocol (against a simulated shell). Android JVM tests cover the bridge's host allowlist and export-filename sanitizing.

GitHub Actions (`.github/workflows/ci.yml`) runs two jobs on every push and PR:

- **Web** — lint, tests, build, and a check that the committed Android assets match a fresh build.
- **Android** — JVM unit tests, Android Lint, and debug + R8 release builds.

## Design system

Every color is a semantic CSS variable defined in `src/styles/tokens.css`. The `:root` block holds Dusk (dark, default). `[data-theme="light"]` holds Dawn (light). A literal hex outside those blocks is a bug. See `style.md` for the full reference.
