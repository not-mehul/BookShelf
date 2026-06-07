# BookShelf — Android (native WebView shell)

A standalone Android Studio project that packages the BookShelf web app as an
installable Android application. **No Capacitor.** It is a thin native shell:
the built web app is bundled in `app/src/main/assets/` and served inside a
`WebView` over a real secure origin via `WebViewAssetLoader`.

## Open & run

1. Open **Android Studio** (Koala / 2024.1 or newer — ships JDK 17 + Gradle 8.7).
2. **File → Open…** and select this folder (`android-app`).
3. Let Gradle sync. Android Studio writes `local.properties` with your SDK path
   automatically; if prompted to install SDK 34 / build-tools, accept.
4. Pick a device or emulator and press **Run** (▶). The app installs and launches.

To produce a shareable APK: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
The debug APK lands in `app/build/outputs/apk/debug/app-debug.apk` — sideload it
with `adb install app-debug.apk` or copy it to a device.

For a signed release build: **Build → Generate Signed Bundle / APK**.

## How it works

- **`MainActivity.java`** sets up the WebView and serves `app/src/main/assets/`
  over `https://appassets.androidwebview.com`. Using an https origin (rather than
  `file://`) is what makes IndexedDB and localStorage reliable, so the catalog
  persists and cover images cache offline.
- **`AndroidHttp`** JavascriptInterface performs API requests natively. The web
  app's `src/util/android-bridge.js` detects this interface and patches
  `window.fetch` to route cross-origin calls (TheTVDB) through it, bypassing
  WebView CORS — the same thing Capacitor's native HTTP did.
- **`AndroidExport`** JavascriptInterface writes the Markdown export to the cache
  and opens the system share sheet via `FileProvider`.

Both interfaces are feature-detected, so the identical web build still runs in a
plain browser unchanged.

## Updating the bundled web app

The contents of `app/src/main/assets/` are a copy of the web app's `dist/`.
After changing the web app, rebuild and re-copy from the repo root:

```bash
npm run build
rm -rf android-app/app/src/main/assets/*
cp -r dist/* android-app/app/src/main/assets/
```

## Configuration

| Setting     | Value                     |
| :---------- | :------------------------ |
| Application ID | `app.bookshelf.personal` |
| minSdk      | 26 (Android 8.0)          |
| compileSdk / targetSdk | 34             |
| Gradle      | 8.7                       |
| AGP         | 8.5.2                     |
| JDK         | 17                        |

API keys (TheTVDB, optional Google Books) are entered in the app's **Settings**
tab and stored on-device — they are not compiled into the build.
