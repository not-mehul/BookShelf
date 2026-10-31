// Dusk (default) / Dawn. Persists the choice; follows the OS on first load.

import { getSetting, setSetting } from '../util/settings';
import { setNativeTheme } from './native';

export type ThemeMode = 'dark' | 'light';

const KEY = 'theme';
// Browser/PWA chrome colour per theme (matches --bg-grad-top in tokens.css).
const THEME_COLOR: Record<ThemeMode, string> = { dark: '#14110e', light: '#f3ece0' };

export function currentTheme(): ThemeMode {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

export async function initTheme(): Promise<void> {
  const saved = await getSetting(KEY, '');
  const mode: ThemeMode =
    saved === 'light' || saved === 'dark'
      ? saved
      : window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark';
  apply(mode);
}

function apply(mode: ThemeMode): void {
  if (mode === 'light') document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[mode]);
  setNativeTheme(mode);
}

export async function setTheme(mode: ThemeMode): Promise<void> {
  apply(mode);
  await setSetting(KEY, mode);
}
