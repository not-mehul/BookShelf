// Films and TV through TMDB, straight from the phone with the user's own key:
// search and add, the notice without a key, and the one-time move of a film
// still on a TheTVDB id once a key is saved.
import { test, expect } from './app-test.js';
import { readFileSync } from 'node:fs';

async function stubTmdb(page) {
  const asked = [];
  await page.route('https://api.themoviedb.org/3/**', (route) => {
    const url = new URL(route.request().url());
    asked.push(url.pathname + url.search);
    if (url.pathname === '/3/genre/movie/list')
      return route.fulfill({ json: { genres: [{ id: 878, name: 'Science Fiction' }] } });
    if (url.pathname === '/3/search/movie')
      return route.fulfill({
        json: {
          results: [
            {
              id: 329865,
              title: 'Arrival',
              original_title: 'Arrival',
              release_date: '2016-11-10',
              overview: 'Linguist meets heptapods.',
              poster_path: null,
              genre_ids: [878]
            }
          ]
        }
      });
    if (url.pathname === '/3/movie/329865')
      return route.fulfill({
        json: { id: 329865, runtime: 116, credits: { crew: [{ job: 'Director', name: 'Denis Villeneuve' }] } }
      });
    return route.fulfill({ status: 404, json: {} });
  });
  return asked;
}

async function searchFilms(page, q) {
  await page.getByRole('button', { name: 'Add to catalog' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: /Movie/ }).first().click();
  await page.getByRole('searchbox', { name: 'Search movies' }).fill(q);
  await page.getByRole('searchbox', { name: 'Search movies' }).press('Enter');
}

test('without a key, film search says where to add one', async ({ page }) => {
  await page.goto('/index.html');
  await searchFilms(page, 'arrival');
  await expect(page.getByText('TMDB isn’t set up.')).toBeVisible();
});

test.describe('with a key', () => {
  test.use({ shell: { http: 'fetch', secrets: { tmdb_api_key: 'abc123' } } });

  test('searches TMDB in English and adds the film with its TMDB id', async ({ page }) => {
    const asked = await stubTmdb(page);
    await page.goto('/index.html');
    await searchFilms(page, 'arrival');
    const row = page.locator('.add-result-row', { hasText: 'Arrival' });
    await expect(row).toContainText('2016');
    expect(asked.find((a) => a.startsWith('/3/search/movie'))).toMatch(/api_key=abc123/);
    expect(asked.find((a) => a.startsWith('/3/search/movie'))).toMatch(/language=en-US/);
    await page.getByRole('button', { name: 'Add Arrival' }).click();
    await page.keyboard.press('Escape');
    await page.locator('.entry-card', { hasText: 'Arrival' }).click();
    await expect(page.locator('dialog[open]')).toContainText('Denis Villeneuve');
    const stored = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const open = indexedDB.open('bookshelf');
          open.onsuccess = () => {
            const all = open.result.transaction('entries').objectStore('entries').getAll();
            all.onsuccess = () => resolve(all.result.find((e) => e.title === 'Arrival'));
          };
        })
    );
    expect(stored).toMatchObject({ sourceId: 'tmdb:329865', runtime: 116, creators: ['Denis Villeneuve'] });
  });
});

test.describe('moving from TheTVDB', () => {
  test.use({ shell: { http: 'fetch', secrets: { tmdb_api_key: 'abc123' } } });

  test('a film on a TheTVDB id moves to TMDB at start', async ({ page }) => {
    await stubTmdb(page);
    const shelf = JSON.parse(readFileSync('e2e/fixtures/shelf.json', 'utf8'));
    Object.assign(
      shelf.entries.find((e) => e.id === 'arrival'),
      { sourceId: '12345', enriched: true }
    );
    await page.goto('/index.html');
    await page.getByRole('button', { name: 'Settings' }).first().click();
    await page.locator('input[type=file][accept*="json"]').setInputFiles({
      name: 'shelf.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(shelf))
    });
    await expect(page.getByText(/^Imported \d+ entries/)).toBeVisible();
    // The move runs at start; a reload starts the app again.
    await page.reload();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            new Promise((resolve) => {
              const open = indexedDB.open('bookshelf');
              open.onsuccess = () => {
                const get = open.result.transaction('entries').objectStore('entries').get('arrival');
                get.onsuccess = () => resolve(get.result?.sourceId);
              };
            })
        )
      )
      .toBe('tmdb:329865');
  });
});
