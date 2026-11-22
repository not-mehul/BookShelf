// Screenshot tests: the main screens in Dusk and Dawn, at phone and tablet
// width, compared with the baselines in e2e/__screenshots__.
//
// Everything that varies between machines or runs is pinned: the sans and mono
// fonts come from e2e/fonts (the app itself uses the phone's own), the clock
// is fixed, motion is reduced, and the shelf is e2e/fixtures/visual-shelf.json.
//
//   npm run test:visual                      compare
//   npm run test:visual -- --update-snapshots  accept the new look
//
// Baselines are taken on Linux (as in CI); text renders a little differently
// elsewhere, so update them from CI or a Linux machine.
import { readFileSync } from 'node:fs';
import { test, expect } from './app-test.js';

const FONTS = new URL('./fonts/', import.meta.url);
const FACES = [
  ['BookShelf Test Sans', 'inter-regular.woff2', 400],
  ['BookShelf Test Sans', 'inter-medium.woff2', 500],
  ['BookShelf Test Sans', 'inter-semibold.woff2', 600],
  ['BookShelf Test Mono', 'dejavu-sans-mono.woff2', 400]
];
const FONT_CSS =
  FACES.map(
    ([family, file, weight]) =>
      `@font-face { font-family: '${family}'; src: url('https://fonts.test/${file}') format('woff2'); font-weight: ${weight}; }`
  ).join('\n') +
  `\nhtml { --font-sans: 'BookShelf Test Sans', sans-serif !important; --font-mono: 'BookShelf Test Mono', monospace !important; }`;

// Saturday 21 November 2026, midday: the fixture's dates are all earlier in 2026.
const NOW = new Date('2026-11-21T12:00:00-06:00');

test.use({ timezoneId: 'America/Chicago', locale: 'en-US', contextOptions: { reducedMotion: 'reduce' } });

async function open(page, theme) {
  await page.route('https://fonts.test/*', (route) =>
    route.fulfill({
      contentType: 'font/woff2',
      body: readFileSync(new URL(route.request().url().split('/').pop(), FONTS))
    })
  );
  await page.clock.setFixedTime(NOW);
  await page.addInitScript((t) => localStorage.setItem('bookshelf:theme', t), theme);
  await page.addInitScript((css) => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.append(style);
    });
  }, FONT_CSS);
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'Settings' }).first().click();
  await page.locator('input[type=file][accept*="json"]').setInputFiles('e2e/fixtures/visual-shelf.json');
  await expect(page.getByText(/^Imported \d+ entries/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.evaluate(async () => {
    await Promise.all(
      ['400', '500', '600'].map((w) => document.fonts.load(`${w} 16px "BookShelf Test Sans"`))
    );
    await document.fonts.load('16px "BookShelf Test Mono"');
    await document.fonts.ready;
  });
}

// The whole sheet or page, as far as the screen shows it.
const shot = (page, name) =>
  expect(page).toHaveScreenshot(`${name}.png`, { animations: 'disabled', caret: 'hide' });

const card = (page, title) => page.locator('.entry-card:not(.quote-card)', { hasText: title }).first();
const sheet = (page) => page.locator('dialog[open] .modal-card');
const scrollSheet = (page, to) => sheet(page).evaluate((el, y) => (el.scrollTop = y), to);

for (const theme of ['dark', 'light']) {
  const name = theme === 'dark' ? 'dusk' : 'dawn';

  test.describe(`${name}, phone`, () => {
    test.beforeEach(({ page }) => open(page, theme));

    test('library', async ({ page }) => {
      await shot(page, `${name}-library`);
      await page.getByRole('button', { name: 'More library actions' }).click();
      await shot(page, `${name}-library-menu`);
      await page.getByRole('menuitem', { name: 'Show as a list' }).click();
      await shot(page, `${name}-library-list`);
    });

    test('a book', async ({ page }) => {
      await card(page, 'Tomorrow, and').click();
      await shot(page, `${name}-entry-book`);
      await scrollSheet(page, 100_000);
      await shot(page, `${name}-entry-book-end`);
    });

    test('a show and a quote', async ({ page }) => {
      await card(page, 'Severance').click();
      await shot(page, `${name}-entry-tv`);
      await page.keyboard.press('Escape');
      await page.getByRole('tab', { name: 'Quotes' }).first().click();
      await page.locator('.quote-card').first().click();
      await shot(page, `${name}-entry-quote`);
    });

    test('adding', async ({ page }) => {
      await page.locator('.fab').click();
      await shot(page, `${name}-add`);
    });

    test('settings, statistics and the queue', async ({ page }) => {
      await page.getByRole('button', { name: 'Settings' }).first().click();
      await shot(page, `${name}-settings`);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Stats', exact: true }).click();
      await shot(page, `${name}-stats`);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Queue', exact: true }).click();
      await shot(page, `${name}-queue`);
    });
  });

  test.describe(`${name}, tablet`, () => {
    test.use({ viewport: { width: 900, height: 1200 }, isMobile: false, hasTouch: true });
    test.beforeEach(({ page }) => open(page, theme));

    test('library and a book', async ({ page }) => {
      await shot(page, `${name}-tablet-library`);
      await card(page, 'Tomorrow, and').click();
      await shot(page, `${name}-tablet-entry`);
    });
  });
}
