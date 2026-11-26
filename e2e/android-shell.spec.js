// The app as it runs inside the Android shell, with Capacitor's native layer
// and the BookShelf plugin simulated by e2e/fake-shell.js.
import { test, expect } from './app-test.js';
import { installFakeShell } from './fake-shell.js';

const sent = (page) => page.evaluate(() => window.__sent);
const lastOf = async (page, type) => (await sent(page)).filter((m) => m.type === type).at(-1);
const calls = async (page, method) =>
  (await sent(page)).filter((m) => m.type === 'call' && m.method === method);

async function boot(page, options = {}) {
  await page.addInitScript(installFakeShell, options);
  await page.goto('/index.html');
  await expect(page.locator('.fab')).toBeVisible();
  // Booted once it has subscribed to the shell's events.
  await expect.poll(async () => (await sent(page)).filter((m) => m.type === 'listen').length).toBe(5);
}

test('boot: reports theme, listens for shell events, no service worker', async ({ page }) => {
  await boot(page);
  expect(await lastOf(page, 'theme')).toEqual({ type: 'theme', mode: 'dark' });
  const events = (await sent(page)).filter((m) => m.type === 'listen').map((m) => m.event);
  expect(events.sort()).toEqual(['back', 'link', 'openAdd', 'openEntry', 'shared']);
  expect(await page.evaluate(async () => !(await navigator.serviceWorker?.getRegistration()))).toBe(true);
});

test('system-bar insets pad the shell and clear the FAB', async ({ page }) => {
  await boot(page);
  const padTop = () =>
    page.locator('.app-shell').evaluate((el) => parseFloat(getComputedStyle(el).paddingTop));
  const before = await padTop();
  // What Capacitor's SystemBars injects for a 40px status bar / 24px nav bar.
  await page.evaluate(() => {
    const s = document.documentElement.style;
    s.setProperty('--safe-area-inset-top', '40px');
    s.setProperty('--safe-area-inset-bottom', '24px');
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

test('Android Back closes an open menu first, then gives Back back', async ({ page }) => {
  await boot(page);
  const sort = page.getByRole('combobox', { name: 'Sort by' });
  await sort.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  expect(await lastOf(page, 'backHandler')).toMatchObject({ enabled: true });
  await page.evaluate(() => window.__nativeBack());
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(sort).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(async () => (await lastOf(page, 'backHandler'))?.enabled).toBe(false);

  // Closed by a choice, the menu still hands Back to the system.
  await sort.click();
  await page.getByRole('option', { name: 'Title' }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect.poll(async () => (await lastOf(page, 'backHandler'))?.enabled).toBe(false);
});

test('secrets typed in Settings go to the Keystore, not localStorage', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('dialog[open] summary', { hasText: 'Films and TV' }).click();
  await page.getByLabel('API key or read access token').fill('tmdb-secret');
  await expect.poll(() => page.evaluate(() => window.__keystore.tmdb_api_key)).toBe('tmdb-secret');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('tmdb-secret');

  await page.getByRole('radio', { name: 'Dawn' }).click();
  expect(await lastOf(page, 'theme')).toEqual({ type: 'theme', mode: 'light' });
  await expect(page.getByRole('radio', { name: 'Dawn' })).toHaveAttribute('aria-checked', 'true');
});

test('text shared from another app opens a prefilled quote', async ({ page }) => {
  await boot(page);
  await page.evaluate(() =>
    window.__nativeEmit('shared', {
      text: 'Fear is the mind-killer.\nfrom Dune by Frank Herbert',
      subject: ''
    })
  );
  await expect(page.locator('dialog[open] .shared-preview-text')).toHaveText('Fear is the mind-killer.');
  await page.locator('.medium-choice', { hasText: 'Quote' }).click();
  await expect(page.locator('#q-text')).toHaveValue('Fear is the mind-killer.');
  await expect(page.locator('#q-author')).toHaveValue('Frank Herbert');
  await expect(page.locator('#q-source')).toHaveValue('Dune');
});

test('"Save as quote" (share sheet or text selection) goes straight to a filled-in quote', async ({
  page
}) => {
  await boot(page, {
    pendingEvents: [
      ['shared', { text: '“So it goes.”\n— Kurt Vonnegut, Slaughterhouse-Five', subject: '', as: 'quote' }]
    ]
  });
  // No "what is it?" step: the quote form, filled in.
  await expect(page.locator('#q-text')).toHaveValue('So it goes.');
  await expect(page.locator('#q-author')).toHaveValue('Kurt Vonnegut');
  await expect(page.locator('#q-source')).toHaveValue('Slaughterhouse-Five');
  await page.locator('.add-form button[type=submit]').click();
  await expect(page.locator('dialog[open] .modal-quote-text')).toContainText('So it goes.');
});

test('text shared while the app was starting is not lost', async ({ page }) => {
  // Emitted before the page subscribes (a cold start from the share sheet);
  // the shell keeps it until the listener is added.
  await boot(page, {
    pendingEvents: [
      ['shared', { text: 'So it goes.\nfrom Slaughterhouse-Five by Kurt Vonnegut', subject: '' }]
    ]
  });
  await expect(page.locator('dialog[open] .shared-preview-text')).toHaveText('So it goes.');
});

test('a bookshelf:// link from another app opens a book search', async ({ page }) => {
  // What Rosetta sends when a book is finished (style.md §14.1).
  await boot(page, {
    pendingEvents: [
      ['link', { url: 'bookshelf://log?title=Dune&author=Frank+Herbert&finished=2026-11-01&source=rosetta' }]
    ]
  });
  await expect(page.getByRole('searchbox', { name: /^Search books/ })).toHaveValue('Dune Frank Herbert');
  await expect.poll(async () => (await sent(page)).some((m) => m.type === 'http')).toBe(true);
});

test('a bookshelf://quote link from Rosetta fills in the quote form, and saves it as a quote', async ({
  page
}) => {
  await boot(page, {
    pendingEvents: [
      [
        'link',
        {
          url: 'bookshelf://quote?text=Call+me+Ishmael.&title=Moby-Dick&author=Herman+Melville&where=Loomings&note=The+opening.&source=rosetta'
        }
      ]
    ]
  });
  await expect(page.locator('dialog[open] #modal-title')).toHaveText('Add a quote');
  await expect(page.locator('#q-text')).toHaveValue('Call me Ishmael.');
  await expect(page.locator('#q-author')).toHaveValue('Herman Melville');
  await expect(page.locator('#q-source')).toHaveValue('Moby-Dick');
  await expect(page.locator('#q-location')).toHaveValue('Loomings');
  await page.getByRole('button', { name: 'Add quote' }).click();
  await expect(page.locator('dialog[open]')).toContainText('Call me Ishmael.');
  await expect(page.locator('dialog[open]').getByRole('textbox', { name: 'Notes' })).toHaveValue(
    'The opening.'
  );
});

test('a bookshelf://open link just opens the shelf', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__nativeEmit('link', { url: 'bookshelf://open?source=ledger' }));
  await expect(page.locator('dialog[open]')).toHaveCount(0);
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
  await expect
    .poll(async () => (await sent(page)).some((m) => m.type === 'http' && m.url.includes('openlibrary.org')))
    .toBe(true);
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

test('backup settings: choose a folder, then Back up now writes an encrypted file', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  const section = page.locator('.sync-section');
  await expect(section).toContainText('Not chosen yet');
  // Stop and Back up now come once there is a folder.
  await expect(section.getByRole('button', { name: 'Back up now' })).toHaveCount(0);
  await section.getByRole('button', { name: 'Choose' }).click();
  await expect(section).toContainText('Drive/BookShelf');

  await section.getByLabel('Backup passphrase').fill('correct horse battery');
  await expect
    .poll(() => page.evaluate(() => window.__keystore.sync_passphrase))
    .toBe('correct horse battery');
  // Daily unless chosen; the choice is kept.
  await expect(section.getByRole('radio', { name: 'Daily' })).toHaveAttribute('aria-checked', 'true');
  await section.getByRole('radio', { name: 'Weekly' }).click();
  expect(await page.evaluate(() => localStorage.getItem('bookshelf:sync_every'))).toBe('weekly');
  await page.keyboard.press('Escape');

  // Something to back up.
  await page.locator('.fab').click();
  await page.locator('.medium-choice', { hasText: 'Quote' }).click();
  await page.fill('#q-text', 'A secret only this shelf knows.');
  await page.locator('.add-form button[type=submit]').click();
  await expect(page.locator('dialog[open] .modal-quote-text')).toBeVisible(); // saved
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).toHaveCount(0);
  // Edits no longer back up on their own: only on the schedule, or by hand.
  expect(await page.evaluate(() => window.__syncFile ?? null)).toBeNull();

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('.sync-section').getByRole('button', { name: 'Back up now' }).click();
  await expect(page.locator('.sync-section .settings-notice')).toHaveText('Backed up.', { timeout: 15_000 });
  const file = await page.evaluate(() => window.__syncFile);
  expect(JSON.parse(file)).toMatchObject({ format: 'bookshelf-sync', cipher: 'AES-256-GCM' });
  expect(file).not.toContain('secret only this shelf');
});

test('a backup runs when the app opens only once it is due', async ({ page }) => {
  const reads = async () =>
    (await sent(page)).filter((m) => m.type === 'call' && m.method === 'syncRead').length;
  const opened = (last) => page.addInitScript((at) => localStorage.setItem('bookshelf:sync_last', at), last);
  await opened(new Date().toISOString());
  await boot(page, { syncFolder: 'Drive/BookShelf', secrets: { sync_passphrase: 'pw' } });
  await page.waitForTimeout(500);
  expect(await reads()).toBe(0);

  await opened('2020-01-01T00:00:00.000Z');
  await page.reload();
  await expect.poll(reads, { timeout: 15_000 }).toBe(1);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('bookshelf:sync_last')), { timeout: 15_000 })
    .not.toMatch(/^2020/);
});
