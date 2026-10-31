import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// One self-contained index.html: the Android shell loads it from its assets.
export default defineConfig({
  plugins: [svelte(), viteSingleFile()],
});
