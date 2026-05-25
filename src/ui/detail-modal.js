import { el, clear } from './components.js';
import { icons } from '../util/icons.js';
import { ratingControl, displayRating } from './rating.js';
import {
  saveEntry,
  deleteEntry,
  getEntry,
  newEntryId,
  findBySource,
  thumbnailUrl
} from '../db/database.js';
import { fetchThumbBlob } from '../util/thumbs.js';

const TYPE_LABEL = { book: 'Book', movie: 'Movie', tv: 'TV Show' };

let activeBackdrop = null;
let escListener = null;

export function closeModal() {
  if (!activeBackdrop) return;
  activeBackdrop.remove();
  activeBackdrop = null;
  if (escListener) {
    document.removeEventListener('keydown', escListener);
    escListener = null;
  }
}

export function openModal(contentFactory) {
  closeModal();
  const card = el('div', { class: 'modal-card', role: 'dialog', 'aria-modal': 'true' });
  const closeBtn = el(
    'button',
    {
      type: 'button',
      class: 'btn-icon modal-close',
      'aria-label': 'Close',
      onClick: closeModal
    }
  );
  closeBtn.innerHTML = icons.x();
  card.appendChild(closeBtn);

  const body = el('div', { class: 'modal-body' });
  card.appendChild(body);

  const backdrop = el(
    'div',
    {
      class: 'modal-backdrop',
      onClick: (ev) => {
        if (ev.target === backdrop) closeModal();
      }
    },
    card
  );
  document.body.appendChild(backdrop);
  activeBackdrop = backdrop;

  escListener = (ev) => {
    if (ev.key === 'Escape') closeModal();
  };
  document.addEventListener('keydown', escListener);

  contentFactory(body);
}

// Open the modal for an existing saved entry (by id).
export async function openEntry(id, { onChanged } = {}) {
  const entry = await getEntry(id);
  if (!entry) return;
  openModal((body) => renderEntryView(body, entry, { onChanged }));
}

// Open the modal for a search hit (not yet saved). `hit` is a normalized object.
export function openSearchHit(hit, { onChanged } = {}) {
  openModal((body) => renderHitView(body, hit, { onChanged }));
}

function header(entry) {
  const poster = el('div', { class: 'modal-poster' });
  const thumbBlobUrl = thumbnailUrl(entry);
  const src = thumbBlobUrl || entry.thumbnailUrl;
  if (src) {
    poster.appendChild(el('img', { src, alt: '' }));
  } else {
    poster.appendChild(el('div', { class: 'placeholder', html: '<em>no cover</em>' }));
  }

  const heading = el('div', { class: 'modal-heading' });
  heading.appendChild(el('div', { class: 'modal-eyebrow' }, TYPE_LABEL[entry.type] || entry.type));
  heading.appendChild(el('h2', { class: 'modal-title' }, entry.title));
  const subBits = [];
  if (entry.creators?.length) subBits.push(entry.creators.join(', '));
  if (entry.year) subBits.push(String(entry.year));
  if (subBits.length) heading.appendChild(el('p', { class: 'modal-sub' }, subBits.join(' · ')));

  return el('div', { class: 'modal-header' }, poster, heading);
}

function genreTags(entry) {
  if (!entry.genres?.length) return null;
  const wrap = el('div', { class: 'tag-row' });
  for (const g of entry.genres.slice(0, 10)) {
    wrap.appendChild(el('span', { class: 'tag' }, g));
  }
  return wrap;
}

function summary(entry) {
  if (!entry.summary?.trim()) return null;
  return el('p', { class: 'modal-summary' }, entry.summary);
}

function renderEntryView(body, entry, { onChanged }) {
  clear(body);
  body.appendChild(header(entry));
  const tags = genreTags(entry);
  if (tags) body.appendChild(tags);
  const sum = summary(entry);
  if (sum) body.appendChild(sum);

  // Rating
  const ratingLabel = el('div', { class: 'label-field' }, 'Rating');
  const ratingNode = ratingControl(entry.rating, async (next) => {
    entry.rating = next;
    entry.dateRated = next != null ? new Date().toISOString() : null;
    await saveEntry(entry);
    onChanged?.();
  });
  body.appendChild(el('div', { class: 'field' }, ratingLabel, ratingNode));

  // Status
  const statusLabel = el('div', { class: 'label-field' }, 'Status');
  const statusSel = el('select', { class: 'select' });
  for (const opt of [
    { v: '', l: '— none —' },
    { v: 'want', l: 'Want' },
    { v: 'in-progress', l: 'In progress' },
    { v: 'finished', l: 'Finished' }
  ]) {
    const o = el('option', { value: opt.v }, opt.l);
    if ((entry.status || '') === opt.v) o.setAttribute('selected', '');
    statusSel.appendChild(o);
  }
  statusSel.addEventListener('change', async () => {
    entry.status = statusSel.value || null;
    await saveEntry(entry);
    onChanged?.();
  });
  body.appendChild(el('div', { class: 'field' }, statusLabel, statusSel));

  // Notes
  const notesLabel = el('div', { class: 'label-field' }, 'Notes');
  const notes = el('textarea', { class: 'textarea', placeholder: 'Private notes…' });
  notes.value = entry.notes || '';
  let notesTimer;
  notes.addEventListener('input', () => {
    clearTimeout(notesTimer);
    notesTimer = setTimeout(async () => {
      entry.notes = notes.value;
      await saveEntry(entry);
      onChanged?.();
    }, 300);
  });
  body.appendChild(el('div', { class: 'field' }, notesLabel, notes));

  // Actions
  const removeBtn = el(
    'button',
    {
      type: 'button',
      class: 'btn btn-muted',
      onClick: async () => {
        if (!confirm(`Remove "${entry.title}" from your catalog?`)) return;
        await deleteEntry(entry.id);
        closeModal();
        onChanged?.();
      }
    },
    'Remove from catalog'
  );
  body.appendChild(el('div', { class: 'row-actions' }, removeBtn));
}

function renderHitView(body, hit, { onChanged }) {
  clear(body);
  body.appendChild(header(hit));
  const tags = genreTags(hit);
  if (tags) body.appendChild(tags);
  const sum = summary(hit);
  if (sum) body.appendChild(sum);

  const status = el('div', { class: 'label-field' }, 'Add to catalog');

  const addBtn = el('button', { type: 'button', class: 'btn btn-primary' }, 'Add to library');
  const statusMsg = el('div', { class: 'field-hint' }, '');

  addBtn.addEventListener('click', async () => {
    addBtn.setAttribute('disabled', '');
    addBtn.setAttribute('aria-disabled', 'true');
    statusMsg.textContent = 'Saving…';
    const existing = await findBySource(hit.type, hit.sourceId);
    if (existing) {
      statusMsg.textContent = 'Already in your catalog. Opening saved entry.';
      setTimeout(() => openEntry(existing.id, { onChanged }), 350);
      return;
    }
    const blob = await fetchThumbBlob(hit.thumbnailUrl);
    const entry = {
      id: newEntryId(),
      type: hit.type,
      sourceId: String(hit.sourceId),
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
    onChanged?.();
    renderEntryView(body, entry, { onChanged });
  });

  body.appendChild(el('div', { class: 'field' }, status, addBtn, statusMsg));
}
