// Adding from search: the loading state while a result's cover downloads, no
// duplicates from quick repeat taps, and Select several. Google Books and the
// cover host are stubbed, the covers held back until the test lets them go.
import { test, expect } from '@playwright/test';

const VOLUMES = [
  ['dune-1', 'Dune', 'Frank Herbert', '1965'],
  ['dune-2', 'Dune Messiah', 'Frank Herbert', '1969'],
  ['dune-3', 'Children of Dune', 'Frank Herbert', '1976']
].map(([id, title, author, year]) => ({
  id,
  volumeInfo: {
    title,
    authors: [author],
    publishedDate: year,
    imageLinks: { thumbnail: `https://covers.test/${id}.png` }
  }
}));

// A 1×1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64'
);

/** Stubs search; covers wait for the returned release() before answering. */
async function stubSearch(page) {
  let release;
  const gate = new Promise((r) => (release = r));
  await page.route('https://www.googleapis.com/books/v1/volumes**', (route) =>
    route.fulfill({ json: { items: VOLUMES } })
  );
  await page.route('https://covers.test/**', async (route) => {
    await gate;
    await route.fulfill({ body: PNG, contentType: 'image/png' });
  });
  return { release: () => release() };
}

async function searchBooksFor(page, q) {
  await page.getByRole('button', { name: 'Add to catalog' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: /Book/ }).first().click();
  await page.getByRole('searchbox', { name: 'Search books' }).fill(q);
  await page.getByRole('searchbox', { name: 'Search books' }).press('Enter');
  await expect(page.locator('.add-result-row')).toHaveCount(3);
}

const cards = (page) => page.locator('.entry-card');

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
});

test('a tapped result shows it is loading, and quick repeat taps add it once', async ({ page }) => {
  const covers = await stubSearch(page);
  await searchBooksFor(page, 'dune');
  const dune = page.locator('.add-result-row', { hasText: 'Dune' }).first();
  const messiah = page.locator('.add-result-row', { hasText: 'Dune Messiah' });

  await dune.click();
  await expect(dune.locator('[role=progressbar]')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Adding Dune' })).toHaveCount(1);
  await expect(page.locator('.add-result-list')).toHaveAttribute('aria-busy', 'true');
  // More taps, on it and on another result, while its cover is still on the way.
  await dune.click({ force: true });
  await dune.click({ force: true });
  await messiah.click({ force: true });

  covers.release();
  // The new entry opens (its rating, not the search results).
  await expect(page.locator('dialog[open]').getByRole('slider', { name: 'Rating' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText('Dune');
});

test('Select several adds the picked results at once, and Undo takes them back', async ({ page }) => {
  const covers = await stubSearch(page);
  covers.release();
  await searchBooksFor(page, 'dune');

  await page.getByRole('button', { name: 'Select several' }).click();
  await expect(page.locator('.add-results-label')).toHaveText('0 of 3 picked');
  const add = page.locator('.add-picked-bar .btn-primary');
  await expect(add).toBeDisabled();
  await expect(add).toHaveText('Add books');

  await page.getByRole('checkbox').nth(0).check();
  await page.getByRole('checkbox').nth(2).check();
  await expect(page.locator('.add-results-label')).toHaveText('2 of 3 picked');
  await expect(add).toHaveText('Add 2 books');
  await add.click();

  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page.locator('#toast')).toContainText('Added 2 books.');
  await expect(cards(page)).toHaveCount(2);
  const titles = await page.locator('.entry-card .entry-title').allTextContents();
  expect(titles.sort()).toEqual(['Children of Dune', 'Dune']);

  await page.locator('#toast').getByRole('button', { name: 'Undo' }).click();
  await expect(cards(page)).toHaveCount(0);
});

test('a result already on the shelf cannot be picked again, and Cancel leaves select mode', async ({
  page
}) => {
  const covers = await stubSearch(page);
  covers.release();
  await searchBooksFor(page, 'dune');
  await page.locator('.add-result-row', { hasText: 'Dune Messiah' }).click();
  await expect(page.locator('dialog[open]').getByRole('slider', { name: 'Rating' })).toBeVisible();
  await page.keyboard.press('Escape');

  await searchBooksFor(page, 'dune');
  await page.getByRole('button', { name: 'Select several' }).click();
  // Two can still be picked; the one on the shelf shows a tick instead of a box.
  await expect(page.getByRole('checkbox')).toHaveCount(2);
  await expect(page.locator('.add-result-row.is-in-library')).toContainText('Already on the shelf');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.locator('.add-results-label')).toContainText('3 books found');
});
