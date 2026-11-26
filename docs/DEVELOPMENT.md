# Developing BookShelf

How BookShelf is built, run and tested. For what the app does, see the [README](../README.md); for cutting a release, see [RELEASING.md](../RELEASING.md).

## Quick start (development)

Requires **Node 22.12+** (Node 24 LTS recommended — see `.nvmrc`).

```bash
npm install
npm run dev
```

BookShelf is an Android app (Android 10+); `npm run dev` runs its UI in a
browser so you can work on it. Search, the backup, sharing and the barcode
scanner go through the Android shell, so try those in the app (`npm run android:run`)
or in the e2e suite's simulated shell. A production build opened in a browser
only says that BookShelf is an Android app.

In the app, open **Settings** (gear, top-right) and paste:

- A **TMDB API key** or read access token (free with a TMDB account, under Settings → API on themoviedb.org)
- Optionally a **Google Books API key** (raises the daily quota)

> **Privacy:** catalog data lives locally in IndexedDB. API keys and the backup
> passphrase are encrypted with an Android Keystore key
> (under `npm run dev`, outside the app, they sit in localStorage). Nothing is sent
> anywhere except to the respective API when you search — and, if you turn on
> the backup, an end-to-end encrypted file to the folder you chose.

## Scripts

```bash
npm run dev          # Vite dev server (the UI only, outside the app)
npm run build        # production build (single self-contained index.html)
npm run test         # Vitest unit tests
npm run test:e2e     # Playwright smoke tests on the built app, phone-sized
npm run test:visual  # screenshots of the main screens in Dusk and Dawn (-- --update-snapshots to accept)
npm run typecheck    # TypeScript checks the JS (checkJs + JSDoc types)
npm run lint         # ESLint, Stylelint (type scale, breakpoints, gap tokens), literal colours
npm run format       # Prettier (write)
npm run check        # tokens + lint + typecheck + test + build (what CI runs on each push)
npm run sync         # build, then copy it into the Android project (cap sync android)
npm run android      # sync, then open Android Studio
npm run android:apk  # sync, then a debug APK (android/app/build/outputs/apk/debug/)
npm run android:run  # sync, then install and run on a connected phone
```

Toolchain: Svelte 5 (runes), TypeScript 6 (strict, checked by svelte-check), Vite 8
(Rolldown), Vitest 5, Playwright, ESLint 10 (flat config, typescript-eslint,
eslint-plugin-svelte), Prettier 3, Dexie 4. The same stack as Ledger.

For `test:e2e` and `test:visual`, Playwright downloads Chromium on first run (`npx playwright install chromium`),
or point `PW_CHROMIUM_PATH` at an existing Chromium.

## Android

The Android app is a Capacitor 8 project in [`android/`](../android), set up like
Ledger's: Capacitor hosts the web build, and one Kotlin plugin
(`BookShelfPlugin.kt` ↔ `src/platform/native.ts`) adds native HTTP to bypass
WebView CORS (restricted to the app's API hosts), file export/share, predictive
Back, and the Keystore, barcode scanner, backup folder, new-episode alerts and the
home-screen widget. The app supports Android 10 (API 29) and later. See [`android/README.md`](../android/README.md) for
how to build and run it, and how your data carries over from the old WebView
shell.

## Project structure

```
src/
  main.ts            Boot: theme, shelf, mount, share/widget events, scheduled backup (outside the app: a notice)
  components/        Svelte 5 UI (runes)
    App.svelte       Header (Stats, Queue, Settings), library, add button, the one dialog
    Library.svelte   Grid or list: type tabs, filter, sort, tag chips, the overflow menu, selection mode;
                     a tab draws its first entries at once and the rest a batch a frame
    HomeStrip.svelte Up next for TV seasons and the day's quote, one card each, above the shelf
    EntryCard.svelte, Stars.svelte, PlaceholderCover.svelte, OverflowMenu.svelte, RatingControl.svelte, …
    Modal.svelte     The native <dialog> every view opens in: a bottom sheet below 900px with a sticky
                     title bar (handle, back, title once scrolled, actions, close); focus, Escape, Android Back;
                     rises on open and slides back down on close
    entry/           Entry detail, edit form, series, quotes, tags, episodes, alerts
    add/             Add flow: medium → search / manual / quote
    settings/        Preferences: appearance (theme, rating scale), backup, your data (restore, import,
                     Library refresh, duplicate check), search keys (checked as they are entered)
    stats/           Statistics parts: the month chart, bar lists
    Queue.svelte, BulkEdit.svelte, Stats.svelte, ShareCard.svelte
  state/
    shelf.svelte.ts  Every entry, reloaded after each change; pushes widget + alerts
    ui.svelte.ts     Which dialog is open
  api/
    books.ts         Google Books client
    key-check.ts     Trying a pasted API key against its service
    openlibrary.ts   Open Library client + ISBN detection
    tmdb.ts          TMDB v3 client (search, details with credits, seasons, find by TheTVDB id)
    tmdb-move.ts     One-time move of films and shows from TheTVDB ids to TMDB
    match.ts         Find a match: catalog candidates, the sure pick, filling only empty fields
    refresh.ts       Library refresh: what each entry is missing, a proposal for each, what was left as is
    normalize.ts     API responses → unified CatalogEntry shape
    episode-sync.ts  Episode-guide refresh + Android reminder schedule
  db/
    database.ts      Dexie schema (v4: tags, tombstones, quote links) + CRUD; patchEntry for safe edits
  share/
    card.ts          Canvas share-card renderer (palette read from the tokens)
    layout.ts        Text wrapping / fit-to-box (pure)
    share-image.ts   Share cards to the Android share sheet
  export/
    json.ts          Restoring a BookShelf backup file
    share.ts         Single-entry share
  platform/
    native.ts        Android shell (BookShelf Capacitor plugin): native HTTP, calls, events, export, theme, back
    theme.svelte.ts  System / Dusk / Dawn: saved choice, else the OS setting, applied before first paint
    widget.ts        Builds the home-screen widget's summary; applies episodes ticked on it
  sync/
    crypto.ts        gzip + PBKDF2 / AES-256-GCM envelope (WebCrypto)
    fields.ts        Field-level change times (fieldTimes) and the per-group merge of two copies
    merge.ts         Snapshot merge: entries field by field, deletion tombstones (pure)
    sync.ts          Pull → merge → push orchestration; the backup schedule (daily, weekly, monthly, off)
  util/              Pure helpers: settings, share intake, barcode, stars, series, duplicates,
                     queue ranks, episodes, bulk edits, entry matching, icons, covers
  styles/
    app.css          App styles; imports dusk-dawn/tokens.css and dusk-dawn/components.css first
  types.d.ts         Shared data types (CatalogEntry, …)
public/
  icon.svg           The app icon: three covers fanned out, the front one starred (README, favicon;
                     the Android launcher icon is the same drawing in res/drawable)
test/                Vitest unit tests
e2e/                 Playwright smoke tests (+ a simulated Android shell)
index.html
capacitor.config.ts  App id, web origin, SystemBars
android/             Capacitor Android project (BookShelfPlugin and native features)
```

## Notes on the APIs

**TMDB v3** takes the user's own key: a v3 API key goes in the `api_key` parameter, a v4 read access token (a JWT) as a bearer token. Films and shows are searched separately (`/search/movie`, `/search/tv`) in English, with genre names from `/genre/*/list`; opening a saved entry fills in the director or creators and genres from `/movie/{id}` or `/tv/{id}` with credits. A show's guide is every season from `/tv/{id}/season/{n}`. Shelf ids are `tmdb:<id>`; a bare number on a film or show is a TheTVDB id from before the move, which `tmdb-move.ts` resolves (`/find/{tvdb id}?external_source=tvdb_id` for shows, a single title-and-year match for films). About carries the attribution TMDB's terms require.

**Google Books** requires no auth for basic use; an API key raises the daily quota. **Open Library** is keyless and used as a fallback and for ISBN lookups.

## Testing & CI

- **Unit (Vitest)** — API normalization (incl. paginated episode guides), ISBN
  detection, share intake, the native bridge protocol and
  back-handler stack, Keystore routing, sync encryption and merge (plus an
  end-to-end sync between two simulated devices), the widget summary, half-star
  ratings, series detection, queue ranking and picks, episode progress,
  share-card text layout, bulk tag edits, the move from TheTVDB to TMDB, what
  Library refresh looks for, and the backup schedule.
- **E2E (Playwright)** — the built app at phone size, in a
  simulated Android shell (`e2e/fake-shell.js`, standing in for Capacitor's native layer), with a fixture shelf
  (`e2e/fixtures/shelf.json`) imported through Settings: modals and focus, adding
  entries, share-into, Back, insets, Keystore, barcode scan, widget, backup, half
  stars, quote links, series, queue, bulk edit, TV episodes, alerts, share cards,
  Library refresh, and a big shelf drawn in batches.
- **Screenshots (Playwright)** — `e2e/visual.spec.js` takes the library (grid, list,
  menu), a book, a show, a quote, adding, Settings, Statistics and the queue in Dusk
  and Dawn at phone size, and the library and a book at tablet width, from
  `e2e/fixtures/visual-shelf.json`. Fonts (`e2e/fonts`), the clock, the time zone and
  motion are pinned so a run matches the baselines in `e2e/__screenshots__`. Take
  baselines on Linux, or from CI (Run workflow with _update screenshots_ ticked, then
  commit the uploaded artifact).
- **Android (JVM)** — native HTTP host allowlist, filename sanitizing and MIME types,
  Keystore name validation, the widget summary contract, and which new-episode
  alerts are due.

GitHub Actions (`.github/workflows/ci.yml`) runs `npm run check` (tokens, colours,
lint, typecheck, unit tests, build) on every push to main and every pull request,
and the screenshot tests on every pull request. The Playwright suite and an Android debug build run only when the workflow is
started by hand (Actions → CI → Run workflow). The release workflow builds the
signed APK on each version tag and checks that R8 kept the plugin, widget UI and
reminder worker.

## Design system

BookShelf uses Editorial Dusk & Dawn from the [`dusk-dawn`](https://github.com/not-mehul/dusk-dawn) package, shared with Waymark, Ledger, Rosetta and Mise: the tokens, Fraunces, the shared component styles and the `IconTabs` (compact, §8.5.2), `Select` and `Toast` components, and the sheet (§8.11), menu and settings-row patterns. The theme is chosen in Settings → Appearance. Every color is a semantic CSS variable from `dusk-dawn/tokens.css`. The `:root` block holds Dusk (dark, default). `[data-theme="light"]` holds Dawn (light). `dusk-dawn colours` (part of `npm run lint`) fails on any literal color in `src/`, Stylelint (`stylelint.config.js`) keeps font sizes on the type scale, media queries on the 640px and 900px breakpoints and gaps on the spacing tokens, and `dusk-dawn check` tests contrast in both themes. To change the design, change the package and move its tag in `package.json` (`style.md` §18 in the package).
