// Upgrade-in-place test, run on a booted emulator (see .github/workflows/ci.yml).
//
// Installs a debug build of the old hand-built WebView shell, stores a book,
// a setting and a saved API key the way the old app does, then installs the
// Capacitor build over it and checks all three are still there. Both APKs
// must be signed with the same key (CI builds both with the runner's debug key).
//
//   node scripts/android-upgrade-test.mjs <old-shell.apk> <new.apk>

import { _android as android } from '@playwright/test';

const [oldApk, newApk] = process.argv.slice(2);
if (!oldApk || !newApk) {
  console.error('usage: android-upgrade-test.mjs <old-shell.apk> <new.apk>');
  process.exit(2);
}

const PKG = 'app.mehul.bookshelf';
const ORIGIN = 'https://appassets.androidwebview.com';
const ENTRY = { id: 'upgrade-test', title: 'The Upgrade Test' };
const SECRET = { key: 'tvdb_api_key', value: 'upgrade-secret' };

const log = (msg) => console.log(`==> ${msg}`);

const [device] = await android.devices();
if (!device) throw new Error('No Android device or emulator connected');
device.setDefaultTimeout(120_000);

/** Launch the app fresh and return its page once the library has rendered. */
async function launch() {
  await device.shell(`am force-stop ${PKG}`);
  await device.shell(`am start -W -n ${PKG}/.MainActivity`);
  const webview = await device.webView({ pkg: PKG });
  const page = await webview.page();
  await page.waitForSelector('.lib-header', { timeout: 60_000 });
  return page;
}

try {
  log('Installing the old shell');
  await device.shell(`pm uninstall ${PKG}`);
  await device.installApk(oldApk);

  log('Seeding data in the old shell');
  let page = await launch();
  const oldOrigin = await page.evaluate(() => location.origin);
  if (oldOrigin !== ORIGIN) throw new Error(`Old shell served from ${oldOrigin}, expected ${ORIGIN}`);
  await page.evaluate(
    async ({ entry, secret }) => {
      // The app's own Dexie database, written with the raw IndexedDB API.
      await new Promise((resolve, reject) => {
        const open = indexedDB.open('bookshelf');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('entries', 'readwrite');
          const now = new Date().toISOString();
          tx.objectStore('entries').put({
            ...entry,
            type: 'book',
            sourceId: null,
            creators: ['A. Tester'],
            year: 2026,
            summary: '',
            genres: [],
            thumbnailUrl: null,
            thumbnailBlob: null,
            rating: null,
            notes: '',
            status: 'want',
            dateAdded: now,
            dateRated: null,
            updatedAt: now
          });
          tx.oncomplete = () => resolve(undefined);
          tx.onerror = () => reject(tx.error);
        };
      });
      localStorage.setItem('bookshelf:theme', 'light');
      // The old shell's bridge: secureSet into the Android Keystore store.
      await new Promise((resolve) => {
        const ch = window.BookShelfNative;
        ch.addEventListener('message', (ev) => {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'result' && msg.id === 9001) resolve(undefined);
        });
        ch.postMessage(JSON.stringify({ type: 'call', id: 9001, method: 'secureSet', params: secret }));
      });
    },
    { entry: ENTRY, secret: SECRET }
  );
  await page
    .context()
    .close()
    .catch(() => {});

  log('Installing the Capacitor build over it');
  await device.installApk(newApk); // -r: replace, keeping app data

  log('Checking the data survived');
  page = await launch();
  const result = await page.evaluate(async (secretKey) => {
    const cap = window.Capacitor;
    const saved = await cap.nativePromise('BookShelf', 'secureGet', { key: secretKey });
    return {
      origin: location.origin,
      native: cap.isNativePlatform(),
      theme: document.documentElement.getAttribute('data-theme'),
      secret: saved.value ?? null
    };
  }, SECRET.key);
  const failures = [];
  if (result.origin !== ORIGIN) failures.push(`origin is ${result.origin}, expected ${ORIGIN}`);
  if (!result.native) failures.push('page is not running inside Capacitor');
  if (result.theme !== 'light') failures.push(`theme is ${result.theme}, expected the saved "light"`);
  if (result.secret !== SECRET.value) failures.push(`saved API key is ${JSON.stringify(result.secret)}`);
  const listed = await page
    .getByText(ENTRY.title)
    .first()
    .waitFor({ timeout: 30_000 })
    .then(
      () => true,
      () => false
    );
  if (!listed) failures.push(`"${ENTRY.title}" is not in the library`);

  if (failures.length) {
    console.error(`Upgrade lost data:\n  - ${failures.join('\n  - ')}`);
    process.exitCode = 1;
  } else {
    log('Upgrade kept the library, settings and saved keys');
  }
} finally {
  await device.close();
}
