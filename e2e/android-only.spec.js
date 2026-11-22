// BookShelf is an Android app: opened in a plain browser, the build says so
// and does nothing else (no service worker, no database).
import { test, expect } from '@playwright/test';

test('outside the Android app, the page says it is an Android app', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#app')).toContainText('BookShelf is an Android app');
  await expect(page.getByRole('link', { name: 'Get the Android app' })).toHaveAttribute(
    'href',
    'https://github.com/not-mehul/BookShelf/releases/latest'
  );
  await expect(page.locator('.fab')).toHaveCount(0);
  expect(await page.evaluate(async () => !(await navigator.serviceWorker?.getRegistration()))).toBe(true);
  expect(await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))).toEqual([]);
  await expect(page.locator('link[rel=manifest]')).toHaveCount(0);
});
