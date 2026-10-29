# BookShelf

A personal catalog for books, films, TV shows, and quotes — searchable, ratable, exportable. A web app (installable as a PWA) that also ships as a native Android application via a thin WebView shell (no Capacitor). Styled with *Editorial Dusk & Dawn* — a warm, two-theme editorial aesthetic.

- **Books** — Google Books search, with an Open Library fallback, ISBN lookup and **barcode scanning**
- **Movies & TV** — TheTVDB v4 (cast/genre enrichment on open), directly or through your own **hosted proxy** ([`proxy/`](./proxy))
- **Quotes** — manual entry with author + source
- **Manual entry** — add anything by hand when search comes up empty, and edit any entry afterward
- **Organize** — 5-star ratings, status, reading/watching progress bars, free-form notes, and tags/collections
- **Statistics** — totals, rating distribution, top genres, activity
- **Storage** — local IndexedDB (Dexie) with cached cover thumbnails; nothing leaves the device
- **Backup** — lossless JSON export/import (re-importable without duplicates) plus human-readable Markdown export
- **Share** — share a single entry via the system share sheet / Web Share API
- **Share *into* BookShelf** — share a highlight, title or link from any app (Android share sheet, or the installed PWA's share target) to get a prefilled quote or search
- **Encrypted sync** (Android) — end-to-end encrypted sync through a folder you choose (Google Drive, Nextcloud, Syncthing…)
- **Home-screen widget** (Android) — resizable: shelf count, what you're reading/watching with progress, latest quote
- **Secrets in the Android Keystore** — API keys, tokens and the sync passphrase are encrypted with a hardware-backed key
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

Or, instead of a TheTVDB key on every device, deploy the [TheTVDB proxy](./proxy)
and enter its URL (and access token) under Settings → TheTVDB.

> **Privacy:** catalog data lives locally in IndexedDB. In the Android app, API
> keys, the TheTVDB token and the sync passphrase are encrypted with an Android
> Keystore key; in a plain browser they sit in localStorage. Nothing is sent
> anywhere except to the respective API when you search — and, if you enable
> sync, an end-to-end encrypted file to the folder you chose.

In a plain browser, TheTVDB blocks cross-origin requests: use the TheTVDB proxy,
or set a generic CORS proxy under Settings → Browser Compatibility. The Android
app needs neither.

## Scripts

```bash
npm run dev          # Vite dev server
npm run build        # production build (single self-contained index.html)
npm run test         # Vitest unit tests (web + proxy)
npm run test:e2e     # Playwright smoke tests on the built app, phone-sized
npm run typecheck    # TypeScript checks the JS (checkJs + JSDoc types)
npm run lint         # ESLint
npm run format       # Prettier (write)
npm run check        # lint + typecheck + test + build
npm run android:assets  # build, then copy dist/ into the Android assets (cross-platform)
```

Toolchain: Vite 8 (Rolldown), TypeScript 7 (type-checking only), Vitest 5,
Playwright, ESLint 10 (flat config), Prettier 3, Dexie 4.

For `test:e2e`, Playwright downloads Chromium on first run (`npx playwright install chromium`),
or point `PW_CHROMIUM_PATH` at an existing Chromium.

## Android

The native Android project lives in [`android-app/`](./android-app) — a standalone
Android Studio project that bundles the web build inside a `WebView`. See
[`android-app/README.md`](./android-app/README.md) for how to open, run, and
build an APK.

The shell is Kotlin on AGP 9.5 / Gradle 9.8, targeting Android 17 (API 37). It
draws edge-to-edge, supports predictive back (Back closes an open modal), and
talks to the page over a single origin-scoped message channel
(`src/platform/native.js` ↔ `NativeBridge.kt`): native HTTP to bypass WebView
CORS (restricted to the app's API hosts), file export/share, theme / back
signalling, and RPCs for the Keystore, barcode scanner, folder sync and the
widget. Everything is feature-detected, so the same build runs unchanged in a
plain browser.

## Project structure

```
src/
  api/
    books.js         Google Books client
    openlibrary.js   Open Library client + ISBN detection
    tvdb.js          TheTVDB v4 client (login, token cache, extended enrichment)
    normalize.js     API responses → unified CatalogEntry shape
  db/
    database.js      Dexie schema (v3: tags index, tombstones) + CRUD
  ui/
    theme.js         Dusk/Dawn toggle
    library.js       Library grid (sort, filter, full-text search, tag chips)
    add-flow.js      Add modal: choose medium → search / manual / quote
    detail-modal.js  Modal system (native <dialog>) + entry detail/edit/rating/progress/tags/share
    stats.js         Statistics overview modal
    settings.js      API keys, proxy, sync setup, JSON/Markdown backup & restore
    forms.js         Shared form-field builders
    components.js    DOM helpers, segmented control, cover images
    rating.js        5-star rating control (radiogroup)
  export/
    markdown.js      DB → Markdown serializer
    import.js        Markdown parser (best-effort)
    json.js          Lossless JSON backup / restore
    share.js         Single-entry share
  platform/
    native.js        Android shell bridge: native HTTP, RPC, events, export, theme, back
    widget.js        Builds the home-screen widget's summary
  sync/
    crypto.js        gzip + PBKDF2 / AES-256-GCM envelope (WebCrypto)
    merge.js         Last-writer-wins merge with deletion tombstones (pure)
    sync.js          Pull → merge → push orchestration, auto-sync
  util/
    settings.js      Settings; secrets routed to the Android Keystore
    share-intake.js  Parses text shared into the app into prefill values
    barcode.js       ISBN scanning (native scanner / BarcodeDetector)
    icons.js         Inlined Lucide icons
    thumbs.js        Cover blob fetch + downscale
  styles/
    tokens.css       Both theme blocks (Dusk + Dawn)
    app.css          Component styles, glow layer
  types.d.ts         Shared data types (CatalogEntry, …) for type-checking
  main.js            Boot, share/widget events, auto-sync, service worker
public/
  manifest.webmanifest, sw.js, icon.svg   PWA assets
scripts/
  sync-android-assets.mjs  Copies dist/ into the Android app's assets
test/                Vitest unit tests
e2e/                 Playwright smoke tests (+ a simulated Android shell)
proxy/               Cloudflare Worker proxying TheTVDB (see proxy/README.md)
index.html
android-app/         Native Android Studio project (WebView shell)
```

## Notes on the APIs

**TheTVDB v4** issues a bearer token from `/login` that lasts ~1 month. The client caches it and refreshes when it ages past 25 days, or whenever a request returns 401. Movies and series are both served from `/search`; opening a saved entry enriches it with cast/genre from `/extended`. On Android the request is routed through the native HTTP bridge to bypass WebView CORS.

**Google Books** requires no auth for basic use; an API key raises the daily quota. **Open Library** is keyless and used as a fallback and for ISBN lookups.

## Testing & CI

- **Unit (Vitest)** — API normalization, ISBN detection, Markdown parsing, share
  formatting and share intake, the native bridge protocol, Keystore routing,
  sync encryption and merge (plus an end-to-end sync between two simulated
  devices), the widget summary, and the TheTVDB proxy Worker.
- **E2E (Playwright)** — the built app at phone size, in a plain browser and in a
  simulated Android shell (`e2e/fake-shell.js`): modals and focus, adding
  entries, share-into, Back, insets, Keystore, barcode scan, widget, sync.
- **Android (JVM)** — bridge host allowlist and filename sanitizing, Keystore
  name validation, and the widget summary contract.

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and PR:

- **Web** — lint, typecheck, unit tests, build, and a check that the committed Android assets match a fresh build.
- **E2E** — Playwright smoke tests (report uploaded on failure).
- **Android** — JVM tests, Android Lint, debug + R8 release builds, and a guard that R8 kept the widget UI.

## Design system

Every color is a semantic CSS variable defined in `src/styles/tokens.css`. The `:root` block holds Dusk (dark, default). `[data-theme="light"]` holds Dawn (light). A literal hex outside those blocks is a bug. See `style.md` for the full reference.
