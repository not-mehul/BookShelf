// BookShelf runs only inside its Android shell, so every spec's page gets the
// simulated shell (e2e/fake-shell.js) before the app loads. Its native HTTP
// makes real requests from the page, so page.route() stubs answer searches.
// Override per file with test.use({ shell: { … } }).
import { test as base, expect } from '@playwright/test';
import { installFakeShell } from './fake-shell.js';

export const test = base.extend({
  shell: [{ http: 'fetch' }, { option: true }],
  page: async ({ page, shell }, use) => {
    await page.addInitScript(installFakeShell, shell);
    await use(page);
  }
});

export { expect };
