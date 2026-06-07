import { el, clear, segmented, selectWrap } from './components.js';
import { listEntries, thumbnailUrl } from '../db/database.js';
import { openEntry } from './detail-modal.js';
import { saveAndShareMarkdown } from '../export/markdown.js';
import { icons } from '../util/icons.js';

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
  { v: 'year',      l: 'Year (newest)'  }
];

const TYPE_ICON = { book: 'book', movie: 'film', tv: 'tv', quote: 'quote' };

const state = { type: 'all', sort: 'dateAdded', query: '' };

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
    exportBtn
  );

  libHeader.appendChild(typesRow);
  libHeader.appendChild(toolsRow);
  container.appendChild(libHeader);

  // ── Grid ───────────────────────────────────────────────────────

  const grid = el('div', { class: 'entry-grid' });
  container.appendChild(grid);

  async function refresh() {
    let entries = await listEntries();
    if (state.type !== 'all') entries = entries.filter((e) => e.type === state.type);
    const q = state.query.trim().toLowerCase();
    if (q) {
      entries = entries.filter((e) => {
        const hay = [e.title, e.quoteText, ...(e.creators || []), ...(e.genres || []), e.source || '']
          .filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      });
    }
    entries.sort(sorter(state.sort));

    grid.className = `entry-grid${state.type === 'quote' ? ' quote-grid' : ''}`;

    countEl.textContent = entries.length
      ? `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`
      : '';

    clear(grid);
    if (!entries.length) {
      grid.appendChild(emptyState(state.type, state.query));
      return;
    }
    for (const entry of entries) grid.appendChild(entryCard(entry, onChanged));
  }

  refresh();
}

function sorter(key) {
  if (key === 'rating') return (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.title.localeCompare(b.title);
  if (key === 'title')  return (a, b) => a.title.localeCompare(b.title);
  if (key === 'year')   return (a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title);
  return (a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || '');
}

export function entryCard(entry, onChanged) {
  const node = el('button', {
    type: 'button',
    class: 'entry-card',
    onClick: () => openEntry(entry.id, { onChanged })
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
        '★'.repeat(entry.rating) + '☆'.repeat(5 - entry.rating)
      ));
    }
    node.appendChild(body);
    return node;
  }

  // Thumbnail
  const thumb = el('div', { class: 'entry-thumb' });
  const blobUrl = thumbnailUrl(entry);
  const src = blobUrl || entry.thumbnailUrl;
  if (src) {
    const img = el('img', { src, alt: '', loading: 'lazy' });
    img.addEventListener('error', () => {
      img.remove();
      thumb.appendChild(thumbPlaceholder(entry));
    });
    thumb.appendChild(img);
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

  if (entry.rating != null) {
    meta.appendChild(el('div', { class: 'entry-rating-line' },
      '★'.repeat(entry.rating) + '☆'.repeat(5 - entry.rating)
    ));
  } else {
    meta.appendChild(el('div', { class: 'entry-rating-line unrated' }, 'unrated'));
  }

  if (entry.status) {
    const STATUS_LABEL = { want: 'Want', 'in-progress': 'Reading', finished: 'Finished' };
    meta.appendChild(el('span', { class: 'entry-status-chip' }, STATUS_LABEL[entry.status] || entry.status));
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
    wrap.appendChild(el('p', {}, 'Search for a book, film, or show to get started.'));
  } else if (type === 'quote') {
    wrap.innerHTML = icons.quote();
    wrap.appendChild(el('h3', {}, 'No quotes yet'));
    wrap.appendChild(el('p', {}, 'Add quotes from the Search tab.'));
  } else {
    const labels = { book: 'books', movie: 'movies', tv: 'shows' };
    wrap.innerHTML = icons[TYPE_ICON[type]]?.() || icons.bookmark();
    wrap.appendChild(el('h3', {}, `No ${labels[type] || 'entries'} yet`));
    wrap.appendChild(el('p', {}, 'Add one from the Search tab.'));
  }
  return wrap;
}
