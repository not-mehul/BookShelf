import { el, clear, segmented, loadingNode, errorNode, notice } from './components.js';
import { icons } from '../util/icons.js';
import { searchBooks } from '../api/books.js';
import { searchTvdb } from '../api/tvdb.js';
import { openSearchHit } from './detail-modal.js';
import { findBySource } from '../db/database.js';
import { getSetting } from '../util/settings.js';

const state = {
  type: 'book',
  query: '',
  results: [],
  status: 'idle'
};

const TYPE_LABEL = { book: 'Book', movie: 'Movie', tv: 'TV' };

export function renderSearch(container, { onChanged, goToSettings }) {
  clear(container);

  const toolbar = el('div', { class: 'library-toolbar' });
  toolbar.appendChild(
    segmented(
      [
        { value: 'book', label: 'Books' },
        { value: 'movie', label: 'Movies' },
        { value: 'tv', label: 'TV' }
      ],
      state.type,
      (v) => {
        state.type = v;
        if (state.query.trim()) runSearch();
      }
    )
  );
  container.appendChild(toolbar);

  const form = el('form', {
    class: 'search-bar',
    onSubmit: (ev) => {
      ev.preventDefault();
      state.query = input.value;
      runSearch();
    }
  });
  const input = el('input', {
    type: 'search',
    class: 'input',
    placeholder: 'Search by title, author, or keywords…',
    value: state.query,
    'aria-label': 'Search query',
    autocomplete: 'off',
    enterkeyhint: 'search'
  });
  const submit = el('button', { type: 'submit', class: 'btn btn-primary' });
  submit.innerHTML = `${icons.search()} <span>Search</span>`;
  form.appendChild(input);
  form.appendChild(submit);
  container.appendChild(form);

  const resultsZone = el('div', {});
  container.appendChild(resultsZone);

  async function runSearch() {
    const q = state.query.trim();
    clear(resultsZone);
    if (!q) {
      state.status = 'idle';
      state.results = [];
      return;
    }

    if (state.type !== 'book') {
      const apikey = await getSetting('tvdb_api_key', '');
      if (!apikey) {
        resultsZone.appendChild(
          notice(
            'TheTVDB API key not set. <a href="#" data-go-settings style="color:var(--accent-bright);text-decoration:underline">Open settings</a> to add it.'
          )
        );
        const link = resultsZone.querySelector('[data-go-settings]');
        link?.addEventListener('click', (ev) => {
          ev.preventDefault();
          goToSettings?.();
        });
        return;
      }
    }

    state.status = 'loading';
    resultsZone.appendChild(loadingNode('Searching'));

    try {
      const hits =
        state.type === 'book'
          ? await searchBooks(q)
          : await searchTvdb(q, state.type);
      state.results = hits;
      state.status = 'ready';
      clear(resultsZone);
      if (!hits.length) {
        resultsZone.appendChild(
          el('div', { class: 'empty-state' },
            el('h3', {}, 'No results.'),
            el('p', {}, 'Try different wording or a more specific title.')
          )
        );
        return;
      }
      resultsZone.appendChild(
        el('div', { class: 'results-meta' }, `${hits.length} ${TYPE_LABEL[state.type]} results`)
      );
      const grid = el('div', { class: 'search-results' });
      for (const hit of hits) grid.appendChild(await searchCard(hit, onChanged));
      resultsZone.appendChild(grid);
    } catch (err) {
      console.error(err);
      state.status = 'error';
      clear(resultsZone);
      resultsZone.appendChild(errorNode(err.message || 'Search failed.'));
    }
  }

  // Restore prior results if the user navigated away and back.
  if (state.query.trim() && state.results.length) {
    input.value = state.query;
    runSearch();
  }
}

async function searchCard(hit, onChanged) {
  const existing = await findBySource(hit.type, hit.sourceId);
  const node = el('button', {
    type: 'button',
    class: 'entry-card',
    onClick: () => openSearchHit(hit, { onChanged })
  });
  if (existing) {
    node.appendChild(el('span', { class: 'added-badge' }, 'In library'));
  }
  const thumb = el('div', { class: 'entry-thumb' });
  if (hit.thumbnailUrl) {
    const img = el('img', { src: hit.thumbnailUrl, alt: '', loading: 'lazy' });
    img.addEventListener('error', () => {
      img.remove();
      thumb.appendChild(el('div', { class: 'placeholder', html: '<em>no cover</em>' }));
    });
    thumb.appendChild(img);
  } else {
    thumb.appendChild(el('div', { class: 'placeholder', html: '<em>no cover</em>' }));
  }
  node.appendChild(thumb);
  const meta = el('div', { class: 'entry-meta' });
  meta.appendChild(el('div', { class: 'entry-type' }, TYPE_LABEL[hit.type]));
  meta.appendChild(el('div', { class: 'entry-title' }, hit.title));
  const subParts = [];
  if (hit.creators?.length) subParts.push(hit.creators.slice(0, 2).join(', '));
  if (hit.year) subParts.push(hit.year);
  meta.appendChild(el('div', { class: 'entry-sub' }, subParts.join(' · ') || ' '));
  node.appendChild(meta);
  return node;
}
