// The reading journal's dates: an imported finish shows and survives a new
// start, the calendar jumps to any month and year, and putting a book down is
// dated.
import { test, expect } from './app-test.js';

const stored = (page, title) =>
  page.evaluate(async (t) => {
    const req = indexedDB.open('bookshelf');
    const db = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const all = await new Promise((r) => {
      const q = db.transaction('entries').objectStore('entries').getAll();
      q.onsuccess = () => r(q.result);
    });
    const e = all.find((x) => x.title === t);
    return { status: e.status, started: e.dateStarted, stopped: e.dateStopped, finishes: e.finishes };
  }, title);

async function importGoodreads(page) {
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'Settings' }).first().click();
  await page.locator('input[type=file][accept*="csv"]').setInputFiles('e2e/fixtures/goodreads.csv');
  await expect(page.getByText(/From Goodreads: 3 new entries/)).toBeVisible();
  await page.keyboard.press('Escape');
}

async function choose(page, combobox, option) {
  await page.getByRole('combobox', { name: combobox }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test('an imported finish shows, and a new start keeps it', async ({ page }) => {
  await importGoodreads(page);
  await page.locator('.entry-card', { hasText: 'Leviathan Wakes' }).click();
  const field = page.locator('#journal-span');
  await expect(field).toContainText('– Mar 2, 2024');

  // The calendar opens on the finish, not on today.
  await field.click();
  await expect(page.getByRole('heading', { name: 'Finished Mar 2, 2024' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Year' })).toHaveText('2024');
  await expect(page.getByRole('combobox', { name: 'Month' })).toHaveText('March');

  await choose(page, 'Month', 'February');
  await page.getByRole('button', { name: 'February 10, 2024' }).click();
  await page.getByRole('button', { name: 'Choose' }).click();
  await expect(field).toHaveAttribute('data-value', '2024-02-10');
  await expect(field).toHaveAttribute('data-end', '2024-03-02');
  expect((await stored(page, 'Leviathan Wakes')).finishes).toHaveLength(1);

  // Starting the span again needs a finish before Choose: a finished book has one.
  await field.click();
  await choose(page, 'Year', '2023');
  await choose(page, 'Month', 'June');
  await page.getByRole('button', { name: 'June 1, 2023' }).click();
  await expect(page.getByText('Tap the day you finished.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose' })).toBeDisabled();
  await page.getByRole('button', { name: 'June 20, 2023' }).click();
  await page.getByRole('button', { name: 'Choose' }).click();
  await expect(field).toHaveAttribute('data-end', '2023-06-20');
  const after = await stored(page, 'Leviathan Wakes');
  expect(after.status).toBe('finished');
  expect(after.finishes.map((f) => f.slice(0, 10))).toEqual(['2023-06-20']);
});

test('putting a book down is dated', async ({ page }) => {
  await importGoodreads(page);
  await page.locator('.entry-card', { hasText: 'Piranesi' }).click();
  await page.getByRole('radio', { name: 'Did not finish' }).click();
  const field = page.locator('#journal-stopped');
  await expect(field).toHaveAttribute('data-value', /^\d{4}-\d{2}-\d{2}$/);
  expect((await stored(page, 'Piranesi')).stopped).toBeTruthy();

  await page.getByRole('radio', { name: 'Reading' }).click();
  await expect(field).toHaveCount(0);
  expect((await stored(page, 'Piranesi')).stopped).toBeNull();
});

test('the library filter ignores accents', async ({ page }) => {
  await importGoodreads(page);
  await page.getByRole('searchbox').fill('miserables');
  await expect(page.locator('.entry-card')).toHaveCount(1);
  await expect(page.locator('.entry-card')).toContainText('Les Misérables');
});
