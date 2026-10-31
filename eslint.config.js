import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

export default tseslint.config(
  { ignores: ['dist/', 'android-app/', 'node_modules/', 'test-results/', 'playwright-report/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.svelte'], svelteConfig }
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
    languageOptions: { globals: { ...globals.serviceworker } }
  },
  {
    files: ['scripts/**', 'design/**', '*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' }
  },
  {
    // Playwright: specs run in Node; fake-shell.js is injected into the page.
    files: ['e2e/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } }
  },
  {
    files: ['test/**/*.js', 'proxy/test/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.vitest } }
  }
);
