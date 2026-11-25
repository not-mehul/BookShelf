// Status shelves: the library by where things stand, from what was recorded.
import { test, expect } from './app-test.js';

test('status shelves filter the library and are remembered', async ({ page }) => {
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'Settings' }).first().click();
  await page.locator('input[type=file][accept*="csv"]').setInputFiles('e2e/fixtures/goodreads.csv');
  await expect(page.getByText(/From Goodreads: 3 new entries/)).toBeVisible();
  await page.keyboard.press('Escape');

  const shelves = page.getByRole('group', { name: 'Shelf' });
  // Only shelves with something on them are offered.
  await expect(shelves.getByRole('button')).toHaveText(['All', 'Wishlist', 'Finished']);

  await shelves.getByRole('button', { name: 'Wishlist' }).click();
  await expect(page.locator('.entry-card')).toHaveCount(2);
  await expect(page.locator('.lib-count')).toHaveText('2 of 3 entries');

  await page.reload();
  await expect(
    page.getByRole('group', { name: 'Shelf' }).getByRole('button', { name: 'Wishlist' })
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('group', { name: 'Shelf' }).getByRole('button', { name: 'Finished' }).click();
  await expect(page.locator('.entry-card')).toHaveText([/Leviathan Wakes/]);
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
