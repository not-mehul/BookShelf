// Accessibility: axe finds no WCAG A/AA problems on the main screens, and the
// app still fits a phone with text at 200% (WCAG 1.4.4), and the new features
// (catalog import, Did not finish, ratings out of 10) work end to end.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const card = (page, title) =>
  page
    .locator('.entry-card')
    .filter({ has: page.locator('.entry-title', { hasText: new RegExp(`^${title}$`) }) });

async function importFixture(page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('input[type=file][accept*="json"]').setInputFiles('e2e/fixtures/shelf.json');
  await expect(page.getByText('Imported 7 entries')).toBeVisible();
}

const close = async (page) => {
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
};

async function axe(page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

/** Nothing on the page is wider than the screen. */
async function fits(page) {
  const over = await page.evaluate(() => {
    const el = document.scrollingElement;
    const dialog = document.querySelector('dialog[open] .modal-body, dialog[open]');
    const width = (n) => (n ? n.scrollWidth - n.clientWidth : 0);
    return Math.max(width(el), width(dialog));
  });
  expect(over).toBeLessThanOrEqual(1);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
  await importFixture(page);
});

test('the shelf, an entry, statistics and settings pass axe', async ({ page }) => {
  await axe(page);
  await close(page);
  await axe(page);
  await card(page, 'The Hobbit').click();
  await axe(page);
  await close(page);
  await page.getByRole('button', { name: 'View statistics' }).click();
  await axe(page);
});

test('everything fits with text at 200%', async ({ page }) => {
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await fits(page);
  await close(page);
  await fits(page);
  await card(page, 'The Hobbit').click();
  await fits(page);
  await close(page);
  await page.getByRole('button', { name: 'View statistics' }).click();
  await fits(page);
});

test('Did not finish is a status of its own', async ({ page }) => {
  await close(page);
  await card(page, 'The Hobbit').click();
  const status = page.locator('dialog[open]').getByRole('radiogroup', { name: 'Status' });
  await status.getByRole('radio', { name: 'Did not finish' }).click();
  await expect(status.getByRole('radio', { name: 'Did not finish' })).toHaveAttribute('aria-checked', 'true');
  await close(page);
  await expect(card(page, 'The Hobbit').locator('.entry-status-chip')).toHaveText('Did not finish');
});

test('ratings out of 10 take half points', async ({ page }) => {
  await page.locator('dialog[open]').getByRole('radio', { name: 'Out of 10' }).click();
  await close(page);
  await expect(card(page, "Rocannon's World").locator('.entry-rating-line')).toHaveText('6/10');
  await card(page, "Rocannon's World").click();
  const slider = page.getByRole('slider', { name: 'Rating' });
  await expect(slider).toHaveAttribute('aria-valuemax', '10');
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuetext', '6.5 out of 10');
  await close(page);
  await expect(card(page, "Rocannon's World").locator('.entry-rating-line')).toHaveText('6.5/10');
});

test('a Goodreads export imports, and importing it again adds nothing', async ({ page }) => {
  const csv = {
    name: 'goodreads_library_export.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'Book Id,Title,Author,ISBN13,My Rating,Exclusive Shelf,Date Read,Date Added,Bookshelves\n' +
        '1,"Piranesi",Susanna Clarke,"=""9781635575996""",5,read,2024/02/10,2024/01/02,read\n' +
        '2,The Hobbit,J.R.R. Tolkien,,0,to-read,,2024/01/02,to-read\n'
    )
  };
  const input = page.locator('input[type=file][accept*="csv"]');
  await input.setInputFiles(csv);
  await expect(page.getByText(/^From Goodreads: 1 new entry/)).toBeVisible();
  await input.setInputFiles(csv);
  await expect(page.getByText(/^From Goodreads: 0 new entries/)).toBeVisible();
  await close(page);
  await expect(card(page, 'Piranesi')).toHaveCount(1);
  await expect(card(page, 'Piranesi').locator('.entry-rating-line')).toHaveText('★★★★★');
});
