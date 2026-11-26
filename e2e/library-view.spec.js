// The library's view: no shelf tabs, tabs that answer at once on a big
// shelf, and sorting by the day things were finished.
import { test, expect } from './app-test.js';

test('no shelf tabs or Markdown export; a big tab draws its first entries, then the rest', async ({
  page
}) => {
  await page.goto('/index.html');
  // A big shelf: 150 books and 30 films.
  const entry = (i, type) => ({
    id: `e${i}`,
    type,
    title: `${type === 'book' ? 'Book' : 'Film'} ${String(i).padStart(3, '0')}`,
    creators: [],
    genres: [],
    tags: [],
    notes: '',
    summary: '',
    year: 2000,
    rating: null,
    status: null,
    sourceId: null,
    thumbnailUrl: null,
    dateAdded: new Date(Date.UTC(2025, 0, 1, 0, i)).toISOString(),
    dateRated: null
  });
  const entries = [
    ...Array.from({ length: 150 }, (_, i) => entry(i, 'book')),
    ...Array.from({ length: 30 }, (_, i) => entry(150 + i, 'movie'))
  ];
  await page.getByRole('button', { name: 'Settings' }).first().click();
  await page.locator('input[type=file][accept*="json"]').setInputFiles({
    name: 'big.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 2, entries }))
  });
  await expect(page.getByText('Imported 180 entries')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).toHaveCount(0);

  await expect(page.getByRole('group', { name: 'Shelf' })).toHaveCount(0);
  await page.getByRole('button', { name: 'More library actions' }).click();
  await expect(page.getByRole('menuitem')).toHaveText(['Show as a list', 'Select entries']);
  await page.keyboard.press('Escape');

  await page.locator('.lib-types-row').getByRole('tab', { name: 'Movies' }).click();
  await expect(page.locator('.entry-card')).toHaveCount(30);
  // Back to Books: the first batch is on screen in the same frame as the tap.
  const drawn = await page.evaluate(
    () =>
      new Promise((resolve) => {
        document.querySelectorAll('.lib-types-row [role=tab]')[1].click();
        requestAnimationFrame(() => resolve(document.querySelectorAll('.entry-card').length));
      })
  );
  expect(drawn).toBeGreaterThan(0);
  expect(drawn).toBeLessThan(150);
  await expect(page.locator('.entry-card')).toHaveCount(150);
  await expect(page.locator('.lib-count')).toHaveText('150 books');
});

test('the library sorts by the day things were finished', async ({ page }) => {
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'Settings' }).first().click();
  await page.locator('input[type=file][accept*="json"]').setInputFiles('e2e/fixtures/visual-shelf.json');
  await expect(page.getByText(/^Imported \d+ entries/)).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('combobox', { name: 'Sort by' }).click();
  await page.getByRole('option', { name: 'Finished' }).click();
  const latest = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('bookshelf');
        open.onsuccess = () => {
          const all = open.result.transaction('entries').objectStore('entries').getAll();
          all.onsuccess = () =>
            resolve(
              all.result
                .filter((e) => e.finishes?.length)
                .sort((a, b) => b.finishes.at(-1).localeCompare(a.finishes.at(-1)))[0].title
            );
        };
      })
  );
  await expect(page.locator('.entry-card .entry-title').first()).toHaveText(latest);
});
