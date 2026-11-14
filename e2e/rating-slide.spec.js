// Rating by sliding a finger along the stars, with the magnified view while
// sliding. Touch goes through Chromium's own input pipeline (CDP), so the
// sideways-rates / vertical-scrolls split is the browser's real decision.
import { test, expect } from '@playwright/test';

async function openArrival(page) {
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('input[type=file][accept*="json"]').setInputFiles('e2e/fixtures/shelf.json');
  await expect(page.getByText('Imported 7 entries')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('.entry-card', { hasText: 'Arrival' }).click();
  const slider = page.locator('dialog[open]').getByRole('slider', { name: 'Rating' });
  await expect(slider).toHaveAttribute('aria-valuenow', '0');
  return slider;
}

const lensOpen = (page) =>
  page.evaluate(() => !!document.querySelector('dialog[open] .rating-lens:popover-open'));

test('sliding a finger along the stars rates, with a magnified view until it lifts', async ({ page }) => {
  const slider = await openArrival(page);
  const box = await slider.boundingBox();
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, x, ty = y) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y: ty, id: 1 }]
    });

  await touch('touchStart', box.x + 8);
  for (let x = box.x + 8; x <= box.x + box.width * 0.68; x += 8) await touch('touchMove', x);
  await expect.poll(() => lensOpen(page)).toBe(true);
  await expect(page.locator('dialog[open] .rating-lens:popover-open .rating-lens-value')).toHaveText(
    '3.5 / 5'
  );
  // Nothing is set until the finger lifts.
  await expect(slider).toHaveAttribute('aria-valuenow', '0');
  await touch('touchEnd');
  await expect(slider).toHaveAttribute('aria-valuenow', '3.5');
  await expect.poll(() => lensOpen(page)).toBe(false);

  // A tap still sets a value directly, with no magnified view.
  await touch('touchStart', box.x + box.width * 0.38);
  await touch('touchEnd');
  await expect(slider).toHaveAttribute('aria-valuenow', '2');
  expect(await lensOpen(page)).toBe(false);

  // A vertical swipe that starts on the stars scrolls the sheet instead.
  const card = page.locator('dialog[open] .modal-card');
  const before = await card.evaluate((el) => el.scrollTop);
  await touch('touchStart', box.x + 40);
  for (let i = 1; i <= 12; i++) await touch('touchMove', box.x + 40 + (i % 2), y - i * 15);
  await touch('touchEnd');
  await expect.poll(() => card.evaluate((el) => el.scrollTop)).toBeGreaterThan(before + 100);
  await expect(slider).toHaveAttribute('aria-valuenow', '2');
});

test('a mouse can drag across the stars too', async ({ page }) => {
  const slider = await openArrival(page);
  const box = await slider.boundingBox();
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 6, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.95, y, { steps: 12 });
  await expect.poll(() => lensOpen(page)).toBe(true);
  await expect(page.locator('dialog[open] .rating-lens:popover-open .rating-lens-value')).toHaveText('5 / 5');
  await page.mouse.up();
  await expect(slider).toHaveAttribute('aria-valuenow', '5');
  // The click a mouse sends after a drag doesn't count as tapping 5 again (which would clear it).
  await expect(slider).toHaveAttribute('aria-valuetext', '5 of 5 stars');
});
