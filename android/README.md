# BookShelf — Android (Capacitor)

The Android app is a [Capacitor 8](https://capacitorjs.com) project, set up the
same way as Ledger's. Capacitor's `BridgeActivity` hosts the web build in a
`WebView`; BookShelf's native features live in one plugin,
[`BookShelfPlugin.kt`](app/src/main/java/app/mehul/bookshelf/BookShelfPlugin.kt),
whose web side is `src/platform/native.ts`.

## Open & run

From the repo root, build the web app and copy it into this project:

```bash
npm ci
npm run sync            # vite build, then cap sync android
```

Then open this folder (`android/`) in **Android Studio 2026.2 (Rabbit)** or newer
and press **Run** (▶). Run `npm run sync` again after changing the web app.

From the command line (JDK 21):

```bash
./gradlew assembleDebug          # app/build/outputs/apk/debug/app-debug.apk
./gradlew testDebugUnitTest      # JVM unit tests
./gradlew lintDebug              # Android Lint
./gradlew assembleRelease        # R8-minified release APK (signed if keystore.properties exists)
```

For signed releases, copy `keystore.properties.example` to `keystore.properties`
(gitignored) and point it at your keystore. **Sign with the same key as the
version already on your phone**, or Android refuses the update and you would
have to uninstall (and lose the shelf) first.

> **App crashes on launch with `ClassNotFoundException: …MainActivity`?** The
> APK was built without the app's Kotlin code, which happens when
> `gradle.properties` sets `android.builtInKotlin=false` (Android Studio's AGP
> Upgrade Assistant adds it). The build stops with an explanation instead;
> remove the line and don't run the Upgrade Assistant's "built-in Kotlin" step.

## Your data across the move from the old shell

Until 0.5.0 BookShelf shipped a hand-built WebView shell. The Capacitor app keeps
everything that decides where data lives, so it installs over the old one as an
update and the shelf, settings, saved keys and sync folder carry over:

- the application id, `app.mehul.bookshelf`;
- the web origin, `https://appassets.androidwebview.com` (`server.hostname` in
  `capacitor.config.ts`): Android keys a WebView's IndexedDB and localStorage by
  origin, and Capacitor's default `https://localhost` would open an empty shelf;
- the Keystore key and preference names of `SecureStore`, `FolderSync`, the
  widget and the reminders.

CI proves it on every push: the emulator job installs a debug build of the old
shell (pinned by `OLD_SHELL_REF` in `.github/workflows/ci.yml`), stores a book, a
setting and an API key, installs the new build over it and checks all three
(`scripts/android-upgrade-test.mjs`).

## How it works

- **`MainActivity.kt`** — a `BridgeActivity` that registers `BookShelfPlugin`.
- **Edge-to-edge and the keyboard** — Capacitor's SystemBars (`insetsHandling:
  'css'`) publishes bar and cutout insets as `--safe-area-inset-*` CSS variables
  and pads the WebView above the keyboard. Bar icon colours follow the page's
  Dusk/Dawn theme (`SystemBars.setStyle`).
- **Predictive back** — the plugin's `OnBackPressedCallback` is enabled only while
  the page has a dialog open (Back closes it). Otherwise the system owns Back, so
  the back-to-home animation works.
- **Events** — `shared`, `openAdd`, `openEntry` and `back` are sent with
  Capacitor's retain-until-consumed flag, so text shared into a cold-started app
  reaches the page once it subscribes.
- Recovers from WebView renderer crashes by recreating the activity.

## Native features

| Feature | Where | Notes |
| :-- | :-- | :-- |
| **Native HTTP** | `NativeHttp.kt` | Lets book and TV search bypass WebView CORS, limited to an https allowlist of the app's API hosts. Bodies come back base64. |
| **Share into BookShelf** | `BookShelfPlugin.handleIntent` | `ACTION_SEND` `text/plain` filter ("Add to BookShelf"); `singleTask`, so shares reach the running app via `onNewIntent`. |
| **Barcode scanning** | `BarcodeScanner.kt` | Google Code Scanner (Play services): full camera UI, **no CAMERA permission**, EAN/UPC only. The module is fetched at install time. |
| **Secrets in the Keystore** | `SecureStore.kt` | AES-256-GCM key generated in the Android Keystore; prefs hold only `iv‖ciphertext`, with the setting name as associated data. Excluded from backup (the key never leaves the device). |
| **Encrypted folder sync** | `FolderSync.kt` | Storage Access Framework folder picker with a persisted permission; reads/writes `bookshelf-sync.json` via a temp-file swap. Encryption and merging happen in the page; this class only moves ciphertext. |
| **New-episode alerts** | `reminders/` | The page sends upcoming episodes of shows with alerts on; a WorkManager job (every 12 h) posts a notification on air day, works with the app closed. `POST_NOTIFICATIONS` is requested only when alerts are turned on; tapping opens the show. |
| **Exports and share images** | `Exports.kt` | Markdown/JSON exports and share-card PNGs are written to the cache and handed to the share sheet via `FileProvider`. |
| **Home-screen widget** | `widget/` | Jetpack Glance, `SizeMode.Responsive` (small / medium / large), Dusk/Dawn colours, "+" opens the add flow. The page pushes a summary (`widgetUpdate`) after every change. |

> **R8 note:** release builds keep `BookShelfWidget.provideGlance` via
> `proguard-rules.pro`; without it R8 strips the widget's whole UI from release
> builds only. CI checks the release APK for it and smoke-tests the minified
> build on an emulator.

## Configuration

| Setting                | Value                                  |
| :--------------------- | :------------------------------------- |
| Application ID         | `app.mehul.bookshelf`                  |
| minSdk                 | 26 (Android 8.0)                       |
| compileSdk / targetSdk | 37 (Android 17)                        |
| Capacitor              | 8                                      |
| AGP / Gradle           | 9.5 / 9.8 (built-in Kotlin)            |
| Kotlin                 | 2.4                                    |
| UI extras              | Jetpack Glance 1.2 (Compose compiler plugin), Play services Code Scanner |
| Release                | R8 minify + resource shrinking         |

API keys (TheTVDB, optional Google Books) are entered in the app's **Settings**
and stored encrypted in the Android Keystore, never compiled into the build.
Android Auto Backup includes the catalog (but not the Keystore-encrypted
secrets), so a reinstall or new phone restores the shelf; re-enter keys and the
sync passphrase afterwards.
