// The status buttons in an entry: equal, centred in their section, never wider
// than it, four across when every word fits whole and two by two when not.
import { test, expect } from '@playwright/test';

async function openArrival(page, width) {
  await page.setViewportSize({ width, height: 800 });
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('input[type=file][accept*="json"]').setInputFiles('e2e/fixtures/shelf.json');
  await expect(page.getByText('Imported 7 entries')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('.entry-card', { hasText: 'Arrival' }).click();
  await expect(page.locator('dialog[open] .status-picker')).toBeVisible();
}

const layout = (page) =>
  page.evaluate(() => {
    const picker = document.querySelector('dialog[open] .status-picker');
    const section = picker.closest('.modal-section');
    const s = section.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(section).paddingLeft);
    const buttons = [...picker.querySelectorAll('.status-option')].map((b) => b.getBoundingClientRect());
    return {
      widths: [...new Set(buttons.map((b) => Math.round(b.width)))],
      rows: new Set(buttons.map((b) => Math.round(b.top))).size,
      leftGap: Math.round(buttons[0].left - s.left - pad),
      rightGap: Math.round(s.right - pad - Math.max(...buttons.map((b) => b.right))),
      clipped: [...picker.querySelectorAll('.status-option-label')].some(
        (l) => l.scrollWidth > l.clientWidth + 0.5
      )
    };
  });

for (const [width, rows] of [
  [412, 1],
  [360, 2]
]) {
  test(`status buttons are equal and centred at ${width}px, in ${rows} row(s)`, async ({ page }) => {
    await openArrival(page, width);
    const l = await layout(page);
    expect(l.widths).toHaveLength(1);
    expect(l.rows).toBe(rows);
    expect(Math.abs(l.leftGap)).toBeLessThanOrEqual(1);
    expect(Math.abs(l.rightGap)).toBeLessThanOrEqual(1);
    expect(l.clipped).toBe(false);
  });
}

test('status buttons go two by two, unclipped, at 200% text', async ({ page }) => {
  await page.addInitScript(() =>
    document.addEventListener('DOMContentLoaded', () => (document.documentElement.style.fontSize = '200%'))
  );
  await openArrival(page, 412);
  const l = await layout(page);
  expect(l.widths).toHaveLength(1);
  expect(l.rows).toBe(2);
  expect(l.clipped).toBe(false);
});
