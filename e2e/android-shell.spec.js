// The app as it runs inside the Android shell, with the native side simulated
// by e2e/fake-shell.js (same message protocol as NativeBridge.kt).
import { test, expect } from '@playwright/test';
import { installFakeShell } from './fake-shell.js';

const sent = (page) => page.evaluate(() => window.__sent);
const lastOf = async (page, type) => (await sent(page)).filter((m) => m.type === type).at(-1);
const calls = async (page, method) => (await sent(page)).filter((m) => m.type === 'call' && m.method === method);

async function boot(page, options = {}) {
  await page.addInitScript(installFakeShell, options);
  await page.goto('/index.html');
  await expect(page.locator('.fab')).toBeVisible();
  await expect.poll(() => lastOf(page, 'ready')).toBeTruthy();
}

test('boot: reports theme, announces ready, no service worker', async ({ page }) => {
  await boot(page);
  expect(await lastOf(page, 'theme')).toEqual({ type: 'theme', mode: 'dark' });
  expect(await page.evaluate(async () => !(await navigator.serviceWorker?.getRegistration()))).toBe(true);
});

test('system-bar insets pad the shell and clear the FAB', async ({ page }) => {
  await boot(page);
  const padTop = () => page.locator('.app-shell').evaluate((el) => parseFloat(getComputedStyle(el).paddingTop));
  const before = await padTop();
  // What NativeBridge.updateInsets() injects for a 40px status bar / 24px nav bar.
  await page.evaluate(() => {
    const s = document.documentElement.style;
    s.setProperty('--inset-top', '40px');
    s.setProperty('--inset-bottom', '24px');
  });
  expect((await padTop()) - before).toBe(40);
  await expect(page.locator('.fab')).toHaveCSS('bottom', '48px');
});

test('Android Back closes a modal and then returns Back to the system', async ({ page }) => {
  await boot(page);
  await page.locator('.fab').click();
  expect(await lastOf(page, 'backHandler')).toMatchObject({ enabled: true });
  await page.evaluate(() => window.__nativeBack());
  await expect(page.locator('dialog')).toHaveCount(0);
  expect(await lastOf(page, 'backHandler')).toMatchObject({ enabled: false });
});

test('secrets typed in Settings go to the Keystore, not localStorage', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('API key', { exact: true }).fill('tvdb-secret');
  await expect.poll(() => page.evaluate(() => window.__keystore.tvdb_api_key)).toBe('tvdb-secret');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('tvdb-secret');

  await page.getByRole('switch', { name: 'Toggle theme' }).click();
  expect(await lastOf(page, 'theme')).toEqual({ type: 'theme', mode: 'light' });
});

test('text shared from another app opens a prefilled quote', async ({ page }) => {
  await boot(page);
  await page.evaluate(() =>
    window.__nativeEmit('shared', { text: 'Fear is the mind-killer.\nfrom Dune by Frank Herbert', subject: '' })
  );
  await expect(page.locator('dialog[open] .shared-preview-text')).toHaveText('Fear is the mind-killer.');
  await page.locator('.medium-choice', { hasText: 'Quote' }).click();
  await expect(page.locator('#q-text')).toHaveValue('Fear is the mind-killer.');
  await expect(page.locator('#q-author')).toHaveValue('Frank Herbert');
  await expect(page.locator('#q-source')).toHaveValue('Dune');
});

test('widget "+" opens the add flow', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__nativeEmit('openAdd', null));
  await expect(page.locator('dialog[open] #modal-title')).toHaveText('What would you like to add?');
});

test('scanning a barcode fills the ISBN and searches', async ({ page }) => {
  await boot(page, { scanResult: '9780441172719' });
  await page.locator('.fab').click();
  await page.locator('.medium-choice', { hasText: 'Book' }).click();
  await page.getByRole('button', { name: 'Scan barcode' }).click();
  await expect(page.getByRole('searchbox', { name: /^Search books/ })).toHaveValue('9780441172719');
  // ISBNs go to Open Library first (via native HTTP); the fake returns no hits.
  await expect.poll(async () => (await sent(page)).some((m) => m.type === 'http' && m.url.includes('openlibrary.org'))).toBe(true);
  await expect(page.locator('.add-empty')).toBeVisible();
});

test('the widget receives a summary after changes', async ({ page }) => {
  await boot(page);
  await page.locator('.fab').click();
  await page.locator('.medium-choice', { hasText: 'Quote' }).click();
  await page.fill('#q-text', 'Not all those who wander are lost.');
  await page.fill('#q-author', 'J.R.R. Tolkien');
  await page.locator('.add-form button[type=submit]').click();
  await expect.poll(async () => (await calls(page, 'widgetUpdate')).at(-1)?.params.summary.total).toBe(1);
  const { summary } = (await calls(page, 'widgetUpdate')).at(-1).params;
  expect(summary.quote).toEqual({ text: 'Not all those who wander are lost.', author: 'J.R.R. Tolkien' });
  expect(summary.theme).toBe('dark');
});

test('sync settings: choose a folder, then Sync now writes an encrypted file', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  const section = page.locator('.sync-section');
  await expect(section).toContainText('Folder: not chosen');
  await section.getByRole('button', { name: 'Choose folder' }).click();
  await expect(section).toContainText('Folder: Drive/BookShelf');

  await section.getByLabel('Sync passphrase').fill('correct horse battery');
  await expect.poll(() => page.evaluate(() => window.__keystore.sync_passphrase)).toBe('correct horse battery');
  await page.keyboard.press('Escape');

  // Something to sync.
  await page.locator('.fab').click();
  await page.locator('.medium-choice', { hasText: 'Quote' }).click();
  await page.fill('#q-text', 'A secret only this shelf knows.');
  await page.locator('.add-form button[type=submit]').click();
  await expect(page.locator('dialog[open] .modal-quote-text')).toBeVisible(); // saved
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('.sync-section').getByRole('button', { name: 'Sync now' }).click();
  await expect(page.locator('.sync-section .settings-notice')).toContainText('Synced', { timeout: 15_000 });
  const file = await page.evaluate(() => window.__syncFile);
  expect(JSON.parse(file)).toMatchObject({ format: 'bookshelf-sync', cipher: 'AES-256-GCM' });
  expect(file).not.toContain('secret only this shelf');
});
