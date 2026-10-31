import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// One self-contained index.html. The PWA's service worker precaches just that
// document, so the app works offline after a single visit; the Android app
// gets the same file from `cap sync`.
export default defineConfig({
  plugins: [svelte(), viteSingleFile()],
  build: {
    // Keep in sync with android.minWebViewVersion in capacitor.config.ts.
    target: ['chrome111', 'safari16']
  }
});
