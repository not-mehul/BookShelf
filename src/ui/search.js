import { el, clear, segmented, loadingNode, errorNode, noticeNode } from './components.js';
import { icons } from '../util/icons.js';
import { searchBooks } from '../api/books.js';
import { searchTvdb } from '../api/tvdb.js';
import { openSearchHit } from './detail-modal.js';
import { findBySource, saveEntry, newEntryId } from '../db/database.js';
import { getSetting } from '../util/settings.js';
import { entryCard } from './library.js';

const state = {
  type: 'book',
  query: '',
  results: [],
  status: 'idle'
};

const TYPE_LABEL = { book: 'Book', movie: 'Movie', tv: 'TV Show' };
const TYPE_PLURAL = { book: 'books', movie: 'movies', tv: 'TV shows' };

export function renderSearch(container, { onChanged, onSaved, goToSettings }) {
  clear(container);

  // ── Source selector ────────────────────────────────────────────

  container.appendChild(
    el('div', { class: 'search-type-bar' },
      segmented(
        [
          { value: 'book',  label: 'Books'  },
          { value: 'movie', label: 'Movies' },
          { value: 'tv',    label: 'TV'     },
          { value: 'quote', label: 'Quotes' }
        ],
        state.type,
        (v) => {
          state.type = v;
          state.query = '';
          state.results = [];
          renderSearch(container, { onChanged, onSaved, goToSettings });
        }
      )
    )
  );

  // ── Quotes — manual add form ───────────────────────────────────

  if (state.type === 'quote') {
    // Use onSaved (stats-only) so the success notice isn't wiped by a full re-render
    renderQuoteAddSection(container, onSaved ?? onChanged);
    return;
  }

  // ── Search form ────────────────────────────────────────────────

  const input = el('input', {
    type: 'search',
    class: 'input',
    placeholder: 'Search by title, author, or keywords…',
    value: state.query,
    'aria-label': 'Search',
    autocomplete: 'off',
    enterkeyhint: 'search'
  });
  const submitBtn = el('button', { type: 'submit', class: 'btn btn-primary' });
  submitBtn.innerHTML = `${icons.search()} Search`;

  const form = el('form', {
    class: 'search-form',
    onSubmit: (ev) => { ev.preventDefault(); state.query = input.value; runSearch(); }
  }, input, submitBtn);
  container.appendChild(form);

  // ── Results zone ───────────────────────────────────────────────

  const zone = el('div', {});
  container.appendChild(zone);

  async function runSearch() {
    const q = state.query.trim();
    clear(zone);
    if (!q) { state.status = 'idle'; state.results = []; return; }

    if (state.type !== 'book') {
      const apikey = await getSetting('tvdb_api_key', '');
      if (!apikey) {
        const msg = noticeNode(
          'TheTVDB API key not set — required for movies and TV. ' +
          '<a href="#" data-go-settings>Open Settings</a> to add it.'
        );
        msg.querySelector('[data-go-settings]')?.addEventListener('click', (ev) => {
          ev.preventDefault(); goToSettings?.();
        });
        zone.appendChild(msg);
        return;
      }
    }

    state.status = 'loading';
    zone.appendChild(loadingNode('Searching'));

    try {
      const hits = state.type === 'book'
        ? await searchBooks(q)
        : await searchTvdb(q, state.type);
      state.results = hits;
      state.status = 'ready';
      clear(zone);

      if (!hits.length) {
        const empty = el('div', { class: 'empty-state' });
        empty.innerHTML = icons.search();
        empty.appendChild(el('h3', {}, 'No results'));
        empty.appendChild(el('p', {}, 'Try a different title or check the spelling.'));
        zone.appendChild(empty);
        return;
      }

      zone.appendChild(
        el('div', { class: 'results-eyebrow' },
          `${hits.length} ${TYPE_PLURAL[state.type]} found`
        )
      );

      const grid = el('div', { class: 'entry-grid' });
      for (const hit of hits) grid.appendChild(await searchResultCard(hit, onChanged));
      zone.appendChild(grid);

    } catch (err) {
      console.error(err);
      state.status = 'error';
      clear(zone);
      zone.appendChild(errorNode(err.message || 'Search failed. Check your connection and API key.'));
    }
  }

  // Restore results when navigating back
  if (state.query.trim() && state.results.length) {
    input.value = state.query;
    runSearch();
  }
}

function renderQuoteAddSection(container, onChanged) {
  container.appendChild(
    el('div', { class: 'results-eyebrow' }, 'Add a quote to your catalog')
  );

  const form = el('form', { class: 'quote-add-form' });

  const textField = el('div', { class: 'field' });
  textField.appendChild(el('label', { class: 'label-field', for: 'q-text' }, 'Quote text'));
  const textArea = el('textarea', {
    id: 'q-text', class: 'textarea', placeholder: 'The quote…', rows: '5'
  });
  textField.appendChild(textArea);
  form.appendChild(textField);

  const authorField = el('div', { class: 'field' });
  authorField.appendChild(el('label', { class: 'label-field', for: 'q-author' }, 'Author'));
  const authorInput = el('input', {
    id: 'q-author', type: 'text', class: 'input', placeholder: 'e.g. George Orwell'
  });
  authorField.appendChild(authorInput);
  form.appendChild(authorField);

  const sourceField = el('div', { class: 'field' });
  sourceField.appendChild(el('label', { class: 'label-field', for: 'q-source' }, 'Source / Work'));
  const sourceInput = el('input', {
    id: 'q-source', type: 'text', class: 'input',
    placeholder: 'e.g. 1984, Hamlet, or the person\'s name'
  });
  sourceField.appendChild(sourceInput);
  form.appendChild(sourceField);

  const addBtn = el('button', { type: 'submit', class: 'btn btn-primary' });
  addBtn.innerHTML = `${icons.plus()} Add to catalog`;
  form.appendChild(addBtn);

  const msgEl = el('div', { style: 'margin-top:1rem' });
  form.appendChild(msgEl);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const text = textArea.value.trim();
    if (!text) { textArea.focus(); return; }

    addBtn.disabled = true;
    clear(msgEl);
    try {
      const entry = {
        id: newEntryId(),
        type: 'quote',
        sourceId: null,
        title: text.slice(0, 100),
        quoteText: text,
        creators: authorInput.value.trim() ? [authorInput.value.trim()] : [],
        source: sourceInput.value.trim() || '',
        year: null,
        summary: '',
        genres: [],
        thumbnailUrl: null,
        thumbnailBlob: null,
        rating: null,
        status: null,
        notes: '',
        dateAdded: new Date().toISOString(),
        dateRated: null
      };
      await saveEntry(entry);
      onChanged?.();
      msgEl.appendChild(noticeNode('Quote added to your catalog.'));
      textArea.value = '';
      authorInput.value = '';
      sourceInput.value = '';
      textArea.focus();
    } finally {
      addBtn.disabled = false;
    }
  });

  container.appendChild(form);
}

async function searchResultCard(hit, onChanged) {
  const existing = await findBySource(hit.type, hit.sourceId);

  const node = el('button', {
    type: 'button',
    class: 'entry-card',
    onClick: () => openSearchHit(hit, { onChanged })
  });

  if (existing) {
    node.appendChild(el('span', { class: 'in-library-badge' }, 'In library'));
  }

  const thumb = el('div', { class: 'entry-thumb' });
  if (hit.thumbnailUrl) {
    const img = el('img', { src: hit.thumbnailUrl, alt: '', loading: 'lazy' });
    img.addEventListener('error', () => {
      img.remove();
      thumb.appendChild(noThumb(hit));
    });
    thumb.appendChild(img);
  } else {
    thumb.appendChild(noThumb(hit));
  }
  node.appendChild(thumb);

  const meta = el('div', { class: 'entry-meta' });
  meta.appendChild(el('div', { class: 'entry-type-label' }, TYPE_LABEL[hit.type]));
  meta.appendChild(el('div', { class: 'entry-title' }, hit.title));
  const creators = (hit.creators || []).slice(0, 2);
  if (creators.length) meta.appendChild(el('div', { class: 'entry-creator' }, creators.join(', ')));
  if (hit.year) meta.appendChild(el('div', { class: 'entry-rating-line unrated' }, String(hit.year)));
  node.appendChild(meta);

  return node;
}

function noThumb(hit) {
  const ph = el('div', { class: 'entry-thumb-placeholder' });
  const ICON = { book: icons.book, movie: icons.film, tv: icons.tv };
  const iconFn = ICON[hit.type] || icons.book;
  ph.innerHTML = `<span style="color:var(--text-faint);opacity:.45">${iconFn()}</span>`;
  ph.appendChild(el('span', {}, hit.title));
  return ph;
}
