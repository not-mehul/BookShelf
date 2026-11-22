<p align="center"><img src="public/icon.svg" width="88" height="88" alt=""></p>

<h1 align="center">BookShelf</h1>

<p align="center"><em>Books, films, shows and the lines worth keeping.</em></p>

<p align="center">
  Android 10+&nbsp;·&nbsp;<a href="https://github.com/not-mehul/BookShelf/releases/latest">Latest release</a>&nbsp;·&nbsp;MIT&nbsp;·&nbsp;Created by <strong>Mehul Sen</strong>
</p>

---

BookShelf is a personal catalog for the books you read, the films and shows you watch, and the quotes you want to keep. Search for something, rate it, track where you are, and see your year in review. It is an Android app, for Android 10 and later, and the library lives on your device.

<p align="center">
  <img src="docs/screenshots/library.webp" width="200" alt="The library: shelf count, type tabs, Up next for a TV season and a quote from the shelf">
  <img src="docs/screenshots/entry.webp" width="200" alt="A book's page with its cover, author, genre and its place in a series">
  <img src="docs/screenshots/statistics.webp" width="200" alt="Statistics: the year in review with books and films finished per month">
  <img src="docs/screenshots/shelf-dawn.webp" width="200" alt="Library cards in the light Dawn theme with ratings, series and status">
</p>

## Features

### Add anything

- **Books** from Google Books, with Open Library as a fallback, by title, ISBN or a **scanned barcode**.
- **Films and TV** from TheTVDB, directly or through your own hosted proxy ([`proxy/`](proxy)), with cast and genres filled in when you open an entry.
- **Quotes** with author, source and page or time, linked to the book, film or show they come from. Each entry lists its quotes.
- **By hand**, when search comes up empty. Every entry can be edited afterwards.
- **Share into BookShelf** a highlight, title or link from any app, through the Android share sheet, to get a prefilled quote or search.

### Keep track

- **Status at a tap.** Four toggles, Wishlist, Reading or Watching, Completed, and Did not finish for the ones you put down on purpose.
- **Ratings in stars or out of 10.** Half stars by default; switch Settings → Ratings to _Out of 10_ for half points (7.5/10). Both views read the same ratings, and you can switch back and forth. Optional aspect scores (story, writing, acting and so on), notes, tags and collections.
- **A reading journal.** Starting and finishing are dated as they happen. A book's span is picked on one calendar (start, then finish), and a film or show takes one day.
- **TV by season.** One toggle per season, _Up next_ names the next one or says when an unaired season airs, and on Android you get **new-episode alerts**.
- **Series**, detected from titles or set by hand, with reading or watching order, what is next, any gaps, and a check for new installments.
- **A ranked queue.** Your wishlist in order (drag, keyboard or buttons), plus _pick something for me_ by type, length or genre.
- **Bulk edit.** Select several entries to change status, add or remove tags, or delete them.

### Look back

- **A year in review**: finished per month, pages in the books you finished, a yearly reading goal with its pace, the longest book and the highest rated.
- **All-time statistics**: totals, rating distribution, most-shelved authors and directors, decades and top genres.
- **Share cards.** Any book, film, show or quote as an image in the Dusk or Dawn style (post, square or story), or as text.
- **Little things.** A different kept quote at the top of the library each day, the library remembers its tab and sort, and `/` jumps to the filter. Finishing something earns a little confetti, there is an idle cat to play with, and four easter eggs are counted in Settings.

### Your data

- **On your device.** Everything lives in local storage with cached cover thumbnails.
- **Backup and restore** as lossless JSON (re-importing never duplicates), plus a readable Markdown export.
- **Weekly backups**: once a week a dated copy goes to Documents/BookShelf/Backups, keeping the last five, with nothing to set up. Settings shows when it last ran.
- **Bring your shelf over** from Goodreads or StoryGraph (their CSV export) or Letterboxd (the export zip, as it is). Ratings, shelves, read dates, reviews and tags come with it, all on the device. Anything already on your shelf only gains what it was missing, so importing twice adds nothing.
- **Encrypted sync**: end-to-end encrypted sync through a folder you choose, such as Google Drive, Nextcloud or Syncthing.
- **A home-screen widget**: shelf count, what you are reading or watching, and your latest quote.
- **Secrets in the Android Keystore.** API keys, tokens and the sync passphrase are encrypted with a hardware-backed key.
- **Links from the other apps.** Rosetta and the other apps open `bookshelf://log?title=…&author=…` to log a book: BookShelf searches for it and adds the one you pick, with the sender's note if it has one. `bookshelf://quote?text=…&title=…&author=…&where=…&note=…` opens the quote form filled in, for you to save. `bookshelf://open` just opens it.
- **Themes.** System, Dusk (dark) or Dawn (light).

## Private by design

Your catalog never leaves the device. BookShelf talks to a catalog only when you search, and if you turn on sync, it writes one end-to-end encrypted file to the folder you chose. There are no accounts and no BookShelf server.

## Install

Download the signed APK from the [latest release](https://github.com/not-mehul/BookShelf/releases/latest) and open it on your phone. BookShelf needs Android 10 or later.

Then open **Settings** and add a **TheTVDB API key** (and subscriber PIN, if your key needs one) for films and TV, or the URL of your [TheTVDB proxy](proxy). A **Google Books API key** is optional and raises the daily quota.

## The Dusk & Dawn apps

BookShelf is one of five apps by Mehul Sen that share one design system, [Editorial Dusk & Dawn](https://github.com/not-mehul/dusk-dawn), and a common link scheme, so they can hand things to each other.

| App                                                 | What it is for                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------- |
| [Waymark](https://github.com/not-mehul/Waymark)     | Your whole trip, offline: flights, stays, plans and costs on one timeline |
| [BookShelf](https://github.com/not-mehul/BookShelf) | Books, films, shows and the lines worth keeping                           |
| [Ledger](https://github.com/not-mehul/Ledger)       | A record of cities, scored on what matters to you                         |
| [Rosetta](https://github.com/not-mehul/Rosetta)     | A quiet library and reader for books, papers and notes                    |
| [Mise](https://github.com/not-mehul/Mise)           | Recipes from anywhere, cooked one step at a time                          |

## Build from source

Svelte 5 and TypeScript, built by Vite into a single self-contained page, with Dexie for storage and a Capacitor 8 Android app around it. You need Node 22.12 or later.

```sh
npm install
npm run dev          # the UI in a browser, for development (no search, sync or sharing)
npm run check        # tokens, lint, typecheck, unit tests and build
npm run sync         # build, then copy it into the Android project
npm run android:apk  # a debug APK, in android/app/build/outputs/apk/debug/
```

[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) covers the scripts, the Android app, the project structure, the APIs and the tests. [RELEASING.md](RELEASING.md) covers signing and releases.

## Credits

BookShelf is designed and built by **Mehul Sen** ([@not-mehul](https://github.com/not-mehul)).

- Catalog data: [Google Books](https://books.google.com), [Open Library](https://openlibrary.org) and [TheTVDB](https://thetvdb.com).
- Icons: [Lucide](https://lucide.dev), ISC.
- Fonts and design: Fraunces (SIL Open Font License) through [dusk-dawn](https://github.com/not-mehul/dusk-dawn).

## Licence

[MIT](LICENSE) © 2026 Mehul Sen.
