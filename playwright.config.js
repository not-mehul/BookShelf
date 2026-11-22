import { defineConfig, devices } from '@playwright/test';

// End-to-end smoke tests against the production build, at phone size.
// Locally, point PW_CHROMIUM_PATH at an existing Chromium to skip the download.
const CI = Boolean(process.env.CI);
const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  // One baseline per screen, whatever the platform (see e2e/visual.spec.js).
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'phone',
      testIgnore: 'visual.spec.js',
      use: {
        ...devices['Pixel 7'],
        colorScheme: 'dark',
        launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}
      }
    },
    {
      // Screenshots of the main screens in both themes: npm run test:visual.
      name: 'visual',
      testMatch: 'visual.spec.js',
      use: {
        ...devices['Pixel 7'],
        launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}
      }
    }
  ],
  webServer: {
    command: `npm run build && npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !CI,
    timeout: 120_000
  }
});
