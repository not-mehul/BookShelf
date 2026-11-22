import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// One self-contained index.html, which the Android app bundles (`cap sync`),
// so it runs offline from the first launch.
export default defineConfig({
  plugins: [svelte(), viteSingleFile()],
  build: {
    // Keep in sync with android.minWebViewVersion in capacitor.config.ts.
    target: ['chrome111']
  }
});
