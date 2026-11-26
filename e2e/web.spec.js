// The app's everyday screens: dialogs, adding, layout, the small delights.
import { test, expect } from './app-test.js';

const dialog = (page) => page.locator('dialog.modal-dialog[open]');
// The dialog's accessible name (what screen readers announce).
const dialogName = (page) =>
  page.evaluate(() => {
    const d = document.querySelector('dialog[open]');
    return document.getElementById(d?.getAttribute('aria-labelledby') || '')?.textContent?.trim() || '';
  });

test.beforeEach(async ({ page }) => {
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
  await expect(page.getByRole('button', { name: 'Scan barcode' })).toBeVisible();

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
  await expect(page.locator('.lib-count')).toHaveText('1 entry');
});

test('phone layout: filter and sort share a row; settings has backup and no browser options', async ({
  page
}) => {
  const filter = await page.locator('.filter-input').boundingBox();
  const sort = await page.getByRole('combobox', { name: 'Sort by' }).boundingBox();
  expect(Math.abs(filter.y + filter.height / 2 - (sort.y + sort.height / 2))).toBeLessThan(4);
  // Stats and Queue sit with Settings in the header, not by the filter.
  const header = page.locator('.site-header');
  await expect(header.getByRole('button')).toHaveCount(3);
  for (const [i, name] of ['Stats', 'Queue', 'Settings'].entries())
    await expect(header.getByRole('button').nth(i)).toHaveAccessibleName(name);
  await expect(page.locator('.lib-tools-row').getByRole('button', { name: /Stats|Queue/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Settings' }).click();
  expect(await dialogName(page)).toBe('Preferences');
  await expect(page.locator('.sync-section')).toHaveCount(1);
  // Search keys start folded away; the summary opens them.
  await expect(page.getByLabel('API key or read access token')).toBeHidden();
  await page.locator('dialog[open] summary', { hasText: 'Films and TV' }).click();
  await expect(page.getByLabel('API key or read access token')).toBeVisible();
  await expect(page.getByLabel(/proxy/i)).toHaveCount(0);
  await expect(
    page.getByText('This product uses the TMDB API but is not endorsed or certified by TMDB.')
  ).toBeVisible();
  // One backup (the folder, on a schedule): no separate Back up, weekly copy or Markdown.
  await expect(page.getByRole('heading', { name: 'Backup' })).toBeVisible();
  for (const gone of ['Weekly backup', 'Back up', 'Import a Markdown export', 'Possible duplicates'])
    await expect(page.locator('.settings-row-label', { hasText: new RegExp(`^${gone}$`) })).toHaveCount(0);
  await expect(page.locator('.settings-row-label')).toContainText([
    'Folder',
    'Restore a backup',
    'Import from Goodreads, StoryGraph or Letterboxd',
    'Library refresh',
    'Duplicate check'
  ]);
});

test('an open sheet holds the page still behind it, and closing puts it back', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('input[type=file][accept*="json"]').setInputFiles('e2e/fixtures/visual-shelf.json');
  await expect(page.getByText(/^Imported \d+ entries/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).toHaveCount(0);
  const card = page.locator('.entry-card').nth(4);
  await card.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(100);
  await card.click();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  expect(await page.evaluate(() => getComputedStyle(document.body).position)).toBe('fixed');
  // A finger on the page behind the sheet moves nothing.
  await page.mouse.move(200, 40);
  await page.mouse.wheel(0, 800);
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
  expect(await page.evaluate(() => getComputedStyle(document.body).position)).toBe('static');
  // The floating tab bar didn't take the pinning for scrolling.
  await expect(page.locator('.floating-bar')).not.toHaveClass(/is-shown/);
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
