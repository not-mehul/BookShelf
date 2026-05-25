import { initTheme, buildThemeToggle } from './ui/theme.js';
import { el, clear } from './ui/components.js';
import { renderLibrary } from './ui/library.js';
import { renderSearch } from './ui/search.js';
import { renderSettings } from './ui/settings.js';
import { icons } from './util/icons.js';

const TABS = [
  { id: 'library', label: 'Library' },
  { id: 'search', label: 'Search' },
  { id: 'settings', label: 'Settings' }
];

const state = { tab: 'library' };

async function boot() {
  await initTheme();

  const app = document.getElementById('app');
  clear(app);

  // Header
  const header = el('header', { class: 'site-header' });
  const titleBlock = el(
    'div',
    {},
    el('h1', { class: 'site-title', html: 'Book<em>Shelf</em>' }),
    el('p', { class: 'tagline' }, 'A private catalog for books, films, and shows.')
  );
  const controls = el('div', { class: 'header-controls' }, buildThemeToggle());
  header.appendChild(titleBlock);
  header.appendChild(controls);
  app.appendChild(header);

  // Tabs
  const tabs = el('div', { class: 'tabs', role: 'tablist' });
  const tabButtons = {};
  for (const t of TABS) {
    const b = el(
      'button',
      {
        type: 'button',
        role: 'tab',
        class: state.tab === t.id ? 'active' : '',
        onClick: () => switchTab(t.id)
      },
      t.label
    );
    tabButtons[t.id] = b;
    tabs.appendChild(b);
  }
  app.appendChild(tabs);

  // Screen container
  const screen = el('div', { class: 'screen', id: 'screen' });
  app.appendChild(screen);

  // Footer
  const footnote = el('footer', { class: 'footnote' });
  footnote.innerHTML =
    '<strong>Private.</strong> Everything lives in this device. ' +
    'Catalog entries persist in local storage. ' +
    'Export to Markdown when you want to take it with you.';
  app.appendChild(footnote);

  function switchTab(id) {
    state.tab = id;
    for (const t of TABS) tabButtons[t.id].classList.toggle('active', t.id === id);
    render();
  }

  function render() {
    if (state.tab === 'library') {
      renderLibrary(screen, { onChanged: render });
    } else if (state.tab === 'search') {
      renderSearch(screen, {
        onChanged: render,
        goToSettings: () => switchTab('settings')
      });
    } else if (state.tab === 'settings') {
      renderSettings(screen);
    }
  }

  render();
}

boot().catch((err) => {
  console.error(err);
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = `<div class="error" style="margin-top:2rem">Failed to start: ${err.message}</div>`;
  }
});
