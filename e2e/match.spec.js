// Find a match fills in an imported book's cover and details from the
// catalog, one at a time from its menu or the whole shelf from Library
// refresh; copies of one book are merged from Settings' Duplicate check.
import { test, expect } from './app-test.js';

// A 1×1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64'
);
const VOLUMES = {
  leviathan: {
    id: 'lw',
    volumeInfo: {
      title: 'Leviathan Wakes',
      authors: ['James S. A. Corey'],
      publishedDate: '2011',
      description: 'Humanity has colonized the solar system.',
      categories: ['Fiction'],
      imageLinks: { thumbnail: 'https://covers.test/lw.png' }
    }
  },
  piranesi: {
    id: 'pi',
    volumeInfo: {
      title: 'Piranesi',
      authors: ['Susanna Clarke'],
      imageLinks: { thumbnail: 'https://covers.test/pi.png' }
    }
  },
  miserables: {
    id: 'lm',
    volumeInfo: {
      title: 'Les Misérables',
      authors: ['Victor Hugo'],
      imageLinks: { thumbnail: 'https://covers.test/lm.png' }
    }
  }
};

async function stubBooks(page) {
  await page.route('https://www.googleapis.com/books/v1/volumes**', (route) => {
    const q = new URL(route.request().url()).searchParams.get('q') || '';
    const key = Object.keys(VOLUMES).find((k) =>
      q.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().includes(k.slice(0, 6))
    );
    return route.fulfill({ json: { items: key ? [VOLUMES[key]] : [] } });
  });
  await page.route('https://openlibrary.org/**', (route) => route.fulfill({ json: { docs: [] } }));
  await page.route('https://covers.test/**', (route) =>
    route.fulfill({ body: PNG, contentType: 'image/png' })
  );
}

const stored = (page, title) =>
  page.evaluate(
    (t) =>
      new Promise((resolve) => {
        const open = indexedDB.open('bookshelf');
        open.onsuccess = () => {
          const all = open.result.transaction('entries').objectStore('entries').getAll();
          all.onsuccess = () => resolve(all.result.filter((e) => e.title === t));
        };
      }),
    title
  );

async function importGoodreads(page) {
  await page.getByRole('button', { name: 'Settings' }).first().click();
  await page.locator('input[type=file][accept*="csv"]').setInputFiles('e2e/fixtures/goodreads.csv');
  await expect(page.getByText(/From Goodreads: 3 new entries/)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await stubBooks(page);
  await page.goto('/index.html');
});

test('Find a match fills in an imported book and keeps what was there', async ({ page }) => {
  await importGoodreads(page);
  await page.keyboard.press('Escape');
  await page.locator('.entry-card', { hasText: 'Leviathan Wakes' }).click();
  // Open the menu once the sheet has slid up.
  await page
    .locator('dialog[open]')
    .evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
  await page.getByRole('button', { name: 'Actions for this entry' }).click();
  await page.getByRole('menuitem', { name: 'Find a match' }).click();
  await expect(page.getByRole('searchbox', { name: 'Search the catalog' })).toHaveValue('9780316129084');
  // The ISBN finds nothing here; the title does.
  await page.getByRole('searchbox', { name: 'Search the catalog' }).fill('Leviathan Wakes');
  await page.getByRole('searchbox', { name: 'Search the catalog' }).press('Enter');
  await page.locator('.match-row', { hasText: 'Leviathan Wakes' }).click();
  await expect(page.getByText('Fills in: Cover, Synopsis, Genres.')).toBeVisible();
  await page.getByRole('button', { name: 'Use this match' }).click();
  await expect(page.locator('dialog[open]')).toContainText('Humanity has colonized');
  const [book] = await stored(page, 'Leviathan Wakes');
  expect(book).toMatchObject({
    sourceId: 'lw',
    rating: 4,
    status: 'finished',
    thumbnailUrl: 'https://covers.test/lw.png'
  });
  expect(book.creators).toEqual(['James S.A. Corey']);
});

test('Library refresh finds matches, lets you choose, and fills in only what was missing', async ({
  page
}) => {
  // Les Misérables gets two editions to choose between; Piranesi is not found.
  await page.route('https://www.googleapis.com/books/v1/volumes**', (route) => {
    const q = (new URL(route.request().url()).searchParams.get('q') || '')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase();
    if (q.includes('leviathan')) return route.fulfill({ json: { items: [VOLUMES.leviathan] } });
    if (q.includes('miserables'))
      return route.fulfill({
        json: {
          items: [
            { id: 'lm1', volumeInfo: { title: 'Les Misérables, Volume 1', authors: ['Hugo'] } },
            {
              id: 'lm2',
              volumeInfo: { title: 'The Wretched', authors: ['V. Hugo'], description: 'Valjean.' }
            }
          ]
        }
      });
    return route.fulfill({ json: { items: [] } });
  });
  await importGoodreads(page);
  await expect(
    page.getByText('3 entries are missing a cover, synopsis or details.', { exact: false })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.locator('#modal-title')).toHaveText('Library refresh');
  await expect(page.getByText('Checked 3 entries.')).toBeVisible({ timeout: 15000 });

  const sure = page.locator('section', { has: page.getByRole('heading', { name: /Ready to update/ }) });
  await expect(sure.locator('.refresh-title')).toHaveText(['Leviathan Wakes']);
  await expect(sure.getByRole('checkbox', { name: 'Update Leviathan Wakes' })).toBeChecked();
  await expect(sure).toContainText('Fills in cover, synopsis, genres');

  const choose = page.locator('section', { has: page.getByRole('heading', { name: /Pick the right one/ }) });
  await choose.getByRole('radio', { name: /The Wretched/ }).click();
  await expect(choose.getByRole('checkbox', { name: 'Update Les Misérables' })).toBeChecked();

  const none = page.locator('section', { has: page.getByRole('heading', { name: /Not found/ }) });
  await expect(none.locator('.refresh-title')).toHaveText(['Piranesi']);
  await none.getByRole('button', { name: 'Leave as is' }).click();
  await expect(none).toHaveCount(0);

  await page.getByRole('button', { name: 'Update 2 entries' }).click();
  await expect(page.getByText(/^Updated 2 entries\./)).toBeVisible({ timeout: 15000 });
  const [book] = await stored(page, 'Leviathan Wakes');
  expect(book).toMatchObject({
    sourceId: 'lw',
    rating: 4,
    summary: 'Humanity has colonized the solar system.'
  });
  expect((await stored(page, 'Les Misérables'))[0]).toMatchObject({ sourceId: 'lm2', summary: 'Valjean.' });

  // Back in Settings, nothing is left to refresh: Piranesi was left as it is.
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByText('Everything on the shelf has its cover, synopsis and details.')).toBeVisible();
});

test('two copies of a book merge into one from Settings', async ({ page }) => {
  const copy = (id, extra) => ({
    id,
    type: 'book',
    title: 'Piranesi',
    creators: ['Susanna Clarke'],
    genres: [],
    tags: [],
    notes: '',
    summary: '',
    year: 2020,
    rating: null,
    status: null,
    sourceId: null,
    thumbnailUrl: null,
    dateAdded: '2025-01-01T00:00:00.000Z',
    dateRated: null,
    ...extra
  });
  const file = { version: 3, entries: [copy('p1', { rating: 5 }), copy('p2', { notes: 'Second copy' })] };
  await page.getByRole('button', { name: 'Settings' }).first().click();
  await page.locator('input[type=file][accept*="json"]').setInputFiles({
    name: 'dups.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file))
  });
  await expect(page.getByText(/^Imported 2 entries/)).toBeVisible();
  await expect(page.getByText('1 pair looks like the same thing twice.')).toBeVisible();
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Merge the two copies of Piranesi' }).click();
  await expect(page.getByText('No copies of the same thing found.')).toBeVisible();
  const left = await stored(page, 'Piranesi');
  expect(left).toHaveLength(1);
  expect(left[0]).toMatchObject({ rating: 5, notes: 'Second copy' });
});
