// Shelf features, against e2e/fixtures/shelf.json imported through Settings.
import { test, expect } from '@playwright/test';
import { installFakeShell } from './fake-shell.js';

/** A library card by its exact title (quotes can mention titles too). */
const card = (page, title) =>
  page.locator('.entry-card').filter({ has: page.locator('.entry-title', { hasText: new RegExp(`^${title}$`) }) });

async function importFixture(page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('input[type=file][accept*="json"]').setInputFiles('e2e/fixtures/shelf.json');
  await expect(page.getByText('Imported 7 entries')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).toHaveCount(0);
}

test.describe('in the browser', () => {
  test.beforeEach(async ({ page }) => {
    page.__errors = [];
    page.on('pageerror', (e) => page.__errors.push(e.message));
    await page.goto('/index.html');
    await importFixture(page);
  });
  test.afterEach(async ({ page }) => expect(page.__errors).toEqual([]));

  test('half-star rating via keyboard shows on the card', async ({ page }) => {
    await card(page, "Rocannon's World").click();
    const slider = page.getByRole('slider', { name: 'Rating' });
    await expect(slider).toHaveAttribute('aria-valuenow', '3');
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuetext', '3.5 of 5 stars');
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog')).toHaveCount(0);
    await expect(card(page, "Rocannon's World").locator('.entry-rating-line')).toHaveText('★★★½☆');
  });

  test('quotes link to their book, both ways', async ({ page }) => {
    await card(page, 'The Left Hand of Darkness').click();
    const quote = page.locator('dialog[open] .linked-quote');
    await expect(quote).toContainText('Light is the left hand of darkness');
    await expect(quote).toContainText('p. 233');
    await quote.click();
    await page.locator('dialog[open] .quote-from-link').click();
    await expect(page.locator('dialog[open] #modal-title')).toHaveText('The Left Hand of Darkness');

    // "Add a quote" opens the quote form already linked to this book.
    await page.getByRole('button', { name: 'Add a quote' }).click();
    await expect(page.locator('dialog[open] .picker-chip-title')).toContainText('The Left Hand of Darkness');
    await expect(page.locator('#q-source')).toHaveValue('The Left Hand of Darkness');
  });

  test('series section shows the order and what comes next', async ({ page }) => {
    await card(page, 'The Left Hand of Darkness').click();
    const items = page.locator('dialog[open] .series-item .series-title');
    await expect(items).toHaveText(["Rocannon's World", 'The Left Hand of Darkness', 'The Dispossessed']);
    await expect(page.locator('dialog[open] .series-next')).toHaveText('Next: #5 The Dispossessed');
    await page.keyboard.press('Escape');
    await page.getByRole('combobox', { name: 'Sort by' }).selectOption('series');
    const titles = await page.locator('.entry-title').allTextContents();
    expect(titles.slice(0, 3)).toEqual(["Rocannon's World", 'The Left Hand of Darkness', 'The Dispossessed']);
  });

  test('queue: reorder persists, and pick-for-me respects filters', async ({ page }) => {
    const openQueue = () => page.getByRole('button', { name: 'Your queue' }).click();
    const order = () => page.locator('dialog[open] .queue-title').allTextContents();
    await openQueue();
    await expect.poll(order).toEqual(['The Hobbit', 'The Dispossessed', 'Arrival']); // loads async
    await page.getByRole('button', { name: 'Move The Hobbit down' }).click();
    await expect.poll(order).toEqual(['The Dispossessed', 'The Hobbit', 'Arrival']);
    // Keyboard on the drag handle.
    await page.getByRole('button', { name: /^Reorder Arrival/ }).focus();
    await page.keyboard.press('ArrowUp');
    await expect.poll(order).toEqual(['The Dispossessed', 'Arrival', 'The Hobbit']);
    await page.keyboard.press('Escape');
    await openQueue();
    await expect.poll(order).toEqual(['The Dispossessed', 'Arrival', 'The Hobbit']);

    await page.locator('dialog[open] .queue-filters button', { hasText: 'Movies' }).click();
    await page.getByRole('button', { name: 'Pick something for me' }).click();
    await expect(page.locator('.queue-pick-title')).toHaveText('Arrival');
  });

  test('bulk select: tag several entries, then delete them', async ({ page }) => {
    await page.getByRole('button', { name: 'Select entries' }).click();
    await card(page, 'Arrival').click();
    await card(page, 'The Hobbit').click();
    await expect(card(page, 'Arrival')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('.select-count')).toHaveText('2 selected');
    await page.getByRole('button', { name: 'Edit…' }).click();
    await page.getByLabel('Add tag').fill('Weekend');
    await page.getByRole('button', { name: 'Apply to 2' }).click();
    await page.locator('.lib-tags-row .chip', { hasText: 'Weekend' }).click();
    await expect(page.locator('.entry-card')).toHaveCount(2);

    // Deleting offers an undo instead of asking first.
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('.stats-bar')).toContainText('5 entries');
    await expect(page.locator('.select-bar')).toBeHidden();
    await expect(page.locator('#toast')).toContainText('Deleted 2 entries.');
    await page.locator('#toast').getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('.stats-bar')).toContainText('7 entries');
  });

  test('TV episodes: up next, mark watched, seasons', async ({ page }) => {
    await expect(page.locator('.up-next-ep')).toHaveText('S1 E3 · In Perpetuity');
    await page.getByRole('button', { name: 'Mark S1 E3 of Severance watched' }).click();
    await expect(page.locator('.up-next-ep')).toHaveText('S1 E4 · The You You Are');

    await card(page, 'Severance').click();
    const section = page.locator('dialog[open] .episodes-section');
    await expect(section.locator('.episodes-summary')).toHaveText('3 of 4 aired episodes watched · 1 upcoming');
    await section.getByRole('button', { name: 'Mark season watched' }).click();
    await expect(section.locator('.episodes-summary')).toHaveText('4 of 4 aired episodes watched · 1 upcoming');
    await expect(section.locator('.episodes-next-note')).toContainText('Caught up — S2 E1 airs');
    // Unaired episodes can't be ticked; specials are listed but don't count.
    await section.locator('summary', { hasText: 'Season 2' }).click();
    await expect(section.getByLabel(/Hello, Ms. Cobel/)).toBeDisabled();
    await expect(section.locator('summary', { hasText: 'Specials' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.up-next-when')).toHaveText(/^airs 2099-01-17$/);
  });

  test('share cards render in every format and theme', async ({ page }) => {
    await card(page, 'The Left Hand of Darkness').click();
    await page.locator('dialog[open]').getByRole('button', { name: 'Share' }).click();
    const preview = page.locator('.share-card-preview');
    const size = () => preview.evaluate((img) => `${img.naturalWidth}x${img.naturalHeight}`);
    await expect.poll(size).toBe('1080x1350');
    await page.locator('.share-card-controls button', { hasText: 'Story' }).click();
    await expect.poll(size).toBe('1080x1920');
    await page.locator('.share-card-controls button', { hasText: 'Square' }).click();
    await expect.poll(size).toBe('1080x1080');
    await expect(page.getByRole('button', { name: 'Save image' })).toBeEnabled();
    // Dusk vs Dawn produce visibly different images.
    const pixel = () => preview.evaluate(async (img) => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      return Array.from(g.getImageData(10, 10, 1, 1).data.slice(0, 3)).reduce((a, b) => a + b, 0);
    });
    const dusk = await pixel();
    await page.locator('.share-card-controls button', { hasText: 'Dawn' }).click();
    await expect.poll(pixel).toBeGreaterThan(dusk + 300);
  });
});

test.describe('in the Android shell', () => {
  test('share image goes to the native share sheet as a PNG', async ({ page }) => {
    await page.addInitScript(installFakeShell, {});
    await page.goto('/index.html');
    await importFixture(page);
    await page.getByRole('tab', { name: 'Quotes' }).click();
    await page.locator('.quote-card').first().click();
    await page.locator('dialog[open]').getByRole('button', { name: 'Share' }).click();
    await expect(page.locator('.share-card-preview')).toHaveAttribute('src', /^blob:/);
    await expect(page.getByRole('button', { name: 'Save image' })).toHaveCount(0); // no downloads in the app
    await page.getByRole('button', { name: 'Share image' }).click();
    const shareCall = () => page.evaluate(() => window.__sent.find((m) => m.method === 'shareFile'));
    await expect.poll(shareCall).toBeTruthy();
    const call = await shareCall();
    expect(call.params.mime).toBe('image/png');
    expect(call.params.filename).toMatch(/card\.png$/);
    expect(call.params.base64.startsWith('iVBORw0KGgo')).toBe(true); // PNG signature
  });

  test('new-episode alerts ask for permission, and revert if refused', async ({ page }) => {
    await page.addInitScript(installFakeShell, { notificationsAllowed: false });
    await page.goto('/index.html');
    await importFixture(page);
    await card(page, 'Severance').click();
    const toggle = page.getByLabel('New-episode alerts');
    // click(), not check(): the app immediately reverts it when permission is refused.
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await expect(page.locator('.remind-note')).toContainText('Notifications are off');
  });

  test('new-episode alerts, when allowed, schedule reminders natively', async ({ page }) => {
    await page.addInitScript(installFakeShell, { notificationsAllowed: true });
    await page.goto('/index.html');
    await importFixture(page);
    await card(page, 'Severance').click();
    await page.getByLabel('New-episode alerts').check();
    await expect(page.getByLabel('New-episode alerts')).toBeChecked();
    await expect.poll(() => page.evaluate(() => window.__sent.filter((m) => m.method === 'episodeReminders').length)).toBeGreaterThan(0);
  });
});
