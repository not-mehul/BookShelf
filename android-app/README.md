# BookShelf — Android (native WebView shell)

A standalone Android Studio project that packages the BookShelf web app as an
installable Android application. **No Capacitor.** It is a thin Kotlin shell:
the built web app is bundled in `app/src/main/assets/` and served inside a
`WebView` over a real secure origin via `WebViewAssetLoader`.

## Open & run

1. Open **Android Studio 2026.2 (Rabbit)** or newer — the project uses AGP 9.4,
   the newest version that release supports.
2. **File → Open…** and select this folder (`android-app`).
3. Let Gradle sync. Android Studio writes `local.properties` with your SDK path
   and offers to install SDK Platform 37 if it is missing — accept.
4. Pick a device or emulator and press **Run** (▶).

> **Sync fails with "Plugin … was not found" or "Could not resolve …"?** Gradle
> is probably in **offline mode**, which can only use dependencies already in
> your local cache. Turn it off — Gradle tool window → the *Toggle Offline Mode*
> button (or *Settings → Build, Execution, Deployment → Gradle*) — and sync
> again (*File → Sync Project with Gradle Files*). The first sync downloads
> everything; offline mode works afterwards.

From the command line (JDK 17+; Gradle provisions JDK 21 for its daemon):

```bash
./gradlew assembleDebug          # app/build/outputs/apk/debug/app-debug.apk
./gradlew testDebugUnitTest      # JVM unit tests
./gradlew lintDebug              # Android Lint
./gradlew assembleRelease        # R8-minified, unsigned release APK
```

For a signed release: **Build → Generate Signed App Bundle / APK** (or add a
`signingConfig`). Play distribution expects an `.aab` (`./gradlew bundleRelease`).

## How it works

- **`MainActivity.kt`** — a `ComponentActivity` that serves `app/src/main/assets/`
  over `https://appassets.androidwebview.com`. An https origin (rather than
  `file://`) is what makes IndexedDB and localStorage reliable.
  - **Edge-to-edge:** `enableEdgeToEdge()` with transparent system bars. Bar and
    cutout insets are handed to the page as `--inset-*` CSS variables; the
    keyboard (IME) inset shrinks the WebView so focused inputs stay visible.
  - **Predictive back:** an `OnBackPressedCallback` is enabled only while the page
    has a modal open (Back closes it). Otherwise the system owns Back, so the
    back-to-home animation works.
  - **Theme:** status/navigation-bar icon colours follow the page's Dusk/Dawn
    theme; the launch window matches the system light/dark setting.
  - Recovers from WebView renderer crashes instead of crashing the app.
- **`NativeBridge.kt`** — one JSON message channel, `window.BookShelfNative`,
  registered with `WebViewCompat.addWebMessageListener` and **restricted to the
  app's own origin** (unlike the legacy `addJavascriptInterface`). It provides:
  - native HTTP (coroutines on `Dispatchers.IO`) so cross-origin API calls bypass
    WebView CORS — limited to an https allowlist of the app's API hosts;
  - file export through `FileProvider` and the system share sheet;
  - theme and back-handler signalling;
  - an RPC registry (`register(name) { … }`) for the features below, and
    events (`emit`) that are queued until the page reports it is ready.

  The web side is `src/platform/native.js`. Every feature is detected at runtime,
  so the identical web build still runs in a plain browser.

## Native features

| Feature | Where | Notes |
| :-- | :-- | :-- |
| **Share into BookShelf** | `MainActivity.handleIntent` | `ACTION_SEND` `text/plain` filter ("Add to BookShelf"); `singleTask`, so shares reach the running app via `onNewIntent`. Queued until the page is ready. |
| **Barcode scanning** | `BarcodeScanner.kt` | Google Code Scanner (Play services) — full camera UI, **no CAMERA permission**, EAN/UPC only. The module is fetched at install time. |
| **Secrets in the Keystore** | `SecureStore.kt` | AES-256-GCM key generated in the Android Keystore; prefs hold only `iv‖ciphertext`, with the setting name as associated data. Excluded from backup (the key never leaves the device). |
| **Encrypted folder sync** | `FolderSync.kt` | Storage Access Framework folder picker with a persisted permission; reads/writes `bookshelf-sync.json` via a temp-file swap. Encryption and merging happen in the page — this class only moves ciphertext. |
| **New-episode alerts** | `reminders/` | The page sends upcoming episodes of shows with alerts on; a WorkManager job (every 12 h) posts a notification on air day, works with the app closed, no network needed. `POST_NOTIFICATIONS` is requested only when alerts are turned on; tapping opens the show. |
| **Share images** | `NativeBridge.shareFile` | Share-card PNGs (and Markdown/JSON exports) are written to the cache and handed to the share sheet via `FileProvider`. |
| **Home-screen widget** | `widget/` | Jetpack Glance, `SizeMode.Responsive` (small / medium / large), Dusk/Dawn colours, "+" opens the add flow. The page pushes a summary (`widgetUpdate`) after every change. |

> **R8 note:** release builds keep `BookShelfWidget.provideGlance` via
> `proguard-rules.pro` — without it R8 strips the widget's whole UI from release
> builds only. CI checks the release APK for it.

## Updating the bundled web app

`app/src/main/assets/` is a copy of the web app's `dist/`, committed so the
project builds in Android Studio without Node. After changing the web app, run
from the repo root:

```bash
npm run android:assets   # vite build, then copy dist/ into the assets
```

CI fails if the committed assets don't match a fresh build.

## Configuration

| Setting                | Value                                  |
| :--------------------- | :------------------------------------- |
| Application ID         | `app.mehul.bookshelf`                  |
| minSdk                 | 26 (Android 8.0)                       |
| compileSdk / targetSdk | 37 (Android 17)                        |
| AGP                    | 9.4 (built-in Kotlin, new DSL)         |
| Kotlin                 | 2.4                                    |
| Gradle                 | 9.8 (configuration cache on)           |
| UI extras              | Jetpack Glance 1.2 (Compose compiler plugin), Play services Code Scanner |
| Build scripts          | Kotlin DSL + `gradle/libs.versions.toml` |
| Release                | R8 minify + resource shrinking         |

API keys (TheTVDB, optional Google Books) are entered in the app's **Settings**
and stored encrypted in the Android Keystore — never compiled into the build.
Android Auto Backup includes the catalog (but not the Keystore-encrypted
secrets), so a reinstall or new phone restores the shelf; re-enter keys and the
sync passphrase afterwards.
