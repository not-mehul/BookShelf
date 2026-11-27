// Films and TV through TMDB, straight from the phone with the user's own key:
// search and add, the notice without a key, and checking a key as it's entered.
import { test, expect } from './app-test.js';

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
    // Adding opens the new entry, which loads its credits.
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

test.describe('entering a key', () => {
  test.use({ shell: { http: 'fetch' } });

  test('is checked with TMDB, can be shown, and Settings says the key is saved', async ({ page }) => {
    await page.route('https://api.themoviedb.org/3/configuration**', (route) => {
      const good = new URL(route.request().url()).searchParams.get('api_key') === 'good-key';
      return route.fulfill(good ? { json: { images: {} } } : { status: 401, json: { success: false } });
    });
    await page.goto('/index.html');
    await page.getByRole('button', { name: 'Settings' }).first().click();
    const fold = page.locator('details', { hasText: 'Films and TV' });
    await expect(fold.locator('.settings-fold-state')).toHaveText('Not set up');
    await fold.locator('summary').click();
    const box = page.getByLabel('API key or read access token');

    await box.fill('bad-key');
    await expect(fold.locator('.field-hint').first()).toHaveText(/wasn’t accepted/);
    await expect(fold.locator('.settings-fold-state')).toHaveText('Key not accepted');

    await box.fill('good-key');
    await expect(fold.locator('.field-hint').first()).toHaveText(
      'The key works: films and shows search TMDB.'
    );
    await expect(fold.locator('.settings-fold-state')).toHaveText('Key saved');
    expect(await page.evaluate(() => window.__keystore.tmdb_api_key)).toBe('good-key');

    // Hidden until the eye is tapped.
    await expect(box).toHaveAttribute('type', 'password');
    await fold.getByRole('button', { name: 'Show' }).click();
    await expect(box).toHaveAttribute('type', 'text');
    await expect(fold.getByRole('button', { name: 'Show' })).toHaveAttribute('aria-pressed', 'true');

    // Opened again later, a saved key says so.
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Settings' }).first().click();
    await expect(
      page.locator('details', { hasText: 'Films and TV' }).locator('.settings-fold-state')
    ).toHaveText('Key saved');
  });
});
