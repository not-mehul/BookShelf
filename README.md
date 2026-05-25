# BookShelf

A personal catalog for books, films, and TV shows — searchable, ratable, exportable. Designed for offline use on Android, packaged from a web app via Capacitor. Styled with *Editorial Dusk & Dawn* — a warm, two-theme editorial aesthetic.

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

## Build for Android

Requires Android Studio + the Android SDK on the build machine.

```bash
# One-time: add the native Android project
npm install
npx cap add android

# Each time you change the web app:
npm run android:build   # vite build + cap sync
npx cap open android    # opens Android Studio — build & run from there
```

`CapacitorHttp` is enabled in `capacitor.config.ts` — fetch calls route through native HTTP and bypass WebView CORS. Required for TheTVDB.

To produce a signed `.aab` / `.apk` for sideloading: use Android Studio's *Build → Generate Signed Bundle / APK* flow.

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
    settings.js      Capacitor Preferences (with localStorage fallback)
    icons.js         Inlined Lucide icons
    thumbs.js        Cover blob caching
  styles/
    tokens.css       Both theme blocks (Dusk + Dawn)
    app.css          Component styles, glow layer
  main.js            Boot + tab routing
index.html
capacitor.config.ts
vite.config.js
```

## Notes on the APIs

**TheTVDB v4** issues a bearer token from `/login` that lasts ~1 month. The client caches it via Capacitor Preferences (or localStorage in the browser) and refreshes when it ages past 25 days, or whenever a request returns 401. Movies and series are both served from `/search`.

**Google Books** requires no auth for basic use. Adding an API key raises the daily quota.

## Design system

Every color is a semantic CSS variable defined in `src/styles/tokens.css`. The `:root` block holds Dusk (dark, default). `[data-theme="light"]` holds Dawn (light). A literal hex outside those blocks is a bug. See `style.md` for the full reference.
