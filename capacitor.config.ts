import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Same id as the old hand-built shell, so the new APK installs as an update.
  appId: 'app.mehul.bookshelf',
  appName: 'BookShelf',
  webDir: 'dist',
  // WebView background before the page paints; matches the Dusk surface.
  backgroundColor: '#0f0d0b',
  server: {
    // The old shell served the app from this origin, and Android keys a
    // WebView's IndexedDB and localStorage by origin. Keeping it means the
    // library, settings and sync state carry over on upgrade. Capacitor's
    // default (https://localhost) would open an empty database.
    hostname: 'appassets.androidwebview.com',
    androidScheme: 'https'
  },
  android: {
    allowMixedContent: false,
    // Keep in sync with build.target in vite.config.ts.
    minWebViewVersion: 111
  },
  plugins: {
    SystemBars: {
      // index.html opts into edge-to-edge with viewport-fit=cover. SystemBars
      // publishes the insets as --safe-area-inset-* CSS variables (and pads
      // the WebView above the keyboard); app.css reads them into --inset-*.
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      // Follow the system until src/platform/theme.ts applies the user's theme.
      style: 'DEFAULT'
    }
  }
};

export default config;
