import { el, clear, selectWrap, coverImage } from './components.js';
import { pushBackHandler } from '../platform/native.js';
import { icons } from '../util/icons.js';
import { ratingControl, aspectRatings } from './rating.js';
import { fieldInput, fieldTextarea, twoCol, splitList } from './forms.js';
import { saveEntry, deleteEntry, getEntry, thumbnailUrl, listQuotesFor, listEntries } from '../db/database.js';
import { parseSeriesFromTitle, seriesEntries, nextInSeries } from '../util/series.js';
import { STATUS_LABEL, statusLabel } from '../util/status.js';
import { applyStatus } from '../util/apply-status.js';
import { entryPicker } from './entry-picker.js';
import { enrichEntry, isTvdbConfigured } from '../api/tvdb.js';
import { loadEpisodeGuide } from '../api/episode-sync.js';
import { guideIsStale } from '../util/episodes.js';
import { episodesSection } from './episodes-section.js';
import { fetchThumbBlob } from '../util/thumbs.js';
import { shareEntry } from '../export/share.js';

const TYPE_LABEL = { book: 'Book', movie: 'Movie', tv: 'TV Show', quote: 'Quote' };
const TYPE_ICON = { book: 'book', movie: 'film', tv: 'tv', quote: 'quote' };
const STATUS_OPTS = [
  { v: '', l: '— none —' },
  { v: 'want', l: STATUS_LABEL.want },
  { v: 'in-progress', l: STATUS_LABEL['in-progress'] },
  { v: 'finished', l: STATUS_LABEL.finished }
];
const PROGRESS_LABEL = { book: 'Pages read', tv: 'Episodes watched' };

// One modal at a time, built on the native <dialog> element: showModal()
// provides the top layer, an inert background (so focus can't escape),
// Escape handling via `cancel`, and focus restoration on close.
/** @type {HTMLDialogElement | null} */
let activeDialog = null;
/** @type {(() => void) | null} */
let releaseBack = null;

export function closeModal() {
  const dialog = activeDialog;
  if (!dialog) return;
  activeDialog = null;
  releaseBack?.();
  releaseBack = null;
  if (dialog.open) dialog.close();
  dialog.remove();
}

// Returns the opened <dialog>, so async callers can check it is still current.
export function openModal(renderFn) {
  closeModal();

  const card = el('div', { class: 'modal-card' });
  const closeBtn = el('button', {
    type: 'button',
    class: 'btn-icon modal-close',
    'aria-label': 'Close',
    onClick: closeModal
  });
  closeBtn.innerHTML = icons.x();
  card.appendChild(closeBtn);

  const dialog = el('dialog', { class: 'modal-dialog', 'aria-labelledby': 'modal-title' }, card);
  // The dialog box fills the viewport; a click on it outside the card dismisses.
  dialog.addEventListener('click', (ev) => {
    if (ev.target === dialog) closeModal();
  });
  dialog.addEventListener('cancel', (ev) => {
    ev.preventDefault();
    closeModal();
  });
  document.body.appendChild(dialog);
  activeDialog = dialog;

  // Open first so views can focus their own inputs while rendering.
  dialog.showModal();
  renderFn(card);
  // If the view didn't claim focus, land on its title (for screen readers),
  // or failing that on its first control — never leave focus outside. (The
  // card itself doesn't count: showModal() may focus it as an empty scroller,
  // and it stops being focusable once the view renders controls into it.)
  const active = document.activeElement;
  if (!card.contains(active) || active === card || active === closeBtn) {
    /** @type {HTMLElement | null} */ (
      card.querySelector('#modal-title') || card.querySelector('input, textarea, select, button')
    )?.focus();
  }
  // Android Back closes the modal instead of leaving the app.
  releaseBack = pushBackHandler(closeModal);
  return dialog;
}

/** @typedef {{ onChanged?: () => void }} ChangeListener */

/**
 * @param {string} id
 * @param {ChangeListener} [listener]
 */
export async function openEntry(id, { onChanged } = {}) {
  const entry = await getEntry(id);
  if (!entry) return;
  const dialog = openModal((card) => renderEntryView(card, entry, { onChanged }));

  // Lazily enrich movies/TV that were saved from a thin search hit (no
  // director/cast yet), and load / refresh a show's episode guide. Each step
  // re-renders only if this entry's modal is still the one on screen.
  /** @param {import('../types').CatalogEntry} updated */
  const refreshView = (updated) => {
    if (activeDialog === dialog) renderEntryView(/** @type {HTMLElement} */ (dialog.querySelector('.modal-card')), updated, { onChanged });
    onChanged?.();
  };
  let current = entry;
  if ((entry.type === 'movie' || entry.type === 'tv') && entry.sourceId && !entry.enriched) {
    try {
      const enriched = await enrichEntry(entry);
      if (enriched.enriched) {
        if (!enriched.thumbnailBlob && enriched.thumbnailUrl && enriched.thumbnailUrl !== entry.thumbnailUrl) {
          enriched.thumbnailBlob = await fetchThumbBlob(enriched.thumbnailUrl);
        }
        await saveEntry(enriched);
        current = enriched;
        refreshView(enriched);
      }
    } catch {
      /* offline or no key — keep the thin entry */
    }
  }
  if (current.type === 'tv' && current.sourceId && guideIsStale(current) && (await isTvdbConfigured())) {
    try {
      refreshView(await loadEpisodeGuide(current));
    } catch {
      /* offline — keep whatever guide we have */
    }
  }
}

// ── Shared hero header ─────────────────────────────────────────

function buildHero(entry) {
  const hero = el('div', { class: 'modal-hero' });

  const poster = el('div', { class: 'modal-poster' });
  const src = thumbnailUrl(entry) || entry.thumbnailUrl;
  if (src) {
    poster.appendChild(
      coverImage(src, { onError: (img) => { img.remove(); poster.appendChild(posterPlaceholder(entry)); } })
    );
  } else {
    poster.appendChild(posterPlaceholder(entry));
  }
  hero.appendChild(poster);

  const heading = el('div', { class: 'modal-heading' });
  heading.appendChild(el('div', { class: 'modal-eyebrow' }, TYPE_LABEL[entry.type] || entry.type));
  heading.appendChild(el('h2', { class: 'modal-title', id: 'modal-title', tabindex: '-1' }, entry.title));
  if (entry.creators?.length) {
    heading.appendChild(el('p', { class: 'modal-creators' }, entry.creators.join(', ')));
  }
  if (entry.year) heading.appendChild(el('p', { class: 'modal-year' }, String(entry.year)));
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
  if (entry.type === 'quote') {
    renderQuoteView(card, entry, { onChanged });
    return;
  }
  clear(card);
  card.appendChild(closeButton());
  card.appendChild(buildHero(entry));

  if (entry.summary?.trim()) {
    const sec = el('div', { class: 'modal-section' });
    sec.appendChild(el('div', { class: 'modal-section-label' }, 'Synopsis'));
    sec.appendChild(el('p', { class: 'modal-summary' }, entry.summary));
    card.appendChild(sec);
  }

  // Series: reading/watching order and what's next
  if (entry.series?.name) card.appendChild(seriesSection(entry, onChanged));

  // Rating (half stars) + optional per-aspect scores
  {
    const sec = section('Rating', ratingControl(entry.rating, async (next) => {
      entry.rating = next;
      entry.dateRated = next != null ? new Date().toISOString() : null;
      await saveEntry(entry);
      onChanged?.();
    }));
    sec.appendChild(aspectRatings(entry, async (aspects) => {
      entry.aspectRatings = aspects;
      await saveEntry(entry);
      onChanged?.();
    }));
    card.appendChild(sec);
  }

  // TV with an episode guide: per-episode tracking (progress is derived).
  // Books, and shows without a guide (manual entries): manual progress.
  if (entry.type === 'tv' && entry.episodeGuide?.episodes.length) {
    card.appendChild(episodesSection(entry, { onChanged }));
  } else if (entry.type === 'book' || entry.type === 'tv') {
    card.appendChild(progressSection(entry, onChanged));
    if (entry.type === 'tv' && entry.sourceId && !entry.episodeGuide) {
      card.appendChild(el('p', { class: 'field-hint episodes-pending' },
        'Episode tracking appears here once the episode list loads (needs TheTVDB access in Settings).'));
    }
  }

  // Status + Notes
  {
    const grid = el('div', { class: 'modal-two-col' });

    const statusCol = el('div', {});
    statusCol.appendChild(el('div', { class: 'modal-section-label' }, 'Progress status'));
    const statusSel = el('select', { class: 'select', 'aria-label': 'Progress status' });
    for (const opt of STATUS_OPTS) {
      const o = el('option', { value: opt.v }, opt.l);
      if ((entry.status || '') === opt.v) o.setAttribute('selected', '');
      statusSel.appendChild(o);
    }
    statusSel.addEventListener('change', async () => {
      await applyStatus(entry, /** @type {import('../types').EntryStatus} */ (statusSel.value) || null);
      await saveEntry(entry);
      onChanged?.();
    });
    statusCol.appendChild(selectWrap(statusSel));
    grid.appendChild(statusCol);

    grid.appendChild(notesCol(entry, onChanged));

    const sec = el('div', { class: 'modal-section' });
    sec.appendChild(grid);
    card.appendChild(sec);
  }

  // Quotes from this book / film / show
  card.appendChild(linkedQuotesSection(entry, onChanged));

  // Tags
  card.appendChild(tagsSection(entry, onChanged));

  card.appendChild(actionsRow(card, entry, onChanged));
}

// ── Quote view ─────────────────────────────────────────────────

function renderQuoteView(card, entry, { onChanged }) {
  clear(card);
  card.appendChild(closeButton());

  const quoteBlock = el('div', { class: 'modal-quote-block' });
  quoteBlock.appendChild(el('span', { class: 'modal-quote-glyph', 'aria-hidden': 'true' }, '“'));
  quoteBlock.appendChild(
    el('blockquote', { class: 'modal-quote-text', id: 'modal-title', tabindex: '-1' }, entry.quoteText || entry.title)
  );
  const citeParts = [entry.creators?.[0], entry.source, entry.location].filter(Boolean);
  if (citeParts.length) {
    quoteBlock.appendChild(el('div', { class: 'modal-quote-citation' }, '— ' + citeParts.join(', ')));
  }
  card.appendChild(quoteBlock);

  // Linked book / film / show (if it is still on the shelf).
  if (entry.linkedEntryId) {
    void getEntry(entry.linkedEntryId).then((linked) => {
      if (!linked) return;
      const link = el('button', { type: 'button', class: 'quote-from-link' });
      link.append(el('span', { class: 'quote-from-label' }, 'From'), el('span', {}, linked.title));
      link.addEventListener('click', () => openEntry(linked.id, { onChanged }));
      quoteBlock.appendChild(link);
    });
  }

  card.appendChild(
    section('Rating', ratingControl(entry.rating, async (next) => {
      entry.rating = next;
      entry.dateRated = next != null ? new Date().toISOString() : null;
      await saveEntry(entry);
      onChanged?.();
    }))
  );

  {
    const sec = el('div', { class: 'modal-section' });
    sec.appendChild(el('div', { class: 'modal-section-label' }, 'Notes'));
    sec.appendChild(notesField(entry, onChanged));
    card.appendChild(sec);
  }

  card.appendChild(tagsSection(entry, onChanged));
  card.appendChild(actionsRow(card, entry, onChanged));
}

// ── Edit form ──────────────────────────────────────────────────

function renderEditForm(card, entry, { onChanged }) {
  clear(card);
  card.appendChild(closeButton());

  const backBtn = el('button', {
    type: 'button',
    class: 'btn-icon modal-back',
    'aria-label': 'Back',
    onClick: () => renderEntryView(card, entry, { onChanged })
  });
  backBtn.innerHTML = icons.arrowLeft();
  card.appendChild(backBtn);

  const head = el('div', { class: 'add-head' });
  head.appendChild(el('div', { class: 'modal-eyebrow' }, 'Edit'));
  head.appendChild(el('h2', { class: 'add-title', id: 'modal-title', tabindex: '-1' }, `Edit ${TYPE_LABEL[entry.type].toLowerCase()}`));
  card.appendChild(head);

  const form = el('form', { class: 'add-form' });
  const errSlot = el('div', {});

  if (entry.type === 'quote') {
    const text = fieldTextarea('Quote text', 'e-text', 'The quote…', 5, entry.quoteText || entry.title);
    const author = fieldInput('Author', 'e-author', 'e.g. George Orwell', entry.creators?.[0] || '');
    const source = fieldInput('Source / Work', 'e-source', "e.g. 1984", entry.source || '');
    const location = fieldInput('Page / time', 'e-location', 'e.g. p. 112 or 1:04:20', entry.location || '');
    const from = entryPicker({
      id: 'e-from',
      selectedId: entry.linkedEntryId,
      onSelect: (linked) => {
        if (!linked) return;
        if (!author.input.value.trim()) author.input.value = linked.creators?.[0] || '';
        if (!source.input.value.trim()) source.input.value = linked.title;
      }
    });
    form.append(text.field, from.field, twoCol(author.field, source.field), location.field, errSlot, submitRow('Save changes'));
    card.appendChild(form);
    text.input.focus();
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      clear(errSlot);
      const qt = text.input.value.trim();
      if (!qt) { errSlot.appendChild(el('div', { class: 'msg-error' }, 'Quote text is required.')); return; }
      entry.quoteText = qt;
      entry.title = qt.slice(0, 100);
      entry.creators = author.input.value.trim() ? [author.input.value.trim()] : [];
      entry.source = source.input.value.trim() || '';
      entry.location = location.input.value.trim();
      entry.linkedEntryId = from.value();
      await saveEntry(entry);
      onChanged?.();
      renderEntryView(card, entry, { onChanged });
    });
    return;
  }

  const creatorLabel = entry.type === 'book' ? 'Author(s)' : 'Director / Creator(s)';
  const title = fieldInput('Title', 'e-title', 'Required', entry.title);
  const creators = fieldInput(creatorLabel, 'e-creators', 'Comma-separated', (entry.creators || []).join(', '));
  const year = fieldInput('Year', 'e-year', 'e.g. 2021', entry.year != null ? String(entry.year) : '');
  year.input.type = 'number';
  year.input.setAttribute('inputmode', 'numeric');
  const genres = fieldInput('Genres / Tags', 'e-genres', 'Comma-separated', (entry.genres || []).join(', '));
  const cover = fieldInput('Cover image URL', 'e-cover', 'https://…', entry.thumbnailUrl || '');
  cover.input.type = 'url';
  const summary = fieldTextarea('Summary', 'e-summary', 'Optional', 3, entry.summary || '');
  // Series: suggested from the title until the user sets (or clears) it.
  const suggested = entry.series === undefined ? parseSeriesFromTitle(entry.title) : null;
  const current = entry.series || suggested;
  const seriesName = fieldInput('Series', 'e-series', 'e.g. The Expanse', current?.name || '');
  const seriesPos = fieldInput('Number in series', 'e-series-pos', 'e.g. 3', current?.position != null ? String(current.position) : '');
  seriesPos.input.type = 'number';
  seriesPos.input.step = 'any';
  seriesPos.input.min = '0';
  seriesPos.input.setAttribute('inputmode', 'decimal');

  form.append(
    title.field, creators.field, twoCol(year.field, genres.field), twoCol(seriesName.field, seriesPos.field),
    cover.field, summary.field, errSlot, submitRow('Save changes')
  );
  card.appendChild(form);
  title.input.focus();

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    clear(errSlot);
    const t = title.input.value.trim();
    if (!t) { errSlot.appendChild(el('div', { class: 'msg-error' }, 'A title is required.')); title.input.focus(); return; }

    const yearNum = parseInt(year.input.value, 10);
    const newCover = cover.input.value.trim() || null;
    if (newCover && newCover !== entry.thumbnailUrl) {
      try { entry.thumbnailBlob = await fetchThumbBlob(newCover); } catch { /* keep old */ }
    } else if (!newCover) {
      entry.thumbnailBlob = null;
    }
    entry.title = t;
    entry.creators = splitList(creators.input.value);
    entry.year = Number.isFinite(yearNum) ? yearNum : null;
    entry.genres = splitList(genres.input.value);
    entry.thumbnailUrl = newCover;
    entry.summary = summary.input.value.trim() || '';
    const sName = seriesName.input.value.trim();
    const sPos = parseFloat(seriesPos.input.value);
    entry.series = sName ? { name: sName, position: Number.isFinite(sPos) ? sPos : null } : null;
    await saveEntry(entry);
    onChanged?.();
    renderEntryView(card, entry, { onChanged });
  });
}

// ── Sections ───────────────────────────────────────────────────

function section(label, body) {
  const sec = el('div', { class: 'modal-section' });
  sec.appendChild(el('div', { class: 'modal-section-label' }, label));
  sec.appendChild(body);
  return sec;
}

function notesCol(entry, onChanged) {
  const col = el('div', {});
  col.appendChild(el('div', { class: 'modal-section-label' }, 'Notes'));
  col.appendChild(notesField(entry, onChanged));
  return col;
}

// Auto-saving private-notes textarea.
function notesField(entry, onChanged) {
  const notes = el('textarea', { class: 'textarea', placeholder: 'Private notes…', 'aria-label': 'Notes' });
  notes.style.minHeight = '80px';
  notes.value = entry.notes || '';
  let t;
  notes.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      entry.notes = notes.value;
      await saveEntry(entry);
      onChanged?.();
    }, 300);
  });
  return notes;
}

function progressSection(entry, onChanged) {
  const sec = el('div', { class: 'modal-section' });
  sec.appendChild(el('div', { class: 'modal-section-label' }, PROGRESS_LABEL[entry.type] || 'Progress'));

  const p = entry.progress || { current: 0, total: 0 };
  const row = el('div', { class: 'progress-edit-row' });

  const current = el('input', {
    type: 'number', min: '0', class: 'input progress-input',
    value: String(p.current || ''), 'aria-label': 'Current', placeholder: '0'
  });
  const total = el('input', {
    type: 'number', min: '0', class: 'input progress-input',
    value: String(p.total || ''), 'aria-label': 'Total', placeholder: entry.type === 'book' ? 'pages' : 'episodes'
  });

  const bar = el('div', { class: 'progress-bar' });
  const fill = el('div', { class: 'progress-bar-fill' });
  bar.appendChild(fill);

  const update = () => {
    const c = Math.max(0, parseInt(current.value, 10) || 0);
    const tt = Math.max(0, parseInt(total.value, 10) || 0);
    const pct = tt > 0 ? Math.min(100, Math.round((c / tt) * 100)) : 0;
    fill.style.width = pct + '%';
    bar.setAttribute('title', tt ? `${pct}%` : '');
  };
  update();

  let timer;
  const onInput = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const c = Math.max(0, parseInt(current.value, 10) || 0);
      const tt = Math.max(0, parseInt(total.value, 10) || 0);
      entry.progress = { current: c, total: tt };
      // Derive status from progress so the two stay consistent.
      if (tt > 0 && c >= tt) await applyStatus(entry, 'finished');
      else if (c > 0) await applyStatus(entry, 'in-progress');
      update();
      await saveEntry(entry);
      onChanged?.();
    }, 300);
  };
  current.addEventListener('input', onInput);
  total.addEventListener('input', onInput);

  row.append(current, el('span', { class: 'progress-of' }, 'of'), total);
  sec.appendChild(row);
  sec.appendChild(bar);
  return sec;
}

/**
 * The entry's series in order, what comes next, and a way to look for the
 * next or newer installments (opens the add flow's search, via main.js).
 * @param {import('../types').CatalogEntry} entry
 * @param {(() => void) | undefined} onChanged
 */
function seriesSection(entry, onChanged) {
  const series = /** @type {{ name: string, position: number | null }} */ (entry.series);
  const sec = el('div', { class: 'modal-section series-section' });
  sec.appendChild(el('div', { class: 'modal-section-label' }, 'Series'));
  const body = el('div', {});
  sec.appendChild(body);

  /** @param {string} query */
  const find = (query) =>
    document.dispatchEvent(new CustomEvent('bookshelf:find', { detail: { type: entry.type, query } }));

  void listEntries().then((all) => {
    const members = seriesEntries(all, series.name);
    const { next, nextPosition, onShelf } = nextInSeries(all, entry);
    body.appendChild(el('p', { class: 'series-heading' },
      el('span', { class: 'series-name' }, series.name),
      series.position != null ? ` · #${series.position}` : '',
      el('span', { class: 'series-count' }, ` · ${members.length} on your shelf`)
    ));

    const list = el('ol', { class: 'series-list' });
    for (const m of members) {
      const isThis = m.id === entry.id;
      const item = el('button', { type: 'button', class: `series-item${isThis ? ' is-current' : ''}`, disabled: isThis },
        el('span', { class: 'series-pos' }, m.series?.position != null ? `#${m.series.position}` : '—'),
        el('span', { class: 'series-title' }, m.title),
        el('span', { class: 'series-status' }, isThis ? 'this one' : statusLabel(m.status))
      );
      if (!isThis) item.addEventListener('click', () => openEntry(m.id, { onChanged }));
      list.appendChild(el('li', {}, item));
    }
    body.appendChild(list);

    const actions = el('div', { class: 'series-actions' });
    if (next) {
      actions.appendChild(el('p', { class: 'series-next' }, `Next: #${next.series?.position} ${next.title}`));
    } else if (nextPosition != null && !onShelf) {
      const findNext = el('button', { type: 'button', class: 'btn btn-muted btn-sm' }, `Find #${nextPosition}`);
      findNext.addEventListener('click', () => find(`${series.name} ${nextPosition}`));
      actions.appendChild(findNext);
    }
    // Manual check: search the series; results already on the shelf show a ✓.
    const check = el('button', { type: 'button', class: 'btn btn-muted btn-sm' }, 'Check for new installments');
    check.addEventListener('click', () => find(series.name));
    actions.appendChild(check);
    body.appendChild(actions);
  });
  return sec;
}

/**
 * Quotes linked to this entry, plus "Add a quote" (handled by main.js, which
 * owns the add flow, via a `bookshelf:add-quote` event).
 * @param {import('../types').CatalogEntry} entry
 * @param {(() => void) | undefined} onChanged
 */
function linkedQuotesSection(entry, onChanged) {
  const sec = el('div', { class: 'modal-section' });
  sec.appendChild(el('div', { class: 'modal-section-label' }, 'Quotes'));
  const list = el('ul', { class: 'linked-quotes' });
  sec.appendChild(list);

  void listQuotesFor(entry.id).then((quotes) => {
    for (const q of quotes) {
      const text = q.quoteText || q.title;
      const btn = el('button', { type: 'button', class: 'linked-quote' },
        el('span', { class: 'linked-quote-text' }, `“${text.length > 160 ? `${text.slice(0, 159)}…` : text}”`),
        q.location ? el('span', { class: 'linked-quote-loc' }, q.location) : null
      );
      btn.addEventListener('click', () => openEntry(q.id, { onChanged }));
      list.appendChild(el('li', {}, btn));
    }
  });

  const add = el('button', { type: 'button', class: 'btn btn-muted btn-sm' });
  add.innerHTML = `${icons.quote()} <span>Add a quote</span>`;
  add.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('bookshelf:add-quote', { detail: { linkedEntryId: entry.id } }));
  });
  sec.appendChild(add);
  return sec;
}

function tagsSection(entry, onChanged) {
  const sec = el('div', { class: 'modal-section' });
  sec.appendChild(el('div', { class: 'modal-section-label' }, 'Tags / Collections'));

  const chips = el('div', { class: 'tag-chip-row' });
  const renderChips = () => {
    clear(chips);
    for (const tag of entry.tags || []) {
      const chip = el('span', { class: 'tag-chip' }, tag);
      const rm = el('button', {
        type: 'button', class: 'tag-chip-x', 'aria-label': `Remove tag ${tag}`,
        onClick: async () => {
          entry.tags = (entry.tags || []).filter((t) => t !== tag);
          renderChips();
          await saveEntry(entry);
          onChanged?.();
        }
      });
      rm.innerHTML = icons.x();
      chip.appendChild(rm);
      chips.appendChild(chip);
    }
  };
  renderChips();

  const input = el('input', {
    type: 'text', class: 'input tag-input', placeholder: 'Add a tag and press Enter…', 'aria-label': 'Add tag'
  });
  input.addEventListener('keydown', async (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ',') return;
    ev.preventDefault();
    const val = input.value.trim().replace(/,$/, '').trim();
    if (!val) return;
    entry.tags = [...new Set([...(entry.tags || []), val])];
    input.value = '';
    renderChips();
    await saveEntry(entry);
    onChanged?.();
  });

  sec.appendChild(chips);
  sec.appendChild(input);
  return sec;
}

function actionsRow(card, entry, onChanged) {
  const actions = el('div', { class: 'modal-actions' });

  const editBtn = el('button', {
    type: 'button', class: 'btn btn-muted',
    onClick: () => renderEditForm(card, entry, { onChanged })
  });
  editBtn.innerHTML = `${icons.edit()} <span class="btn-label">Edit</span>`;

  const shareBtn = el('button', { type: 'button', class: 'btn btn-muted' });
  shareBtn.innerHTML = `${icons.share()} <span class="btn-label">Share</span>`;
  shareBtn.addEventListener('click', async () => {
    const result = await shareEntry(entry);
    if (result === 'copied') {
      const prev = shareBtn.innerHTML;
      shareBtn.innerHTML = `${icons.check()} <span class="btn-label">Copied</span>`;
      setTimeout(() => { shareBtn.innerHTML = prev; }, 1500);
    }
  });

  const removeBtn = el('button', { type: 'button', class: 'btn btn-danger' }, 'Remove');
  let armed = false;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  removeBtn.addEventListener('click', async () => {
    if (!armed) {
      armed = true;
      removeBtn.textContent = 'Tap again to confirm';
      timer = setTimeout(() => { armed = false; removeBtn.textContent = 'Remove'; }, 3000);
      return;
    }
    clearTimeout(timer);
    await deleteEntry(entry.id);
    closeModal();
    onChanged?.();
  });

  actions.append(editBtn, shareBtn, removeBtn);
  return actions;
}

function submitRow(label) {
  const actions = el('div', { class: 'modal-actions add-form-actions' });
  const saveBtn = el('button', { type: 'submit', class: 'btn btn-primary' });
  saveBtn.innerHTML = `${icons.check()} ${label}`;
  actions.appendChild(saveBtn);
  return actions;
}

function closeButton() {
  const closeBtn = el('button', {
    type: 'button', class: 'btn-icon modal-close', 'aria-label': 'Close', onClick: closeModal
  });
  closeBtn.innerHTML = icons.x();
  return closeBtn;
}
