// Copy the production web build (dist/) into the Android app's bundled assets.
// Cross-platform replacement for `rm -rf … && cp -r …`. Run after `vite build`.

import { cpSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = `${root}dist`;
const assets = `${root}android-app/app/src/main/assets`;

if (!existsSync(`${dist}/index.html`)) {
  console.error('dist/index.html not found — run `npm run build` first.');
  process.exit(1);
}

rmSync(assets, { recursive: true, force: true });
cpSync(dist, assets, { recursive: true });
console.log(`Synced ${dist} → ${assets}`);
