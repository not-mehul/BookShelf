// The theme preference (style.md §2): System, Dusk or Dawn. System follows the
// OS and keeps following it. New installs start on System.

import { getSetting, setSetting } from '../util/settings';
import { setNativeTheme } from './native';

/** What is shown: Dusk is 'dark', Dawn is 'light'. */
export type ThemeMode = 'dark' | 'light';
/** What is chosen. */
export type ThemeChoice = 'system' | ThemeMode;

// Stored as bookshelf:theme in localStorage; index.html reads it before the first paint.
const KEY = 'theme';

const media = globalThis.matchMedia?.('(prefers-color-scheme: dark)');

export const theme = $state<{ choice: ThemeChoice; shown: ThemeMode }>({ choice: 'system', shown: 'dark' });

/** Called after the theme on screen changes (the widget re-skins itself). */
let onChange: (() => void) | null = null;

export function currentTheme(): ThemeMode {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function resolve(choice: ThemeChoice): ThemeMode {
  if (choice !== 'system') return choice;
  return media?.matches === false ? 'light' : 'dark';
}

function paint(): void {
  const mode = resolve(theme.choice);
  const changed = mode !== currentTheme() || mode !== theme.shown;
  document.documentElement.setAttribute('data-theme', mode);
  theme.shown = mode;
  const surface = getComputedStyle(document.documentElement).getPropertyValue('--bg-grad-mid').trim();
  if (surface) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', surface);
  setNativeTheme(mode);
  dispatchEvent(new Event('themechange'));
  if (changed) onChange?.();
}

export async function initTheme(changed?: () => void): Promise<void> {
  const saved = await getSetting(KEY, '');
  theme.choice = saved === 'light' || saved === 'dark' ? saved : 'system';
  media?.addEventListener('change', () => {
    if (theme.choice === 'system') paint();
  });
  paint();
  onChange = changed ?? null;
}

export async function setTheme(choice: ThemeChoice): Promise<void> {
  theme.choice = choice;
  paint();
  await setSetting(KEY, choice);
}

/** The header switch: picks the side opposite to the one on screen. */
export function toggleTheme(): Promise<void> {
  return setTheme(theme.shown === 'dark' ? 'light' : 'dark');
}
