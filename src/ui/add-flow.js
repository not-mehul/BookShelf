// Add-to-catalog flow, presented as a multi-step modal:
//   1. Choose medium (Books / Movies / TV / Quotes)
//   2a. Quotes — manual entry form
//   2b. Books / Movies / TV — search, then add a result OR enter manually
//
// Uses the shared modal system from detail-modal.js so only one modal is open
// at a time. Adding an entry closes this flow and opens the entry's detail view.

import { el, clear, segmented, loadingNode, errorNode, noticeNode } from './components.js';
import { icons } from '../util/icons.js';
import { openModal, closeModal, openEntry } from './detail-modal.js';
import { searchBooks } from '../api/books.js';
import { searchTvdb } from '../api/tvdb.js';
import { findBySource, saveEntry, newEntryId } from '../db/database.js';
import { getSetting } from '../util/settings.js';
import { fetchThumbBlob } from '../util/thumbs.js';

const MEDIA = [
  { type: 'book',  label: 'Book',  icon: 'book',  blurb: 'Search Google Books' },
  { type: 'movie', label: 'Movie', icon: 'film',  blurb: 'Search TheTVDB' },
  { type: 'tv',    label: 'TV',    icon: 'tv',    blurb: 'Search TheTVDB' },
  { type: 'quote', label: 'Quote', icon: 'quote', blurb: 'Enter manually' }
];

const TYPE_LABEL = { book: 'Book', movie: 'Movie', tv: 'TV Show', quote: 'Quote' };
const TYPE_PLURAL = { book: 'books', movie: 'movies', tv: 'TV shows' };

export function openAddFlow({ onChanged, goToSettings } = {}) {
  openModal((card) => renderMediumPicker(card, { onChanged, goToSettings }));
}

// ── Helpers ────────────────────────────────────────────────────

function closeBtnFor(card) {
  const btn = el('button', {
    type: 'button', class: 'btn-icon modal-close', 'aria-label': 'Close', onClick: closeModal
  });
  btn.innerHTML = icons.x();
  return btn;
}

function backBtn(onBack) {
  const btn = el('button', {
    type: 'button', class: 'btn-icon modal-back', 'aria-label': 'Back', onClick: onBack
  });
  btn.innerHTML = icons.arrowLeft();
  return btn;
}

// ── Step 1 — medium picker ─────────────────────────────────────

function renderMediumPicker(card, ctx) {
  clear(card);
  card.appendChild(closeBtnFor(card));

  const head = el('div', { class: 'add-head' });
  head.appendChild(el('div', { class: 'modal-eyebrow' }, 'Add to catalog'));
  head.appendChild(el('h2', { class: 'add-title' }, 'What would you like to add?'));
  card.appendChild(head);

  const grid = el('div', { class: 'medium-grid' });
  for (const m of MEDIA) {
    const choice = el('button', {
      type: 'button',
      class: 'medium-choice',
      onClick: () => {
        if (m.type === 'quote') renderQuoteForm(card, ctx);
        else renderSearchStep(card, ctx, m.type);
      }
    });
    const ic = el('span', { class: 'medium-choice-icon', 'aria-hidden': 'true' });
    ic.innerHTML = icons[m.icon] ? icons[m.icon]() : '';
    choice.appendChild(ic);
    choice.appendChild(el('span', { class: 'medium-choice-label' }, m.label));
    choice.appendChild(el('span', { class: 'medium-choice-blurb' }, m.blurb));
    grid.appendChild(choice);
  }
  card.appendChild(grid);
}

// ── Step 2b — search ───────────────────────────────────────────

function renderSearchStep(card, ctx, type) {
  clear(card);
  card.appendChild(closeBtnFor(card));
  card.appendChild(backBtn(() => renderMediumPicker(card, ctx)));

  const head = el('div', { class: 'add-head add-head-search' });
  head.appendChild(el('div', { class: 'modal-eyebrow' }, `Add a ${TYPE_LABEL[type].toLowerCase()}`));
  card.appendChild(head);

  const input = el('input', {
    type: 'search',
    class: 'input',
    placeholder: `Search ${TYPE_PLURAL[type]} by title…`,
    'aria-label': `Search ${TYPE_PLURAL[type]}`,
    autocomplete: 'off',
    enterkeyhint: 'search'
  });
  const submitBtn = el('button', { type: 'submit', class: 'btn btn-primary' });
  submitBtn.innerHTML = `${icons.search()} <span class="btn-label">Search</span>`;

  const form = el('form', {
    class: 'search-form add-search-form',
    onSubmit: (ev) => { ev.preventDefault(); runSearch(); }
  }, input, submitBtn);
  card.appendChild(form);

  const zone = el('div', { class: 'add-results-zone' });
  card.appendChild(zone);

  // Persistent manual-entry escape hatch
  const manualRow = el('div', { class: 'add-manual-row' });
  const manualLink = el('button', {
    type: 'button', class: 'add-manual-link',
    onClick: () => renderManualForm(card, ctx, type)
  }, "Can't find it? Enter details manually");
  manualRow.appendChild(manualLink);
  card.appendChild(manualRow);

  input.focus();

  async function runSearch() {
    const q = input.value.trim();
    clear(zone);
    if (!q) { input.focus(); return; }

    // TheTVDB needs a key for movies/TV
    if (type !== 'book') {
      const apikey = await getSetting('tvdb_api_key', '');
      if (!apikey) {
        const msg = noticeNode(
          'TheTVDB API key not set — required for movies and TV. ' +
          '<a href="#" data-go-settings>Open Settings</a> to add it, ' +
          'or enter details manually below.'
        );
        msg.querySelector('[data-go-settings]')?.addEventListener('click', (ev) => {
          ev.preventDefault();
          closeModal();
          ctx.goToSettings?.();
        });
        zone.appendChild(msg);
        return;
      }
    }

    zone.appendChild(loadingNode('Searching'));
    try {
      const hits = type === 'book' ? await searchBooks(q) : await searchTvdb(q, type);
      clear(zone);

      if (!hits.length) {
        const empty = el('div', { class: 'add-empty' });
        empty.innerHTML = icons.search();
        empty.appendChild(el('p', { class: 'add-empty-text' },
          'No results found. You can enter the details manually.'));
        const manualBtn = el('button', {
          type: 'button', class: 'btn btn-primary',
          onClick: () => renderManualForm(card, ctx, type)
        }, 'Enter manually');
        empty.appendChild(manualBtn);
        zone.appendChild(empty);
        return;
      }

      zone.appendChild(el('div', { class: 'add-results-label' },
        `${hits.length} ${TYPE_PLURAL[type]} found — tap to add`));

      const list = el('div', { class: 'add-result-list' });
      for (const hit of hits) list.appendChild(await resultRow(hit, ctx));
      zone.appendChild(list);

    } catch (err) {
      console.error(err);
      clear(zone);
      zone.appendChild(errorNode(err.message || 'Search failed. Check your connection and API key.'));
    }
  }
}

async function resultRow(hit, ctx) {
  const existing = await findBySource(hit.type, hit.sourceId);

  const row = el('button', {
    type: 'button',
    class: 'add-result-row',
    onClick: () => addHit(hit, ctx)
  });

  const thumb = el('div', { class: 'add-result-thumb' });
  if (hit.thumbnailUrl) {
    const img = el('img', { src: hit.thumbnailUrl, alt: '', loading: 'lazy' });
    img.addEventListener('error', () => { img.remove(); thumb.appendChild(rowPlaceholder(hit)); });
    thumb.appendChild(img);
  } else {
    thumb.appendChild(rowPlaceholder(hit));
  }
  row.appendChild(thumb);

  const meta = el('div', { class: 'add-result-meta' });
  meta.appendChild(el('div', { class: 'add-result-title' }, hit.title));
  const sub = [hit.creators?.slice(0, 2).join(', '), hit.year].filter(Boolean).join(' · ');
  if (sub) meta.appendChild(el('div', { class: 'add-result-sub' }, sub));
  row.appendChild(meta);

  const action = el('span', { class: 'add-result-action', 'aria-hidden': 'true' });
  if (existing) {
    action.classList.add('is-in-library');
    action.innerHTML = icons.check();
    row.appendChild(action);
    row.classList.add('is-in-library');
  } else {
    action.innerHTML = icons.plus();
    row.appendChild(action);
  }

  return row;
}

function rowPlaceholder(hit) {
  const ph = el('div', { class: 'add-result-thumb-ph' });
  const ICON = { book: icons.book, movie: icons.film, tv: icons.tv };
  ph.innerHTML = (ICON[hit.type] || icons.book)();
  return ph;
}

async function addHit(hit, ctx) {
  const existing = await findBySource(hit.type, hit.sourceId);
  if (existing) { openEntry(existing.id, { onChanged: ctx.onChanged }); return; }

  const blob = await fetchThumbBlob(hit.thumbnailUrl);
  const entry = {
    id: newEntryId(),
    type: hit.type,
    sourceId: hit.sourceId != null ? String(hit.sourceId) : null,
    title: hit.title,
    creators: hit.creators || [],
    year: hit.year ?? null,
    summary: hit.summary || '',
    genres: hit.genres || [],
    pageCount: hit.pageCount || null,
    thumbnailUrl: hit.thumbnailUrl || null,
    thumbnailBlob: blob,
    rating: null,
    status: null,
    notes: '',
    dateAdded: new Date().toISOString(),
    dateRated: null
  };
  await saveEntry(entry);
  ctx.onChanged?.();
  openEntry(entry.id, { onChanged: ctx.onChanged });
}

// ── Step 2a — quote form ───────────────────────────────────────

function renderQuoteForm(card, ctx) {
  clear(card);
  card.appendChild(closeBtnFor(card));
  card.appendChild(backBtn(() => renderMediumPicker(card, ctx)));

  const head = el('div', { class: 'add-head' });
  head.appendChild(el('div', { class: 'modal-eyebrow' }, 'Add a quote'));
  card.appendChild(head);

  const form = el('form', { class: 'add-form' });

  const text = fieldTextarea('Quote text', 'q-text', 'The quote…', 5);
  const author = fieldInput('Author', 'q-author', 'e.g. George Orwell');
  const source = fieldInput('Source / Work', 'q-source', "e.g. 1984, Hamlet, or a person's name");
  form.appendChild(text.field);
  form.appendChild(author.field);
  form.appendChild(source.field);

  const actions = el('div', { class: 'modal-actions add-form-actions' });
  const saveBtn = el('button', { type: 'submit', class: 'btn btn-primary' });
  saveBtn.innerHTML = `${icons.plus()} Add quote`;
  actions.appendChild(saveBtn);
  form.appendChild(actions);

  card.appendChild(form);
  text.input.focus();

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const quoteText = text.input.value.trim();
    if (!quoteText) { text.input.focus(); return; }
    saveBtn.disabled = true;

    const entry = {
      id: newEntryId(),
      type: 'quote',
      sourceId: null,
      title: quoteText.slice(0, 100),
      quoteText,
      creators: author.input.value.trim() ? [author.input.value.trim()] : [],
      source: source.input.value.trim() || '',
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
    ctx.onChanged?.();
    openEntry(entry.id, { onChanged: ctx.onChanged });
  });
}

// ── Manual metadata form (book / movie / tv) ───────────────────

function renderManualForm(card, ctx, type) {
  clear(card);
  card.appendChild(closeBtnFor(card));
  card.appendChild(backBtn(() => renderSearchStep(card, ctx, type)));

  const head = el('div', { class: 'add-head' });
  head.appendChild(el('div', { class: 'modal-eyebrow' }, `Add a ${TYPE_LABEL[type].toLowerCase()} manually`));
  card.appendChild(head);

  const form = el('form', { class: 'add-form' });

  const creatorLabel = type === 'book' ? 'Author(s)' : 'Director / Creator(s)';
  const title   = fieldInput('Title', 'm-title', 'Required');
  const creators = fieldInput(creatorLabel, 'm-creators', 'Comma-separated');
  const year    = fieldInput('Year', 'm-year', 'e.g. 2021');
  year.input.type = 'number';
  year.input.setAttribute('inputmode', 'numeric');
  const genres  = fieldInput('Genres / Tags', 'm-genres', 'Comma-separated');
  const cover   = fieldInput('Cover image URL', 'm-cover', 'Optional — https://…');
  cover.input.type = 'url';
  const summary = fieldTextarea('Summary', 'm-summary', 'Optional', 3);

  form.appendChild(title.field);
  form.appendChild(creators.field);
  form.appendChild(twoCol(year.field, genres.field));
  form.appendChild(cover.field);
  form.appendChild(summary.field);

  const errSlot = el('div', {});
  form.appendChild(errSlot);

  const actions = el('div', { class: 'modal-actions add-form-actions' });
  const saveBtn = el('button', { type: 'submit', class: 'btn btn-primary' });
  saveBtn.innerHTML = `${icons.plus()} Add to catalog`;
  actions.appendChild(saveBtn);
  form.appendChild(actions);

  card.appendChild(form);
  title.input.focus();

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    clear(errSlot);
    const t = title.input.value.trim();
    if (!t) { errSlot.appendChild(errorNode('A title is required.')); title.input.focus(); return; }
    saveBtn.disabled = true;

    const yearNum = parseInt(year.input.value, 10);
    const coverUrl = cover.input.value.trim() || null;
    let blob = null;
    if (coverUrl) {
      try { blob = await fetchThumbBlob(coverUrl); } catch { /* ignore bad URL */ }
    }

    const entry = {
      id: newEntryId(),
      type,
      sourceId: null,
      title: t,
      creators: splitList(creators.input.value),
      year: Number.isFinite(yearNum) ? yearNum : null,
      summary: summary.input.value.trim() || '',
      genres: splitList(genres.input.value),
      pageCount: null,
      thumbnailUrl: coverUrl,
      thumbnailBlob: blob,
      rating: null,
      status: null,
      notes: '',
      dateAdded: new Date().toISOString(),
      dateRated: null
    };
    await saveEntry(entry);
    ctx.onChanged?.();
    openEntry(entry.id, { onChanged: ctx.onChanged });
  });
}

// ── Small field builders ───────────────────────────────────────

function fieldInput(label, id, placeholder) {
  const field = el('div', { class: 'field' });
  field.appendChild(el('label', { class: 'label-field', for: id }, label));
  const input = el('input', { id, type: 'text', class: 'input', placeholder, autocomplete: 'off' });
  field.appendChild(input);
  return { field, input };
}

function fieldTextarea(label, id, placeholder, rows) {
  const field = el('div', { class: 'field' });
  field.appendChild(el('label', { class: 'label-field', for: id }, label));
  const input = el('textarea', { id, class: 'textarea', placeholder, rows: String(rows) });
  field.appendChild(input);
  return { field, input };
}

function twoCol(a, b) {
  return el('div', { class: 'modal-two-col' }, a, b);
}

function splitList(value) {
  return (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
