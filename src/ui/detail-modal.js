import { el, clear, selectWrap } from './components.js';
import { icons } from '../util/icons.js';
import { ratingControl } from './rating.js';
import {
  saveEntry, deleteEntry, getEntry,
  newEntryId, findBySource, thumbnailUrl
} from '../db/database.js';
import { fetchThumbBlob } from '../util/thumbs.js';

const TYPE_LABEL = { book: 'Book', movie: 'Movie', tv: 'TV Show', quote: 'Quote' };
const TYPE_ICON  = { book: 'book', movie: 'film', tv: 'tv', quote: 'quote' };
const STATUS_OPTS = [
  { v: '',            l: '— none —'   },
  { v: 'want',        l: 'Want to read'  },
  { v: 'in-progress', l: 'In progress' },
  { v: 'finished',    l: 'Finished'   }
];

let activeBackdrop = null;
let escListener   = null;

export function closeModal() {
  if (!activeBackdrop) return;
  activeBackdrop.remove();
  activeBackdrop = null;
  if (escListener) { document.removeEventListener('keydown', escListener); escListener = null; }
}

export function openModal(renderFn) {
  closeModal();

  const card = el('div', { class: 'modal-card', role: 'dialog', 'aria-modal': 'true' });

  const closeBtn = el('button', {
    type: 'button', class: 'btn-icon modal-close', 'aria-label': 'Close', onClick: closeModal
  });
  closeBtn.innerHTML = icons.x();
  card.appendChild(closeBtn);

  const backdrop = el('div', {
    class: 'modal-backdrop',
    onClick: (ev) => { if (ev.target === backdrop) closeModal(); }
  }, card);
  document.body.appendChild(backdrop);
  activeBackdrop = backdrop;

  escListener = (ev) => { if (ev.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', escListener);

  renderFn(card);
}

export async function openEntry(id, { onChanged } = {}) {
  const entry = await getEntry(id);
  if (!entry) return;
  openModal((card) => renderEntryView(card, entry, { onChanged }));
}

export function openSearchHit(hit, { onChanged } = {}) {
  openModal((card) => renderHitView(card, hit, { onChanged }));
}

// ── Shared hero header ─────────────────────────────────────────

function buildHero(entry) {
  const hero = el('div', { class: 'modal-hero' });

  // Poster
  const poster = el('div', { class: 'modal-poster' });
  const blobUrl = thumbnailUrl(entry);
  const src = blobUrl || entry.thumbnailUrl;
  if (src) {
    const img = el('img', { src, alt: '' });
    img.addEventListener('error', () => { img.remove(); poster.appendChild(posterPlaceholder(entry)); });
    poster.appendChild(img);
  } else {
    poster.appendChild(posterPlaceholder(entry));
  }
  hero.appendChild(poster);

  // Heading block
  const heading = el('div', { class: 'modal-heading' });
  heading.appendChild(el('div', { class: 'modal-eyebrow' }, TYPE_LABEL[entry.type] || entry.type));
  heading.appendChild(el('h2', { class: 'modal-title' }, entry.title));
  if (entry.creators?.length) {
    heading.appendChild(el('p', { class: 'modal-creators' }, entry.creators.join(', ')));
  }
  if (entry.year) {
    heading.appendChild(el('p', { class: 'modal-year' }, String(entry.year)));
  }
  if (entry.genres?.length) {
    const tagRow = el('div', { class: 'tag-row' });
    for (const g of entry.genres.slice(0, 8)) tagRow.appendChild(el('span', { class: 'tag' }, g));
    heading.appendChild(tagRow);
  }
  hero.appendChild(heading);
  return hero;
}

function posterPlaceholder(entry) {
  const ph = el('div', { class: 'modal-poster-placeholder' });
  const iconFn = icons[TYPE_ICON[entry.type] || 'book'];
  ph.innerHTML = iconFn ? iconFn() : '';
  return ph;
}

// ── Saved-entry view ───────────────────────────────────────────

function renderEntryView(card, entry, { onChanged }) {
  if (entry.type === 'quote') { renderQuoteView(card, entry, { onChanged }); return; }
  clear(card);

  const closeBtn = el('button', {
    type: 'button', class: 'btn-icon modal-close', 'aria-label': 'Close', onClick: closeModal
  });
  closeBtn.innerHTML = icons.x();
  card.appendChild(closeBtn);

  // Hero
  card.appendChild(buildHero(entry));

  // Summary
  if (entry.summary?.trim()) {
    const sec = el('div', { class: 'modal-section' });
    sec.appendChild(el('div', { class: 'modal-section-label' }, 'Synopsis'));
    sec.appendChild(el('p', { class: 'modal-summary' }, entry.summary));
    card.appendChild(sec);
  }

  // Rating
  {
    const sec = el('div', { class: 'modal-section' });
    sec.appendChild(el('div', { class: 'modal-section-label' }, 'Rating'));
    sec.appendChild(ratingControl(entry.rating, async (next) => {
      entry.rating = next;
      entry.dateRated = next != null ? new Date().toISOString() : null;
      await saveEntry(entry);
      onChanged?.();
    }));
    card.appendChild(sec);
  }

  // Status + Notes (two-column)
  {
    const sec = el('div', { class: 'modal-section' });
    const grid = el('div', { class: 'modal-two-col' });

    // Status
    const statusCol = el('div', {});
    statusCol.appendChild(el('div', { class: 'modal-section-label' }, 'Progress'));
    const statusSel = el('select', { class: 'select' });
    for (const opt of STATUS_OPTS) {
      const o = el('option', { value: opt.v }, opt.l);
      if ((entry.status || '') === opt.v) o.setAttribute('selected', '');
      statusSel.appendChild(o);
    }
    statusSel.addEventListener('change', async () => {
      entry.status = statusSel.value || null;
      await saveEntry(entry);
      onChanged?.();
    });
    statusCol.appendChild(selectWrap(statusSel));
    grid.appendChild(statusCol);

    // Notes
    const notesCol = el('div', {});
    notesCol.appendChild(el('div', { class: 'modal-section-label' }, 'Notes'));
    const notes = el('textarea', { class: 'textarea', placeholder: 'Private notes…' });
    notes.style.minHeight = '80px';
    notes.value = entry.notes || '';
    let t;
    notes.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(async () => { entry.notes = notes.value; await saveEntry(entry); onChanged?.(); }, 300);
    });
    notesCol.appendChild(notes);
    grid.appendChild(notesCol);

    sec.appendChild(grid);
    card.appendChild(sec);
  }

  // Actions
  const actions = el('div', { class: 'modal-actions' });
  const removeBtn = el('button', {
    type: 'button',
    class: 'btn btn-danger',
    onClick: async () => {
      if (!confirm(`Remove "${entry.title}" from your catalog?`)) return;
      await deleteEntry(entry.id);
      closeModal();
      onChanged?.();
    }
  }, 'Remove from catalog');
  actions.appendChild(removeBtn);
  card.appendChild(actions);
}

// ── Quote view ─────────────────────────────────────────────────

function renderQuoteView(card, entry, { onChanged }) {
  clear(card);

  const closeBtn = el('button', {
    type: 'button', class: 'btn-icon modal-close', 'aria-label': 'Close', onClick: closeModal
  });
  closeBtn.innerHTML = icons.x();
  card.appendChild(closeBtn);

  // Quote display
  const quoteBlock = el('div', { class: 'modal-quote-block' });
  quoteBlock.appendChild(el('span', { class: 'modal-quote-glyph', 'aria-hidden': 'true' }, '“'));
  quoteBlock.appendChild(el('blockquote', { class: 'modal-quote-text' }, entry.quoteText || entry.title));
  const citeParts = [entry.creators?.[0], entry.source].filter(Boolean);
  if (citeParts.length) {
    quoteBlock.appendChild(el('div', { class: 'modal-quote-citation' }, '— ' + citeParts.join(', ')));
  }
  card.appendChild(quoteBlock);

  // Rating
  {
    const sec = el('div', { class: 'modal-section' });
    sec.appendChild(el('div', { class: 'modal-section-label' }, 'Rating'));
    sec.appendChild(ratingControl(entry.rating, async (next) => {
      entry.rating = next;
      entry.dateRated = next != null ? new Date().toISOString() : null;
      await saveEntry(entry);
      onChanged?.();
    }));
    card.appendChild(sec);
  }

  // Notes
  {
    const sec = el('div', { class: 'modal-section' });
    sec.appendChild(el('div', { class: 'modal-section-label' }, 'Notes'));
    const notes = el('textarea', { class: 'textarea', placeholder: 'Private notes…' });
    notes.style.minHeight = '80px';
    notes.value = entry.notes || '';
    let t;
    notes.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(async () => { entry.notes = notes.value; await saveEntry(entry); onChanged?.(); }, 300);
    });
    sec.appendChild(notes);
    card.appendChild(sec);
  }

  // Actions
  const actions = el('div', { class: 'modal-actions' });
  actions.appendChild(el('button', {
    type: 'button', class: 'btn btn-danger',
    onClick: async () => {
      if (!confirm('Remove this quote from your catalog?')) return;
      await deleteEntry(entry.id);
      closeModal();
      onChanged?.();
    }
  }, 'Remove quote'));
  card.appendChild(actions);
}

// ── Search-hit view (not yet saved) ───────────────────────────

function renderHitView(card, hit, { onChanged }) {
  clear(card);

  const closeBtn = el('button', {
    type: 'button', class: 'btn-icon modal-close', 'aria-label': 'Close', onClick: closeModal
  });
  closeBtn.innerHTML = icons.x();
  card.appendChild(closeBtn);

  card.appendChild(buildHero(hit));

  if (hit.summary?.trim()) {
    const sec = el('div', { class: 'modal-section' });
    sec.appendChild(el('div', { class: 'modal-section-label' }, 'Synopsis'));
    sec.appendChild(el('p', { class: 'modal-summary' }, hit.summary));
    card.appendChild(sec);
  }

  // Add action
  const actions = el('div', { class: 'modal-actions' });
  const addBtn = el('button', { type: 'button', class: 'btn btn-primary' }, 'Add to catalog');
  const hint   = el('p', { class: 'field-hint', style: 'margin:0;align-self:center' }, '');
  actions.appendChild(addBtn);
  actions.appendChild(hint);
  card.appendChild(actions);

  addBtn.addEventListener('click', async () => {
    addBtn.setAttribute('disabled', '');
    addBtn.setAttribute('aria-disabled', 'true');
    hint.textContent = 'Saving…';

    const existing = await findBySource(hit.type, hit.sourceId);
    if (existing) {
      hint.textContent = 'Already in your catalog.';
      setTimeout(() => openEntry(existing.id, { onChanged }), 350);
      return;
    }

    const blob = await fetchThumbBlob(hit.thumbnailUrl);
    const entry = {
      id:           newEntryId(),
      type:         hit.type,
      sourceId:     String(hit.sourceId),
      title:        hit.title,
      creators:     hit.creators || [],
      year:         hit.year ?? null,
      summary:      hit.summary || '',
      genres:       hit.genres || [],
      pageCount:    hit.pageCount || null,
      thumbnailUrl: hit.thumbnailUrl || null,
      thumbnailBlob: blob,
      rating:       null,
      status:       null,
      notes:        '',
      dateAdded:    new Date().toISOString(),
      dateRated:    null
    };
    await saveEntry(entry);
    onChanged?.();
    renderEntryView(card, entry, { onChanged });
  });
}
