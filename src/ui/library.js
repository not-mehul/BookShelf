import { el, clear, segmented, selectWrap, coverImage } from './components.js';
import { listEntries, listAllTags, thumbnailUrl, getEntry } from '../db/database.js';
import { openBulkEdit, deleteEntries } from './bulk.js';
import { pushBackHandler } from '../platform/native.js';
import { episodeProgress, episodeCode, localDate } from '../util/episodes.js';
import { markEpisodes } from './episodes-section.js';
import { openEntry } from './detail-modal.js';
import { openStats } from './stats.js';
import { openQueue } from './queue.js';
import { saveAndShareMarkdown } from '../export/markdown.js';
import { icons } from '../util/icons.js';
import { starString } from '../util/stars.js';
import { seriesSortKey, compareSeriesOrder } from '../util/series.js';
import { statusLabel } from '../util/status.js';

const TYPE_OPTS = [
  { value: 'all',   label: 'All'    },
  { value: 'book',  label: 'Books'  },
  { value: 'movie', label: 'Movies' },
  { value: 'tv',    label: 'TV'     },
  { value: 'quote', label: 'Quotes' }
];

const SORT_OPTS = [
  { v: 'dateAdded', l: 'Recently added' },
  { v: 'rating',    l: 'Highest rated'  },
  { v: 'title',     l: 'Title (A–Z)'    },
  { v: 'year',      l: 'Year (newest)'  },
  { v: 'series',    l: 'Series order'   }
];

const TYPE_ICON = { book: 'book', movie: 'film', tv: 'tv', quote: 'quote' };

/** @type {{ type: string, sort: string, query: string, tag: string | null }} */
const state = { type: 'all', sort: 'dateAdded', query: '', tag: null };

// Multi-select ("selection mode"), kept across re-renders.
const selection = { active: false, ids: /** @type {Set<string>} */ (new Set()) };
/** @type {(() => void) | null} */
let releaseSelectBack = null;
/** @type {(() => void) | null} */
let exitCurrentSelection = null;
const LONG_PRESS_MS = 450;

// Escape leaves selection mode (when no dialog is open).
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && selection.active && !document.querySelector('dialog[open]')) exitCurrentSelection?.();
});

export function renderLibrary(container, { onChanged }) {
  clear(container);

  // ── Toolbar ────────────────────────────────────────────────────

  const libHeader = el('div', { class: 'lib-header' });

  // Row 1 — type filter, centered
  const typesRow  = el('div', { class: 'lib-types-row' });
  const countEl   = el('div', { class: 'lib-count' }, '');
  typesRow.appendChild(segmented(TYPE_OPTS, state.type, (v) => { state.type = v; refresh(); }));
  typesRow.appendChild(countEl);

  const filterInput = el('input', {
    type: 'search',
    class: 'input filter-input',
    placeholder: 'Filter…',
    value: state.query,
    'aria-label': 'Filter library'
  });
  filterInput.addEventListener('input', () => { state.query = filterInput.value; refresh(); });

  const sortSel = el('select', { class: 'select select-sm', 'aria-label': 'Sort by' });
  for (const opt of SORT_OPTS) {
    const o = el('option', { value: opt.v }, opt.l);
    if (state.sort === opt.v) o.setAttribute('selected', '');
    sortSel.appendChild(o);
  }
  sortSel.addEventListener('change', () => { state.sort = sortSel.value; refresh(); });

  const statsBtn = el('button', {
    type: 'button',
    class: 'btn btn-muted',
    title: 'View statistics',
    'aria-label': 'View statistics',
    onClick: () => openStats()
  });
  statsBtn.innerHTML = `${icons.chart()} <span class="btn-label">Stats</span>`;

  const queueBtn = el('button', {
    type: 'button',
    class: 'btn btn-muted',
    title: 'Your queue',
    'aria-label': 'Your queue',
    onClick: () => openQueue({ onChanged })
  });
  queueBtn.innerHTML = `${icons.queue()} <span class="btn-label">Queue</span>`;

  const selectBtn = el('button', {
    type: 'button',
    class: 'btn btn-muted',
    title: 'Select entries',
    'aria-label': 'Select entries',
    'aria-pressed': selection.active ? 'true' : 'false',
    onClick: () => (selection.active ? exitSelection() : enterSelection())
  });
  selectBtn.innerHTML = `${icons.select()} <span class="btn-label">Select</span>`;

  const exportBtn = el('button', {
    type: 'button',
    class: 'btn btn-muted',
    title: 'Export catalog as Markdown',
    onClick: async () => {
      exportBtn.setAttribute('disabled', '');
      try { await saveAndShareMarkdown(); }
      finally { exportBtn.removeAttribute('disabled'); }
    }
  });
  exportBtn.innerHTML = `${icons.download()} <span class="btn-label">Export</span>`;

  // Row 2 — tools
  const toolsRow = el('div', { class: 'lib-tools-row' },
    filterInput,
    selectWrap(sortSel, true),
    statsBtn,
    queueBtn,
    selectBtn,
    exportBtn
  );

  // Row 3 — tag filter chips (populated async)
  const tagRow = el('div', { class: 'lib-tags-row' });

  libHeader.appendChild(typesRow);
  libHeader.appendChild(toolsRow);
  libHeader.appendChild(tagRow);
  container.appendChild(libHeader);

  async function refreshTags() {
    const tags = await listAllTags();
    clear(tagRow);
    if (!tags.length) { tagRow.style.display = 'none'; return; }
    tagRow.style.display = '';
    const makeChip = (label, value) => el('button', {
      type: 'button',
      class: `lib-tag-chip${state.tag === value ? ' active' : ''}`,
      onClick: () => { state.tag = value; refresh(); refreshTags(); }
    }, label);
    tagRow.appendChild(makeChip('All tags', null));
    for (const t of tags) tagRow.appendChild(makeChip(t, t));
  }
  refreshTags();

  // ── Grid ───────────────────────────────────────────────────────

  // "Up next": the next episode of each show in progress.
  const upNext = el('section', { class: 'up-next', 'aria-label': 'Up next' });
  container.appendChild(upNext);

  const grid = el('div', { class: 'entry-grid' });
  container.appendChild(grid);

  async function renderUpNext() {
    clear(upNext);
    const show = !state.query && !selection.active && (state.type === 'all' || state.type === 'tv');
    if (!show) return;
    const today = localDate();
    const items = (await listEntries())
      .filter((e) => e.type === 'tv' && e.status === 'in-progress' && e.episodeGuide?.episodes.length)
      .map((e) => ({ e, p: episodeProgress(e, today) }))
      .filter(({ p }) => p.next || p.upcoming)
      // Shows with an episode ready to watch first, most recently touched first.
      .sort((a, b) => Number(Boolean(b.p.next)) - Number(Boolean(a.p.next)) || (b.e.updatedAt || '').localeCompare(a.e.updatedAt || ''));
    if (!items.length) return;
    upNext.appendChild(el('h2', { class: 'up-next-label' }, 'Up next'));
    const row = el('div', { class: 'up-next-row' });
    for (const { e, p } of items) {
      const ep = /** @type {import('../types').Episode} */ (p.next || p.upcoming);
      const card = el('div', { class: 'up-next-card' });
      const open = el('button', { type: 'button', class: 'up-next-open' },
        el('span', { class: 'up-next-show' }, e.title),
        el('span', { class: 'up-next-ep' }, `${episodeCode(ep)} · ${ep.name || 'Untitled'}`),
        el('span', { class: 'up-next-when' }, p.next ? `${p.aired - p.watched} to watch` : `airs ${ep.aired}`)
      );
      open.addEventListener('click', () => openEntry(e.id, { onChanged }));
      card.appendChild(open);
      if (p.next) {
        const done = el('button', { type: 'button', class: 'btn-icon up-next-check', 'aria-label': `Mark ${episodeCode(ep)} of ${e.title} watched` });
        done.innerHTML = icons.check();
        done.addEventListener('click', async () => {
          await markEpisodes(e, [ep.id], true);
          onChanged();
        });
        card.appendChild(done);
      }
      row.appendChild(card);
    }
    upNext.appendChild(row);
  }

  // ── Selection mode ─────────────────────────────────────────────
  /** @type {string[]} */
  let visibleIds = [];
  const bar = el('div', { class: 'select-bar', role: 'toolbar', 'aria-label': 'Selected entries' });
  container.appendChild(bar);

  /** @param {string} [firstId] */
  function enterSelection(firstId) {
    if (!selection.active) {
      selection.active = true;
      releaseSelectBack = pushBackHandler(() => exitSelection());
    }
    if (firstId) selection.ids.add(firstId);
    syncSelectionUi();
    void refresh();
  }

  function exitSelection() {
    selection.active = false;
    selection.ids.clear();
    releaseSelectBack?.();
    releaseSelectBack = null;
    syncSelectionUi();
    void refresh();
  }
  exitCurrentSelection = exitSelection;

  /** @param {string} id @param {HTMLElement} card */
  function toggle(id, card) {
    if (selection.ids.has(id)) selection.ids.delete(id);
    else selection.ids.add(id);
    const on = selection.ids.has(id);
    card.classList.toggle('is-selected', on);
    card.setAttribute('aria-checked', on ? 'true' : 'false');
    renderBar();
  }

  function syncSelectionUi() {
    document.body.classList.toggle('is-selecting', selection.active);
    selectBtn.setAttribute('aria-pressed', selection.active ? 'true' : 'false');
    renderBar();
  }

  function renderBar() {
    clear(bar);
    bar.hidden = !selection.active;
    if (!selection.active) return;
    const n = selection.ids.size;
    const count = el('span', { class: 'select-count', 'aria-live': 'polite' }, `${n} selected`);
    const all = el('button', { type: 'button', class: 'btn btn-muted btn-sm' }, 'Select all');
    all.addEventListener('click', () => {
      for (const id of visibleIds) selection.ids.add(id);
      void refresh();
      renderBar();
    });
    const edit = el('button', { type: 'button', class: 'btn btn-primary btn-sm', disabled: n === 0 }, 'Edit…');
    edit.addEventListener('click', () =>
      openBulkEdit([...selection.ids], { onApplied: () => onChanged() })
    );
    const del = el('button', { type: 'button', class: 'btn btn-danger btn-sm', disabled: n === 0 }, 'Delete');
    let armed = false;
    del.addEventListener('click', async () => {
      if (!armed) {
        armed = true;
        del.textContent = `Tap again to delete ${n}`;
        setTimeout(() => { armed = false; del.textContent = 'Delete'; }, 3000);
        return;
      }
      await deleteEntries([...selection.ids]);
      exitSelection();
      onChanged();
    });
    const done = el('button', { type: 'button', class: 'btn btn-muted btn-sm' }, 'Done');
    done.addEventListener('click', () => exitSelection());
    bar.append(count, all, edit, del, done);
  }
  syncSelectionUi();

  async function refresh() {
    let entries = await listEntries();
    if (state.type !== 'all') entries = entries.filter((e) => e.type === state.type);
    const tag = state.tag;
    if (tag) entries = entries.filter((e) => (e.tags || []).includes(tag));
    const q = state.query.trim().toLowerCase();
    if (q) {
      entries = entries.filter((e) => {
        const hay = [
          e.title, e.quoteText, e.summary, e.notes, e.source || '', e.series?.name || '',
          ...(e.creators || []), ...(e.genres || []), ...(e.tags || [])
        ].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      });
    }
    entries.sort(sorter(state.sort));

    grid.className = `entry-grid${state.type === 'quote' ? ' quote-grid' : ''}`;
    renderUpNext();

    countEl.textContent = entries.length
      ? `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`
      : '';

    clear(grid);
    if (!entries.length) {
      visibleIds = []; // nothing visible: "Select all" must not pick up a stale list
      grid.appendChild(emptyState(state.type, state.query));
      renderBar();
      return;
    }
    // Drop selected ids that no longer exist (deleted, or synced away).
    const existing = new Set(entries.map((e) => e.id));
    visibleIds = entries.map((e) => e.id);
    for (const id of [...selection.ids]) if (!existing.has(id) && !(await getEntry(id))) selection.ids.delete(id);
    for (const entry of entries) {
      grid.appendChild(entryCard(entry, onChanged, {
        selecting: selection.active,
        selected: selection.ids.has(entry.id),
        onToggle: toggle,
        onLongPress: (id) => enterSelection(id)
      }));
    }
    renderBar();
  }

  refresh();
}

function sorter(key) {
  if (key === 'rating') return (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.title.localeCompare(b.title);
  if (key === 'title')  return (a, b) => a.title.localeCompare(b.title);
  if (key === 'year')   return (a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title);
  // Series grouped together in reading order; everything else after, A–Z.
  if (key === 'series') return (a, b) => seriesSortKey(a).localeCompare(seriesSortKey(b)) || compareSeriesOrder(a, b);
  return (a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || '');
}

/**
 * @typedef {object} CardSelection
 * @property {boolean} selecting  Selection mode is on: the card is a checkbox.
 * @property {boolean} selected
 * @property {(id: string, card: HTMLElement) => void} onToggle
 * @property {(id: string) => void} onLongPress Long-press enters selection mode.
 */

/**
 * @param {import('../types').CatalogEntry} entry
 * @param {() => void} onChanged
 * @param {CardSelection} [sel]
 */
export function entryCard(entry, onChanged, sel) {
  const node = el('button', { type: 'button', class: 'entry-card' });
  if (sel?.selecting) {
    node.setAttribute('role', 'checkbox');
    node.setAttribute('aria-checked', sel.selected ? 'true' : 'false');
    node.classList.add('is-selectable');
    node.classList.toggle('is-selected', sel.selected);
  }

  // Long-press (touch or mouse) enters selection mode with this card selected.
  let pressTimer = 0;
  let longPressed = false;
  /** @type {{ x: number, y: number } | null} */
  let pressAt = null;
  const cancelPress = () => { clearTimeout(pressTimer); pressAt = null; };
  if (sel && !sel.selecting) {
    node.addEventListener('pointerdown', (ev) => {
      longPressed = false;
      pressAt = { x: ev.clientX, y: ev.clientY };
      pressTimer = window.setTimeout(() => {
        longPressed = true;
        sel.onLongPress(entry.id);
      }, LONG_PRESS_MS);
    });
    node.addEventListener('pointermove', (ev) => {
      if (pressAt && Math.hypot(ev.clientX - pressAt.x, ev.clientY - pressAt.y) > 10) cancelPress();
    });
    node.addEventListener('pointerup', cancelPress);
    node.addEventListener('pointercancel', cancelPress);
    node.addEventListener('contextmenu', (ev) => ev.preventDefault()); // no menu on long-press
  }
  node.addEventListener('click', () => {
    if (longPressed) { longPressed = false; return; } // the long-press already acted
    if (sel?.selecting) sel.onToggle(entry.id, node);
    else openEntry(entry.id, { onChanged });
  });

  // Quote entries render as text cards (no thumbnail)
  if (entry.type === 'quote') {
    node.classList.add('quote-card');
    const body = el('div', { class: 'quote-card-body' });
    body.appendChild(el('div', { class: 'quote-card-mark', 'aria-hidden': 'true' }, '“'));
    body.appendChild(el('div', { class: 'quote-card-text' }, entry.quoteText || entry.title));
    const attrParts = [entry.creators?.[0], entry.source].filter(Boolean);
    if (attrParts.length) {
      body.appendChild(el('div', { class: 'quote-card-author' }, '— ' + attrParts.join(', ')));
    }
    if (entry.rating != null) {
      body.appendChild(el('div', { class: 'entry-rating-line' },
        starString(entry.rating)
      ));
    }
    node.appendChild(body);
    return node;
  }

  // Thumbnail
  const thumb = el('div', { class: 'entry-thumb' });
  const src = thumbnailUrl(entry) || entry.thumbnailUrl;
  if (src) {
    thumb.appendChild(
      coverImage(src, { onError: (img) => { img.remove(); thumb.appendChild(thumbPlaceholder(entry)); } })
    );
  } else {
    thumb.appendChild(thumbPlaceholder(entry));
  }
  node.appendChild(thumb);

  // Meta
  const meta = el('div', { class: 'entry-meta' });
  meta.appendChild(el('div', { class: 'entry-type-label' }, typeLabel(entry.type)));
  meta.appendChild(el('div', { class: 'entry-title' }, entry.title));

  const creators = (entry.creators || []).slice(0, 2);
  if (creators.length) meta.appendChild(el('div', { class: 'entry-creator' }, creators.join(', ')));
  if (entry.series?.name) {
    const pos = entry.series.position != null ? ` #${entry.series.position}` : '';
    meta.appendChild(el('div', { class: 'entry-series' }, `${entry.series.name}${pos}`));
  }

  if (entry.rating != null) {
    meta.appendChild(el('div', { class: 'entry-rating-line' },
      starString(entry.rating)
    ));
  } else {
    meta.appendChild(el('div', { class: 'entry-rating-line unrated' }, 'unrated'));
  }

  if (entry.status) {
    meta.appendChild(el('span', { class: 'entry-status-chip' }, statusLabel(entry.status) || entry.status));
  }

  node.appendChild(meta);
  return node;
}

function thumbPlaceholder(entry) {
  const ph = el('div', { class: 'entry-thumb-placeholder' });
  const iconKey = TYPE_ICON[entry.type] || 'book';
  ph.innerHTML = `<span style="color:var(--text-faint);opacity:.45">${icons[iconKey]?.() || ''}</span>`;
  ph.appendChild(el('span', {}, entry.title));
  return ph;
}

function typeLabel(type) {
  return { book: 'Book', movie: 'Movie', tv: 'TV Show', quote: 'Quote' }[type] || type;
}

function emptyState(type, query) {
  const wrap = el('div', { class: 'empty-state' });
  if (query) {
    wrap.innerHTML = icons.search();
    wrap.appendChild(el('h3', {}, 'No matches'));
    wrap.appendChild(el('p', {}, 'Try different words or clear the filter.'));
  } else if (type === 'all') {
    wrap.innerHTML = icons.bookmark();
    wrap.appendChild(el('h3', {}, 'The shelf is empty'));
    wrap.appendChild(el('p', {}, 'Tap the + button to add a book, film, show, or quote.'));
  } else if (type === 'quote') {
    wrap.innerHTML = icons.quote();
    wrap.appendChild(el('h3', {}, 'No quotes yet'));
    wrap.appendChild(el('p', {}, 'Tap the + button to add a quote.'));
  } else {
    const labels = { book: 'books', movie: 'movies', tv: 'shows' };
    wrap.innerHTML = icons[TYPE_ICON[type]]?.() || icons.bookmark();
    wrap.appendChild(el('h3', {}, `No ${labels[type] || 'entries'} yet`));
    wrap.appendChild(el('p', {}, 'Tap the + button to add one.'));
  }
  return wrap;
}
