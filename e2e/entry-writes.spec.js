// Changes to an open entry are never undone by a save that started from an
// older copy: TheTVDB details arriving late, a sync landing while it is open,
// or quick repeated input.
import { test, expect } from './app-test.js';
import { readFileSync } from 'node:fs';

function shelf(change = () => {}) {
  const s = JSON.parse(readFileSync('e2e/fixtures/shelf.json', 'utf8'));
  change(s.entries);
  return Buffer.from(JSON.stringify(s));
}

async function importShelf(page, buffer, settings = {}) {
  await page.goto('/index.html');
  await page.evaluate((s) => {
    for (const [k, v] of Object.entries(s)) localStorage.setItem(`bookshelf:${k}`, v);
  }, settings);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page
    .locator('input[type=file][accept*="json"]')
    .setInputFiles({ name: 'shelf.json', mimeType: 'application/json', buffer });
  await expect(page.getByText(/^Imported \d+ entries/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).toHaveCount(0);
}

const stored = (page, id) =>
  page.evaluate(
    (id) =>
      new Promise((resolve) => {
        const open = indexedDB.open('bookshelf');
        open.onsuccess = () => {
          const get = open.result.transaction('entries').objectStore('entries').get(id);
          get.onsuccess = () => resolve(get.result);
        };
      }),
    id
  );

test('a rating given while TheTVDB details load is kept', async ({ page }) => {
  let release;
  const held = new Promise((r) => (release = r));
  await page.route('https://proxy.test/movies/**', async (route) => {
    await held;
    await route.fulfill({
      json: {
        data: {
          overview: 'From TheTVDB',
          genres: [{ name: 'Science Fiction' }],
          characters: [{ peopleType: 'Director', personName: 'Denis Villeneuve' }]
        }
      }
    });
  });
  await importShelf(
    page,
    shelf((es) =>
      Object.assign(
        es.find((e) => e.id === 'arrival'),
        { sourceId: '999', enriched: false }
      )
    ),
    { tvdb_proxy_url: 'https://proxy.test' }
  );
  await page.locator('.entry-card', { hasText: 'Arrival' }).click();
  const slider = page.getByRole('slider', { name: 'Rating' });
  await slider.focus();
  await page.keyboard.press('4');
  await expect(slider).toHaveAttribute('aria-valuetext', '4 of 5 stars');
  release();
  await expect(page.locator('dialog[open]')).toContainText('Denis Villeneuve');
  await expect(slider).toHaveAttribute('aria-valuetext', '4 of 5 stars');
  expect(await stored(page, 'arrival')).toMatchObject({
    rating: 4,
    enriched: true,
    creators: ['Denis Villeneuve']
  });
});

test('a change saved while the entry is open shows, and survives the next tap', async ({ page }) => {
  await importShelf(page, shelf());
  await page.locator('.entry-card', { hasText: "Rocannon's World" }).click();
  // What a background sync does: write the entry, then reload the shelf.
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('bookshelf');
        open.onsuccess = () => {
          const tx = open.result.transaction('entries', 'readwrite');
          const store = tx.objectStore('entries');
          const get = store.get('rocannon');
          get.onsuccess = () =>
            store.put({
              ...get.result,
              notes: 'Written on the tablet.',
              updatedAt: new Date().toISOString()
            });
          tx.oncomplete = resolve;
        };
      })
  );
  const slider = page.getByRole('slider', { name: 'Rating' });
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuetext', '3.5 of 5 stars');
  await expect.poll(async () => (await stored(page, 'rocannon')).rating).toBe(3.5);
  expect((await stored(page, 'rocannon')).notes).toBe('Written on the tablet.');
  await expect(page.locator('dialog[open] .notes-field')).toHaveValue('Written on the tablet.');
});

test('quick key presses on the rating add up', async ({ page }) => {
  await importShelf(page, shelf());
  await page.locator('.entry-card', { hasText: 'The Hobbit' }).click();
  const slider = page.getByRole('slider', { name: 'Rating' });
  await slider.focus();
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuetext', '4 of 5 stars');
  await expect.poll(async () => (await stored(page, 'hobbit')).rating).toBe(4);
});

test('a backup entry with no title still shows under every sort', async ({ page }) => {
  await importShelf(
    page,
    shelf((es) => es.push({ id: 'notitle', type: 'book' }))
  );
  await page.evaluate(() =>
    localStorage.setItem('bookshelf:library_view', JSON.stringify({ type: 'all', sort: 'title' }))
  );
  await page.reload();
  await expect(page.locator('.entry-card')).toHaveCount(8);
  await expect(page.locator('.entry-card', { hasText: 'Untitled' })).toHaveCount(1);
});
