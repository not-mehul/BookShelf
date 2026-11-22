// Every season at once, on a show with more than one aired: the button by the
// Seasons label marks them all, clears them again, and Undo puts the entry back.
import { test, expect } from './app-test.js';
import { readFileSync } from 'node:fs';

/** The usual shelf, with Severance's second season aired (three episodes). */
function twoSeasonShelf() {
  const shelf = JSON.parse(readFileSync('e2e/fixtures/shelf.json', 'utf8'));
  const entries = shelf.entries ?? shelf;
  const show = entries.find((e) => e.id === 'sev');
  show.episodeGuide.episodes = show.episodeGuide.episodes
    .filter((ep) => ep.s !== 2)
    .concat(
      [1, 2, 3].map((e) => ({
        id: 200 + e,
        s: 2,
        e,
        name: `Episode ${e}`,
        aired: `2025-01-${10 + e}`,
        runtime: 50
      }))
    );
  return Buffer.from(JSON.stringify(shelf));
}

async function openSeverance(page, file) {
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page
    .locator('input[type=file][accept*="json"]')
    .setInputFiles({ name: 'shelf.json', mimeType: 'application/json', buffer: file });
  await expect(page.getByText('Imported 7 entries')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('.entry-card', { hasText: 'Severance' }).click();
  return page.locator('dialog[open]');
}

test('marks every season watched, clears them, and Undo puts it back', async ({ page }) => {
  const dialog = await openSeverance(page, twoSeasonShelf());
  const all = dialog.getByRole('button', { name: 'All seasons watched' });
  const season = (n) => dialog.getByRole('button', { name: new RegExp(`^Season ${n}\\b`) });
  await expect(dialog.locator('.seasons-summary')).toContainText('0 of 2 seasons watched');
  await expect(all).toHaveAttribute('aria-pressed', 'false');
  const statusBefore = await dialog.getByRole('radio', { checked: true }).getAttribute('class');

  await all.click();
  await expect(dialog.locator('.seasons-summary')).toContainText('2 of 2 seasons watched');
  await expect(season(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(season(2)).toHaveAttribute('aria-pressed', 'true');
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#toast')).toContainText('Marked 2 seasons watched.');

  await page.locator('#toast').getByRole('button', { name: 'Undo' }).click();
  await expect(dialog.locator('.seasons-summary')).toContainText('0 of 2 seasons watched');
  await expect(all).toHaveAttribute('aria-pressed', 'false');
  await expect(dialog.getByRole('radio', { checked: true })).toHaveAttribute('class', statusBefore);

  // Pressed again once everything is watched, it clears them.
  await all.click();
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await all.click();
  await expect(dialog.locator('.seasons-summary')).toContainText('0 of 2 seasons watched');
  await expect(page.locator('#toast')).toContainText('Cleared 2 watched seasons.');
});

test('a show with one aired season has no all-seasons button', async ({ page }) => {
  const dialog = await openSeverance(page, readFileSync('e2e/fixtures/shelf.json'));
  await expect(dialog.locator('.seasons-summary')).toContainText('of 1 season watched');
  await expect(dialog.getByRole('button', { name: 'All seasons watched' })).toHaveCount(0);
});
