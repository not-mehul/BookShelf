// The app in a plain browser / installed PWA.
import { test, expect } from '@playwright/test';

const dialog = (page) => page.locator('dialog.modal-dialog[open]');
// The dialog's accessible name (what screen readers announce).
const dialogName = (page) =>
  page.evaluate(() => {
    const d = document.querySelector('dialog[open]');
    return document.getElementById(d?.getAttribute('aria-labelledby') || '')?.textContent?.trim() || '';
  });

test.beforeEach(async ({ page }) => {
  // Deterministic: no BarcodeDetector (availability varies by platform).
  await page.addInitScript(() => delete globalThis.BarcodeDetector);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  test.info().annotations.push({ type: 'errors', description: '' });
  page.__errors = errors;
  await page.goto('/index.html');
  await expect(page.locator('.fab')).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(page.__errors, 'console errors / exceptions').toEqual([]);
});

test('add flow opens as an accessible native modal', async ({ page }) => {
  await page.locator('.fab').click();
  await expect(dialog(page)).toHaveCount(1);
  expect(await page.evaluate(() => document.querySelector('dialog').matches(':modal'))).toBe(true);
  expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true);
  expect(await dialogName(page)).toBe('What would you like to add?');
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');

  await page.locator('.medium-choice', { hasText: 'Book' }).click();
  expect(await dialogName(page)).toBe('Add a book');
  await expect(page.getByRole('searchbox', { name: /^Search books/ })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Scan barcode' })).toHaveCount(0); // no scanner here

  await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page.locator('.fab')).toBeFocused();
});

test('adding a quote puts it on the shelf', async ({ page }) => {
  await page.locator('.fab').click();
  await page.locator('.medium-choice', { hasText: 'Quote' }).click();
  await expect(page.locator('#q-text')).toBeFocused();
  await page.fill('#q-text', 'All animals are equal, but some animals are more equal than others.');
  await page.fill('#q-author', 'George Orwell');
  await page.fill('#q-source', 'Animal Farm');
  await page.locator('.add-form button[type=submit]').click();

  await expect(dialog(page).locator('.modal-quote-text')).toContainText('All animals are equal');
  await page.mouse.click(6, 6); // outside the card dismisses
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page.locator('.quote-card')).toHaveCount(1);
  await expect(page.locator('.stats-bar')).toContainText('1 entry');
});

test('text shared to the installed PWA opens a prefilled add flow', async ({ page }) => {
  const text = '“So it goes.”\n\n— Kurt Vonnegut, Slaughterhouse-Five';
  await page.goto(`/index.html?share-text=${encodeURIComponent(text)}`);
  await expect(dialog(page).locator('.shared-preview-text')).toHaveText('So it goes.');
  expect(new URL(page.url()).search).toBe(''); // params consumed

  await page.locator('.medium-choice', { hasText: 'Quote' }).click();
  await expect(page.locator('#q-text')).toHaveValue('So it goes.');
  await expect(page.locator('#q-author')).toHaveValue('Kurt Vonnegut');
  await expect(page.locator('#q-source')).toHaveValue('Slaughterhouse-Five');
});

test('phone layout: filter gets its own row; sync is app-only', async ({ page }) => {
  const filter = await page.locator('.filter-input').boundingBox();
  const shell = await page.locator('.lib-tools-row').boundingBox();
  expect(filter.width).toBeGreaterThan(shell.width * 0.9);

  await page.getByRole('button', { name: 'Settings' }).click();
  expect(await dialogName(page)).toBe('Preferences');
  await expect(page.locator('.sync-section')).toHaveCount(0);
  await expect(page.getByLabel('Proxy URL (optional)')).toBeVisible();
});

test('hides easter eggs, counts them once, and lists the count in Settings', async ({ page }) => {
  for (const key of [
    'ArrowUp',
    'ArrowUp',
    'ArrowDown',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'ArrowLeft',
    'ArrowRight',
    'b',
    'a'
  ]) {
    await page.keyboard.press(key);
  }
  await expect(page.locator('.toast[data-kind="celebrate"]')).toHaveText(
    'Every cover, turned face out. Easter egg found: 1 of 4.'
  );

  for (let i = 0; i < 7; i++) await page.locator('.t-page-title').click();
  await expect(page.locator('.toast[data-kind="celebrate"]')).toHaveText(
    'Shh. This is a library. Easter egg found: 2 of 4.'
  );

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('#eggCount')).toHaveText('Easter eggs: 2 of 4 found');
});

test('left alone, the library cat can be petted; nine pets and it is yours', async ({ page }) => {
  await page.clock.install();
  await page.reload();
  await expect(page.locator('.fab')).toBeVisible();
  await page.clock.runFor(41_000);
  const dock = page.getByTestId('idle-dock');
  await expect(dock).toBeVisible();
  await expect(dock.locator('.idle-line')).toHaveText('The library cat is asleep on the returns.');
  const cat = dock.getByRole('button', { name: 'Pet the library cat' });
  await cat.click();
  await expect(dock.locator('.idle-line')).toHaveText('Prrrr.');
  for (let i = 1; i < 9; i++) await cat.click();
  await expect(page.locator('.toast[data-kind="celebrate"]')).toHaveText(
    'Nine pets, nine lives. The library cat is yours now. Easter egg found: 1 of 4.'
  );
  await page.locator('.fab').click();
  await expect(dock).toHaveCount(0);
});
