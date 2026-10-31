import { installNativeBridge, isNativeShell, onNativeEvent, notifyNativeReady } from './platform/native.js';
import { parseSharedText } from './util/share-intake.js';
import { startAutoSync } from './sync/sync.js';
import { pushWidgetSummary } from './platform/widget.js';
import { pushEpisodeReminders, refreshFollowedGuides } from './api/episode-sync.js';
import { openEntry } from './ui/detail-modal.js';
import { initTheme } from './ui/theme.js';
import { el, clear } from './ui/components.js';
import { icons } from './util/icons.js';
import { renderLibrary } from './ui/library.js';
import { openSettings } from './ui/settings.js';
import { openAddFlow } from './ui/add-flow.js';
import { listEntries } from './db/database.js';

// Must run before anything fetches: routes cross-origin calls through the
// Android shell's native HTTP. A no-op in a plain browser.
installNativeBridge();

async function boot() {
  await initTheme();

  const app = /** @type {HTMLElement} */ (document.getElementById('app'));
  clear(app);

  // ── Header ────────────────────────────────────────────────────
  const header = el('header', { class: 'site-header' });

  const titleBlock = el('div', { class: 'title-block' });
  const h1 = el('h1', { class: 'site-title' });
  h1.innerHTML = 'Book<em>Shelf</em>';
  titleBlock.appendChild(h1);
  titleBlock.appendChild(el('p', { class: 'site-subtitle' }, '-by Mehul'));

  const settingsBtn = el('button', {
    type: 'button',
    class: 'btn-icon',
    'aria-label': 'Settings',
    title: 'Settings',
    onClick: () => openSettings({ onChanged })
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
    onClick: () => openAdd()
  });
  fab.innerHTML = icons.plus();
  document.body.appendChild(fab);

  // ── Stats + render ────────────────────────────────────────────
  async function refreshStats() {
    const entries = await listEntries();
    void pushWidgetSummary(entries); // keep the home-screen widget current
    void pushEpisodeReminders(entries); // and the Android new-episode alerts
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

  // Local edits: refresh, then schedule a (debounced) sync push.
  /** @type {() => void} */
  let scheduleSync = () => {};
  function onChanged() { refreshStats(); render(); scheduleSync(); }

  function render() {
    renderLibrary(screen, { onChanged });
  }

  /** @param {import('./util/share-intake.js').SharedInput} [shared] */
  function openAdd(shared) {
    openAddFlow({
      onChanged,
      goToSettings: () => openSettings({ onChanged }),
      prefill: shared ? parseSharedText(shared) : undefined
    });
  }

  await refreshStats();
  render();

  // Text shared from another app: Android share sheet (native event) …
  onNativeEvent('shared', (data) => openAdd(data || {}));
  // … the home-screen widget's "+" button …
  onNativeEvent('openAdd', () => openAdd());
  // … or a new-episode notification (open that show).
  onNativeEvent('openEntry', (data) => data?.id && openEntry(String(data.id), { onChanged }));
  // "Find #4" / "Check for new installments" in a series section.
  document.addEventListener('bookshelf:find', (ev) => {
    const { type, query } = /** @type {CustomEvent<{ type: 'book' | 'movie' | 'tv', query: string }>} */ (ev).detail;
    openAddFlow({
      onChanged,
      goToSettings: () => openSettings({ onChanged }),
      startWith: 'search',
      searchType: type,
      prefill: { quoteText: '', author: '', source: '', query, link: null }
    });
  });
  // "Add a quote" on a book / film / show page.
  document.addEventListener('bookshelf:add-quote', (ev) => {
    const { linkedEntryId } = /** @type {CustomEvent<{ linkedEntryId: string }>} */ (ev).detail;
    openAddFlow({ onChanged, goToSettings: () => openSettings({ onChanged }), startWith: 'quote', linkedEntryId });
  });
  // … or the installed PWA's Web Share Target (manifest share_target).
  const params = new URLSearchParams(location.search);
  if (['share-text', 'share-title', 'share-url'].some((k) => params.has(k))) {
    history.replaceState(null, '', location.pathname);
    openAdd({
      text: params.get('share-text') || '',
      subject: params.get('share-title') || '',
      url: params.get('share-url') || ''
    });
  }
  // Encrypted folder sync (Android app, once configured): pull now, push after
  // changes. Incoming changes only refresh the UI — they don't re-trigger sync.
  scheduleSync = startAutoSync(() => { refreshStats(); render(); });
  // Refresh episode guides of shows being followed (quietly; needs TheTVDB).
  void refreshFollowedGuides(() => { refreshStats(); render(); });
  // Re-skin the widget when the user switches Dusk/Dawn.
  document.addEventListener('themechange', () => void refreshStats());

  // Booted: the shell may now deliver events it queued during startup.
  notifyNativeReady();
}

boot().catch((err) => {
  console.error(err);
  const msg = el('div', { class: 'msg-error', style: 'margin:3rem 1.5rem' }, `Failed to start: ${err?.message ?? err}`);
  document.getElementById('app')?.replaceChildren(msg);
});

// Register the service worker for offline support (web/PWA only). The native
// Android shell already bundles the app, so skip it there.
if ('serviceWorker' in navigator && !isNativeShell()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW registration failed', err));
  });
}
