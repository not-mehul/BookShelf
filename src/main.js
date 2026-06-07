import './util/android-bridge.js'; // patches fetch inside the Android wrapper; no-op on web
import { initTheme, buildThemeToggle } from './ui/theme.js';
import { el, clear } from './ui/components.js';
import { renderLibrary } from './ui/library.js';
import { renderSearch } from './ui/search.js';
import { renderSettings } from './ui/settings.js';
import { listEntries } from './db/database.js';

const TABS = [
  { id: 'library',  label: 'Library'  },
  { id: 'search',   label: 'Search'   },
  { id: 'settings', label: 'Settings' }
];

const state = { tab: 'library' };

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

  const controls = el('div', { class: 'header-controls' }, buildThemeToggle());

  header.appendChild(titleBlock);
  header.appendChild(controls);
  app.appendChild(header);

  // ── Stats bar (count summary) ─────────────────────────────────
  const statsBar = el('div', { class: 'stats-bar' });
  app.appendChild(statsBar);

  // ── Tab navigation ────────────────────────────────────────────
  const tabs = el('div', { class: 'tabs', role: 'tablist' });
  const tabButtons = {};
  for (const t of TABS) {
    const b = el('button', {
      type: 'button',
      role: 'tab',
      class: state.tab === t.id ? 'active' : '',
      onClick: () => switchTab(t.id)
    }, t.label);
    tabButtons[t.id] = b;
    tabs.appendChild(b);
  }
  app.appendChild(tabs);

  // ── Screen ────────────────────────────────────────────────────
  const screen = el('div', { id: 'screen' });
  app.appendChild(screen);

  // ── Footer ────────────────────────────────────────────────────
  const footnote = el('footer', { class: 'footnote' });
  footnote.innerHTML =
    '<strong>Private.</strong> Everything lives in your browser\'s local database. ' +
    'Covers are cached offline. Export to Markdown to take your catalog anywhere.';
  app.appendChild(footnote);

  // ── Routing ───────────────────────────────────────────────────
  function switchTab(id) {
    state.tab = id;
    for (const t of TABS) tabButtons[t.id].classList.toggle('active', t.id === id);
    render();
  }

  async function refreshStats() {
    const entries = await listEntries();
    const counts = { book: 0, movie: 0, tv: 0, quote: 0 };
    for (const e of entries) if (counts[e.type] != null) counts[e.type]++;
    clear(statsBar);
    if (!entries.length) {
      statsBar.appendChild(el('span', {}, '0 entries'));
      return;
    }
    statsBar.appendChild(el('span', { class: 'stat-accent' }, `${entries.length} entries`));
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

  function render() {
    const onChanged = () => { refreshStats(); render(); };
    if (state.tab === 'library') {
      renderLibrary(screen, { onChanged });
    } else if (state.tab === 'search') {
      renderSearch(screen, {
        onChanged,
        goToSettings: () => switchTab('settings')
      });
    } else if (state.tab === 'settings') {
      renderSettings(screen);
    }
  }

  await refreshStats();
  render();
}

boot().catch((err) => {
  console.error(err);
  document.getElementById('app').innerHTML =
    `<div class="msg-error" style="margin:3rem 1.5rem">Failed to start: ${err.message}</div>`;
});
