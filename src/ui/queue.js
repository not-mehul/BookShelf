// The ranked "want to" queue: reorder by drag (or keyboard / buttons) and let
// the app pick something for you.

import { el, clear, segmented, coverImage, selectWrap } from './components.js';
import { icons } from '../util/icons.js';
import { listEntries, saveEntry, thumbnailUrl } from '../db/database.js';
import { openModal, closeModal, openEntry } from './detail-modal.js';
import { queueOrder, normalizeRanks, rankForMove, pickFromQueue } from '../util/queue.js';
import { applyStatus } from '../util/apply-status.js';

/** @typedef {import('../types').CatalogEntry} CatalogEntry */

const TYPE_OPTS = [
  { value: 'all', label: 'All' },
  { value: 'book', label: 'Books' },
  { value: 'movie', label: 'Movies' },
  { value: 'tv', label: 'TV' }
];
const TYPE_LABEL = { book: 'Book', movie: 'Movie', tv: 'TV' };

/** @param {{ onChanged?: () => void }} [listener] */
export function openQueue({ onChanged } = {}) {
  openModal((card) => {
    clear(card);
    const closeBtn = el('button', { type: 'button', class: 'btn-icon modal-close', 'aria-label': 'Close', onClick: closeModal });
    closeBtn.innerHTML = icons.x();
    card.appendChild(closeBtn);
    card.appendChild(el('div', { class: 'add-head' },
      el('div', { class: 'modal-eyebrow' }, 'Wishlist'),
      el('h2', { class: 'add-title', id: 'modal-title', tabindex: '-1' }, 'Your queue')
    ));
    const body = el('div', { class: 'queue-body' });
    card.appendChild(body);
    void renderQueue(body, onChanged);
  });
}

/**
 * @param {HTMLElement} body
 * @param {(() => void) | undefined} onChanged
 */
async function renderQueue(body, onChanged) {
  /** @type {'all' | 'book' | 'movie' | 'tv'} */
  let type = 'all';
  /** @type {CatalogEntry[]} */
  let all = [];
  /** @type {string | undefined} */
  let lastPickId;

  const live = el('div', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite' });
  const filters = el('div', { class: 'queue-filters' });
  const pickPanel = el('div', { class: 'queue-pick' });
  const list = el('ol', { class: 'queue-list', 'aria-label': 'Queue, in order' });
  body.append(live, filters, pickPanel, list);

  filters.appendChild(segmented(TYPE_OPTS, type, (v) => {
    type = /** @type {typeof type} */ (v);
    render();
  }));

  // ── Pick something for me ───────────────────────────────────
  const shortBox = el('input', { type: 'checkbox', id: 'pick-short' });
  const genreSel = el('select', { class: 'select select-sm', 'aria-label': 'Genre' });
  const pickBtn = el('button', { type: 'button', class: 'btn btn-primary' });
  pickBtn.innerHTML = `${icons.shuffle()} <span>Pick something for me</span>`;
  const pickResult = el('div', { class: 'queue-pick-result', 'aria-live': 'polite' });
  pickPanel.append(
    el('div', { class: 'queue-pick-controls' },
      pickBtn,
      el('label', { class: 'queue-short', for: 'pick-short' }, shortBox, ' Short books'),
      selectWrap(genreSel, true)
    ),
    pickResult
  );
  pickBtn.addEventListener('click', () => showPick());

  async function reload() {
    all = await listEntries();
    // First visit (or crowded ranks): give everything queued a stable rank.
    for (const e of normalizeRanks(queueOrder(all))) await saveEntry(e);
  }

  const visible = () => queueOrder(all).filter((e) => type === 'all' || e.type === type);

  function render() {
    const items = visible();
    clear(list);

    // Genres present in the (filtered) queue.
    const keep = genreSel.value;
    clear(genreSel);
    genreSel.appendChild(el('option', { value: '' }, 'Any genre'));
    for (const g of [...new Set(items.flatMap((e) => e.genres || []))].sort()) {
      genreSel.appendChild(el('option', { value: g, selected: g === keep }, g));
    }

    if (!items.length) {
      list.appendChild(el('li', { class: 'queue-empty' },
        type === 'all'
          ? 'Your queue is empty. Set something to “Wishlist” and it lines up here.'
          : 'Nothing of this type in your queue.'));
      pickBtn.disabled = true;
      return;
    }
    pickBtn.disabled = false;
    items.forEach((entry, i) => list.appendChild(queueItem(entry, i, items)));
  }

  /**
   * @param {CatalogEntry} entry
   * @param {number} index
   * @param {CatalogEntry[]} items
   */
  function queueItem(entry, index, items) {
    const li = el('li', { class: 'queue-item', 'data-id': entry.id });
    const handle = el('button', {
      type: 'button',
      class: 'queue-handle',
      'aria-label': `Reorder ${entry.title}, position ${index + 1} of ${items.length}. Use the up and down arrow keys to move it.`
    });
    handle.innerHTML = icons.grip();

    const thumb = el('div', { class: 'queue-thumb' });
    const src = thumbnailUrl(entry) || entry.thumbnailUrl;
    if (src) thumb.appendChild(coverImage(src, { onError: (img) => img.remove() }));

    const main = el('button', { type: 'button', class: 'queue-main' },
      el('span', { class: 'queue-title' }, entry.title),
      el('span', { class: 'queue-sub' },
        [TYPE_LABEL[/** @type {'book'} */ (entry.type)], entry.creators?.[0], entry.pageCount ? `${entry.pageCount} pp.` : '']
          .filter(Boolean).join(' · '))
    );
    main.addEventListener('click', () => openEntry(entry.id, { onChanged }));

    const up = el('button', { type: 'button', class: 'btn-icon queue-move', 'aria-label': `Move ${entry.title} up`, disabled: index === 0 });
    up.innerHTML = icons.arrowUp();
    up.addEventListener('click', () => move(items, index, index - 1, `[data-id="${entry.id}"] .queue-move`));
    const down = el('button', { type: 'button', class: 'btn-icon queue-move', 'aria-label': `Move ${entry.title} down`, disabled: index === items.length - 1 });
    down.innerHTML = icons.arrowDown();
    down.addEventListener('click', () => move(items, index, index + 1, `[data-id="${entry.id}"] .queue-move:last-child`));

    handle.addEventListener('keydown', (ev) => {
      if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return;
      ev.preventDefault();
      const to = index + (ev.key === 'ArrowUp' ? -1 : 1);
      if (to >= 0 && to < items.length) move(items, index, to, `[data-id="${entry.id}"] .queue-handle`);
    });
    enableDrag(li, handle, items);

    li.append(handle, el('span', { class: 'queue-pos', 'aria-hidden': 'true' }, String(index + 1)), thumb, main,
      el('div', { class: 'queue-moves' }, up, down));
    return li;
  }

  /**
   * Persist a move and re-render, keeping focus on the moved item.
   * @param {CatalogEntry[]} items
   * @param {number} from
   * @param {number} to
   * @param {string} [focusSelector]
   */
  async function move(items, from, to, focusSelector) {
    if (from === to) return;
    const entry = items[from];
    entry.queueRank = rankForMove(items, from, to);
    await saveEntry(entry);
    for (const e of normalizeRanks(queueOrder(all))) await saveEntry(e);
    render();
    live.textContent = `${entry.title} moved to position ${to + 1} of ${items.length}.`;
    if (focusSelector) /** @type {HTMLElement | null} */ (list.querySelector(focusSelector))?.focus();
    onChanged?.();
  }

  /**
   * Pointer drag on the handle: the row follows live; drop commits the move.
   * @param {HTMLElement} li
   * @param {HTMLElement} handle
   * @param {CatalogEntry[]} items
   */
  function enableDrag(li, handle, items) {
    const from = items.findIndex((e) => e.id === li.dataset.id);
    handle.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      handle.setPointerCapture(ev.pointerId);
      li.classList.add('dragging');
      const onMove = (/** @type {PointerEvent} */ e) => {
        const others = [...list.children].filter((c) => c !== li);
        const over = others.find((c) => {
          const r = c.getBoundingClientRect();
          return e.clientY < r.top + r.height / 2;
        });
        if ((over || null) !== li.nextElementSibling) list.insertBefore(li, over || null);
      };
      const onUp = () => {
        handle.removeEventListener('pointermove', onMove);
        li.classList.remove('dragging');
        const to = [...list.children].indexOf(li);
        if (to !== from) void move(items, from, to, `[data-id="${li.dataset.id}"] .queue-handle`);
      };
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp, { once: true });
      handle.addEventListener('pointercancel', onUp, { once: true });
    });
  }

  function showPick() {
    clear(pickResult);
    const pick = pickFromQueue(visible(), { type, short: shortBox.checked, genre: genreSel.value }, Math.random, lastPickId);
    if (!pick) {
      pickResult.appendChild(el('p', { class: 'field-hint' }, 'Nothing in your queue matches those filters.'));
      return;
    }
    lastPickId = pick.id;
    const start = el('button', { type: 'button', class: 'btn btn-primary btn-sm' }, 'Start now');
    start.addEventListener('click', async () => {
      await applyStatus(pick, 'in-progress', all);
      await saveEntry(pick);
      onChanged?.();
      openEntry(pick.id, { onChanged });
    });
    const again = el('button', { type: 'button', class: 'btn btn-muted btn-sm' }, 'Pick again');
    again.addEventListener('click', () => showPick());
    pickResult.appendChild(el('div', { class: 'queue-pick-card' },
      el('div', { class: 'queue-pick-label' }, 'How about…'),
      el('div', { class: 'queue-pick-title' }, pick.title),
      el('div', { class: 'queue-sub' }, [TYPE_LABEL[/** @type {'book'} */ (pick.type)], pick.creators?.[0]].filter(Boolean).join(' · ')),
      el('div', { class: 'queue-pick-actions' }, start, again)
    ));
  }

  await reload();
  render();
}
