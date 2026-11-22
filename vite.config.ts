import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import pkg from './package.json' with { type: 'json' };

// One self-contained index.html, which the Android app bundles (`cap sync`),
// so it runs offline from the first launch.
export default defineConfig({
  plugins: [svelte(), viteSingleFile()],
  // Shown in Settings → About.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    // Keep in sync with android.minWebViewVersion in capacitor.config.ts.
    target: ['chrome111']
  }
});
