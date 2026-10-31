import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'android-app/**', 'node_modules/**', 'test-results/**', 'playwright-report/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js', '*.config.js', 'public/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error'
    }
  },
  {
    // Service worker runs in a worker scope, not window.
    files: ['public/sw.js'],
    languageOptions: { globals: { ...globals.serviceworker } }
  },
  {
    // Cloudflare Worker (proxy/): service-worker style globals (fetch, caches, Request…).
    files: ['proxy/src/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.serviceworker } }
  },
  {
    files: ['scripts/**/*.mjs', 'design/**/*.mjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node } }
  },
  {
    // Playwright: specs run in Node; fake-shell.js is injected into the page.
    files: ['e2e/**/*.js', 'playwright.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node, ...globals.browser } }
  },
  {
    files: ['test/**/*.js', '**/*.test.js'],
    languageOptions: { globals: { ...globals.node, ...globals.vitest } }
  }
];
