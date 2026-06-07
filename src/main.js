import './util/android-bridge.js'; // patches fetch inside the Android wrapper; no-op on web
import { initTheme } from './ui/theme.js';
import { el, clear } from './ui/components.js';
import { icons } from './util/icons.js';
import { renderLibrary } from './ui/library.js';
import { openSettings } from './ui/settings.js';
import { openAddFlow } from './ui/add-flow.js';
import { listEntries } from './db/database.js';

async function boot() {
  await initTheme();

  const app = document.getElementById('app');
  clear(app);

  // ── Header ────────────────────────────────────────────────────
  const header = el('header', { class: 'site-header' });

  const titleBlock = el('div', { class: 'title-block' });
  const h1 = el('h1', { class: 'site-title' });
  h1.innerHTML = 'Book<em>Shelf</em>';
  titleBlock.appendChild(h1);

  const settingsBtn = el('button', {
    type: 'button',
    class: 'btn-icon',
    'aria-label': 'Settings',
    title: 'Settings',
    onClick: () => openSettings()
  });
  settingsBtn.innerHTML = icons.settings();

  const controls = el('div', { class: 'header-controls' }, settingsBtn);

  header.appendChild(titleBlock);
  header.appendChild(controls);
  app.appendChild(header);

  // ── Stats bar (count summary) ─────────────────────────────────
  const statsBar = el('div', { class: 'stats-bar' });
  app.appendChild(statsBar);

  // ── Screen (Library) ──────────────────────────────────────────
  const screen = el('div', { id: 'screen' });
  app.appendChild(screen);

  // ── Floating add button (FAB) ─────────────────────────────────
  const fab = el('button', {
    type: 'button',
    class: 'fab',
    'aria-label': 'Add to catalog',
    title: 'Add to catalog',
    onClick: () => openAddFlow({ onChanged, goToSettings: () => openSettings() })
  });
  fab.innerHTML = icons.plus();
  document.body.appendChild(fab);

  // ── Stats + render ────────────────────────────────────────────
  async function refreshStats() {
    const entries = await listEntries();
    const counts = { book: 0, movie: 0, tv: 0, quote: 0 };
    for (const e of entries) if (counts[e.type] != null) counts[e.type]++;
    clear(statsBar);
    if (!entries.length) {
      statsBar.appendChild(el('span', {}, '0 entries'));
      return;
    }
    statsBar.appendChild(el('span', { class: 'stat-accent' }, `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`));
    const parts = [
      counts.book  ? `${counts.book} ${counts.book  === 1 ? 'book'  : 'books' }` : null,
      counts.movie ? `${counts.movie} ${counts.movie === 1 ? 'movie' : 'movies'}` : null,
      counts.tv    ? `${counts.tv} ${counts.tv === 1 ? 'show' : 'shows'}` : null,
      counts.quote ? `${counts.quote} ${counts.quote === 1 ? 'quote' : 'quotes'}` : null
    ].filter(Boolean);
    for (const p of parts) {
      statsBar.appendChild(el('span', { class: 'stat-sep' }));
      statsBar.appendChild(el('span', {}, p));
    }
  }

  function onChanged() { refreshStats(); render(); }

  function render() {
    renderLibrary(screen, { onChanged });
  }

  await refreshStats();
  render();
}

boot().catch((err) => {
  console.error(err);
  document.getElementById('app').innerHTML =
    `<div class="msg-error" style="margin:3rem 1.5rem">Failed to start: ${err.message}</div>`;
});
