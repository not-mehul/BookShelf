// "Share card" dialog: preview a Dusk/Dawn image card and share or save it.

import { el, clear, segmented, messageOf } from './components.js';
import { icons } from '../util/icons.js';
import { openModal, closeModal, openEntry } from './detail-modal.js';
import { renderCard, canvasToBlob } from '../share/card.js';
import { FORMATS } from '../share/layout.js';
import { shareImage, downloadImage, canDownload, cardFilename } from '../share/share-image.js';
import { shareEntry } from '../export/share.js';

/** @typedef {import('../types').CatalogEntry} CatalogEntry */

/**
 * @param {CatalogEntry} entry
 * @param {{ onChanged?: () => void }} [ctx]
 */
export function openShareCard(entry, { onChanged } = {}) {
  openModal((card) => {
    clear(card);
    const close = el('button', { type: 'button', class: 'btn-icon modal-close', 'aria-label': 'Close', onClick: closeModal });
    close.innerHTML = icons.x();
    const back = el('button', { type: 'button', class: 'btn-icon modal-back', 'aria-label': 'Back',
      onClick: () => openEntry(entry.id, { onChanged }) });
    back.innerHTML = icons.arrowLeft();
    card.append(close, back, el('div', { class: 'add-head' },
      el('div', { class: 'modal-eyebrow' }, 'Share'),
      el('h2', { class: 'add-title', id: 'modal-title', tabindex: '-1' }, 'Share card')
    ));

    const options = {
      theme: /** @type {'dark' | 'light'} */ (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'),
      format: /** @type {keyof typeof FORMATS} */ ('post'),
      includeRating: true,
      includeNotes: false
    };

    const body = el('div', { class: 'share-card-body' });
    const preview = el('img', { class: 'share-card-preview', alt: 'Preview of the share card' });
    const status = el('p', { class: 'field-hint share-card-status', role: 'status', 'aria-live': 'polite' });
    body.appendChild(el('div', { class: 'share-card-frame' }, preview));

    const controls = el('div', { class: 'share-card-controls' });
    controls.appendChild(segmented(
      [{ value: 'dark', label: 'Dusk' }, { value: 'light', label: 'Dawn' }], options.theme,
      (v) => { options.theme = /** @type {'dark' | 'light'} */ (v); void render(); }
    ));
    controls.appendChild(segmented(
      Object.entries(FORMATS).map(([value, f]) => ({ value, label: f.label })), options.format,
      (v) => { options.format = /** @type {keyof typeof FORMATS} */ (v); void render(); }
    ));
    if (entry.type !== 'quote') {
      /** @param {string} id @param {string} label @param {'includeRating' | 'includeNotes'} key */
      const toggle = (id, label, key) => {
        const box = el('input', { type: 'checkbox', id, checked: options[key] });
        box.addEventListener('change', () => { options[key] = box.checked; void render(); });
        return el('label', { class: 'share-card-toggle', for: id }, box, ` ${label}`);
      };
      if (entry.rating != null) controls.appendChild(toggle('card-rating', 'Rating', 'includeRating'));
      if (entry.notes?.trim()) controls.appendChild(toggle('card-notes', 'My notes', 'includeNotes'));
    }
    body.appendChild(controls);

    const shareBtn = el('button', { type: 'button', class: 'btn btn-primary' });
    shareBtn.innerHTML = `${icons.share()} <span>Share image</span>`;
    const actions = el('div', { class: 'modal-actions share-card-actions' }, shareBtn);
    /** @type {HTMLButtonElement | null} */
    let saveBtn = null;
    if (canDownload()) {
      saveBtn = el('button', { type: 'button', class: 'btn btn-muted' });
      saveBtn.innerHTML = `${icons.download()} <span>Save image</span>`;
      actions.appendChild(saveBtn);
    }
    const textBtn = el('button', { type: 'button', class: 'btn btn-muted' }, 'Share as text');
    actions.appendChild(textBtn);
    body.append(actions, status);
    card.appendChild(body);

    /** @type {Blob | null} */
    let blob = null;
    let url = '';
    let renderSeq = 0;
    async function render() {
      const seq = ++renderSeq;
      shareBtn.disabled = true;
      if (saveBtn) saveBtn.disabled = true;
      try {
        const next = await canvasToBlob(await renderCard(entry, options));
        if (seq !== renderSeq) return; // a newer render superseded this one
        blob = next;
        if (url) URL.revokeObjectURL(url);
        url = URL.createObjectURL(blob);
        preview.src = url;
        shareBtn.disabled = false;
        if (saveBtn) saveBtn.disabled = false;
      } catch (err) {
        status.textContent = messageOf(err);
      }
    }

    const filename = cardFilename(entry.type === 'quote' ? `quote ${entry.creators?.[0] || ''}` : entry.title);
    shareBtn.addEventListener('click', async () => {
      if (!blob) return;
      try {
        const result = await shareImage(blob, filename, entry.title);
        status.textContent = result === 'downloaded' ? `Saved ${filename}.` : '';
      } catch (err) {
        status.textContent = messageOf(err);
      }
    });
    saveBtn?.addEventListener('click', () => {
      if (!blob) return;
      downloadImage(blob, filename);
      status.textContent = `Saved ${filename}.`;
    });
    textBtn.addEventListener('click', async () => {
      const result = await shareEntry(entry);
      if (result === 'copied') status.textContent = 'Copied to the clipboard.';
    });

    void render();
  });
}
