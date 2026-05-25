import { el, clear, segmented } from './components.js';
import { listEntries, thumbnailUrl } from '../db/database.js';
import { openEntry } from './detail-modal.js';
import { saveAndShareMarkdown } from '../export/markdown.js';
import { icons } from '../util/icons.js';

const TYPE_LABEL = { book: 'Book', movie: 'Movie', tv: 'TV' };

const state = {
  type: 'all',
  sort: 'dateAdded',
  query: ''
};

export function renderLibrary(container, { onChanged }) {
  clear(container);

  const toolbar = el('div', { class: 'library-toolbar' });

  const left = el(
    'div',
    { class: 'left' },
    segmented(
      [
        { value: 'all', label: 'All' },
        { value: 'book', label: 'Books' },
        { value: 'movie', label: 'Movies' },
        { value: 'tv', label: 'TV' }
      ],
      state.type,
      (v) => {
        state.type = v;
        refresh();
      }
    )
  );

  const sortSelect = el('select', { class: 'select', 'aria-label': 'Sort' });
  for (const opt of [
    { v: 'dateAdded', l: 'Recently added' },
    { v: 'rating', l: 'Highest rated' },
    { v: 'title', l: 'Title (A–Z)' },
    { v: 'year', l: 'Year (newest)' }
  ]) {
    const o = el('option', { value: opt.v }, opt.l);
    if (state.sort === opt.v) o.setAttribute('selected', '');
    sortSelect.appendChild(o);
  }
  sortSelect.style.maxWidth = '180px';
  sortSelect.addEventListener('change', () => {
    state.sort = sortSelect.value;
    refresh();
  });

  const searchInput = el('input', {
    type: 'search',
    class: 'input',
    placeholder: 'Filter…',
    value: state.query,
    'aria-label': 'Filter library'
  });
  searchInput.style.maxWidth = '180px';
  searchInput.addEventListener('input', () => {
    state.query = searchInput.value;
    refresh();
  });

  const exportBtn = el(
    'button',
    {
      type: 'button',
      class: 'btn btn-muted',
      title: 'Export as Markdown',
      onClick: async () => {
        exportBtn.setAttribute('disabled', '');
        try {
          await saveAndShareMarkdown();
        } finally {
          exportBtn.removeAttribute('disabled');
        }
      }
    }
  );
  exportBtn.innerHTML = `${icons.download()} <span>Export</span>`;
  exportBtn.style.display = 'inline-flex';
  exportBtn.style.gap = '0.4rem';
  exportBtn.style.alignItems = 'center';

  const right = el('div', { class: 'right' }, searchInput, sortSelect, exportBtn);
  toolbar.appendChild(left);
  toolbar.appendChild(right);
  container.appendChild(toolbar);

  const grid = el('div', { class: 'library-grid' });
  container.appendChild(grid);

  async function refresh() {
    let entries = await listEntries();
    if (state.type !== 'all') entries = entries.filter((e) => e.type === state.type);
    const q = state.query.trim().toLowerCase();
    if (q) {
      entries = entries.filter((e) => {
        const hay = `${e.title} ${(e.creators || []).join(' ')} ${(e.genres || []).join(' ')}`.toLowerCase();
        return hay.includes(q);
      });
    }
    entries.sort(sorter(state.sort));

    clear(grid);
    if (!entries.length) {
      grid.appendChild(emptyState(state.type, state.query));
      grid.style.gridTemplateColumns = '1fr';
      return;
    }
    grid.style.gridTemplateColumns = '';
    for (const entry of entries) grid.appendChild(card(entry, onChanged));
  }

  refresh();
}

function sorter(key) {
  if (key === 'rating') {
    return (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.title.localeCompare(b.title);
  }
  if (key === 'title') return (a, b) => a.title.localeCompare(b.title);
  if (key === 'year') return (a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title);
  return (a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || '');
}

function card(entry, onChanged) {
  const node = el('button', {
    type: 'button',
    class: 'entry-card',
    onClick: () => openEntry(entry.id, { onChanged })
  });
  const thumb = el('div', { class: 'entry-thumb' });
  const blobUrl = thumbnailUrl(entry);
  const src = blobUrl || entry.thumbnailUrl;
  if (src) {
    const img = el('img', { src, alt: '', loading: 'lazy' });
    img.addEventListener('error', () => {
      img.remove();
      thumb.appendChild(el('div', { class: 'placeholder', html: `<em>${escapeHtml(entry.title)}</em>` }));
    });
    thumb.appendChild(img);
  } else {
    thumb.appendChild(el('div', { class: 'placeholder', html: `<em>${escapeHtml(entry.title)}</em>` }));
  }
  node.appendChild(thumb);

  const meta = el('div', { class: 'entry-meta' });
  meta.appendChild(el('div', { class: 'entry-type' }, TYPE_LABEL[entry.type] || entry.type));
  meta.appendChild(el('div', { class: 'entry-title' }, entry.title));
  const subParts = [];
  if (entry.creators?.length) subParts.push(entry.creators.slice(0, 2).join(', '));
  if (entry.year) subParts.push(entry.year);
  meta.appendChild(el('div', { class: 'entry-sub' }, subParts.join(' · ') || ' '));

  if (entry.rating != null) {
    meta.appendChild(
      el('div', { class: 'entry-rating' }, `${'★'.repeat(entry.rating)}${'☆'.repeat(5 - entry.rating)}`)
    );
  } else {
    meta.appendChild(el('div', { class: 'entry-rating empty' }, '— unrated'));
  }
  node.appendChild(meta);

  return node;
}

function emptyState(type, query) {
  const wrap = el('div', { class: 'empty-state' });
  if (query) {
    wrap.appendChild(el('h3', {}, 'No matches.'));
    wrap.appendChild(el('p', {}, 'Try a different filter, or clear the search.'));
  } else if (type === 'all') {
    wrap.appendChild(el('h3', {}, 'The shelf is empty.'));
    wrap.appendChild(el('p', {}, 'Use Search to add your first book, film, or show.'));
  } else {
    const label = { book: 'books', movie: 'movies', tv: 'shows' }[type] || 'entries';
    wrap.appendChild(el('h3', {}, `No ${label} yet.`));
    wrap.appendChild(el('p', {}, `Add one from the Search tab.`));
  }
  return wrap;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
