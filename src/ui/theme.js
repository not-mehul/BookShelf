// Dusk (default) / Dawn toggle. Persists choice; honors OS preference on first load.

import { getSetting, setSetting } from '../util/settings.js';
import { icons } from '../util/icons.js';

const KEY = 'theme';

export async function initTheme() {
  const saved = await getSetting(KEY, '');
  let mode = saved;
  if (mode !== 'light' && mode !== 'dark') {
    mode = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  apply(mode);
}

function apply(mode) {
  if (mode === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

export async function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const next = current === 'light' ? 'dark' : 'light';
  apply(next);
  await setSetting(KEY, next);
  return next;
}

export function buildThemeToggle() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'theme-toggle';
  btn.setAttribute('role', 'switch');
  btn.setAttribute('aria-label', 'Toggle theme');
  btn.innerHTML = `
    <span class="icon-moon">${icons.moon()}</span>
    <span class="icon-sun">${icons.sun()}</span>
    <span class="knob" aria-hidden="true"></span>
  `;
  const setAria = () => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    btn.setAttribute('aria-checked', isLight ? 'true' : 'false');
  };
  setAria();
  btn.addEventListener('click', async () => {
    await toggleTheme();
    setAria();
  });
  return btn;
}
