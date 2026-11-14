// The library's media tabs (icons, the chosen one with its word), the count
// under them, and the floating bar that brings the tabs back on scroll-up.
import { test, expect } from '@playwright/test';

async function importFixture(page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('input[type=file][accept*="json"]').setInputFiles('e2e/fixtures/shelf.json');
  await expect(page.getByText('Imported 7 entries')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
  await importFixture(page);
});

test('the tabs are icons, the chosen one shows its word, and the count sits under them', async ({ page }) => {
  const tabs = page.locator('.lib-types-row');
  const words = tabs.locator('.icon-tab-word');
  await expect(tabs.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
  // No counts on the tabs: one count, for what the tab shows, under them.
  await expect(tabs.locator('.badge')).toHaveCount(0);
  await expect(page.locator('.lib-count')).toHaveText('7 entries');

  await tabs.getByRole('tab', { name: 'Books' }).click();
  await expect(page.locator('.lib-count')).toHaveText('4 books');
  // Only the chosen tab's word is shown; the others keep it for screen readers.
  await expect(words.nth(1)).toHaveCSS('opacity', '1');
  await expect(words.nth(0)).toHaveCSS('opacity', '0');
  await expect(tabs.getByRole('tab', { name: 'All' })).toHaveAccessibleName('All');

  await page.getByRole('searchbox', { name: 'Filter library' }).fill('hob');
  await expect(page.locator('.lib-count')).toHaveText('1 of 4 books');

  await tabs.getByRole('tab', { name: 'TV' }).click();
  await page.getByRole('searchbox', { name: 'Filter library' }).fill('');
  await expect(page.locator('.lib-count')).toHaveText('1 TV show');
});

test('scrolling back up a little brings the tabs back in a floating bar', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 700 });
  const bar = page.locator('.floating-bar');
  await expect(bar).not.toHaveClass(/is-shown/);
  // Hidden from touch and screen readers until it slides in.
  await expect(page.getByRole('tablist', { name: 'Show' })).toHaveCount(1);

  await page.mouse.move(200, 400);
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 150);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(900);
  await expect(bar).not.toHaveClass(/is-shown/);

  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -20);
  await expect(bar).toHaveClass(/is-shown/);
  await expect(page.getByRole('tablist', { name: 'Show' })).toHaveCount(2);
  // Only the tabs: no theme toggle or Settings in the bar.
  await expect(bar.getByRole('switch')).toHaveCount(0);
  await expect(bar.getByRole('button', { name: 'Settings' })).toHaveCount(0);

  // A few pixels of jitter don't hide it; scrolling down does.
  await page.mouse.wheel(0, 4);
  await expect(bar).toHaveClass(/is-shown/);
  await page.mouse.wheel(0, 120);
  await expect(bar).not.toHaveClass(/is-shown/);

  // Choosing a tab from the bar shows that shelf from its start.
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -20);
  await expect(bar).toHaveClass(/is-shown/);
  await expect(bar).toHaveCSS('transform', 'none'); // finished sliding in
  const books = bar.getByRole('tab', { name: 'Books' });
  const box = await books.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('.lib-types-row').getByRole('tab', { name: 'Books' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(page.locator('.lib-types-row')).toBeInViewport();
  await expect(bar).not.toHaveClass(/is-shown/);
});
