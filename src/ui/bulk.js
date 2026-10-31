// Bulk edit for a multi-selection in the library: status, tags, delete.

import { el, clear, selectWrap, messageOf } from './components.js';
import { icons } from '../util/icons.js';
import { getEntry, saveEntry, deleteEntry, listEntries } from '../db/database.js';
import { openModal, closeModal } from './detail-modal.js';
import { applyStatus } from '../util/apply-status.js';
import { STATUS_LABEL } from '../util/status.js';

/** @typedef {import('../types').CatalogEntry} CatalogEntry */
/** @typedef {import('../types').EntryStatus} EntryStatus */
/**
 * @typedef {object} BulkChanges
 * @property {EntryStatus | null} [status] Omit (undefined) to leave status alone; null clears it.
 * @property {string} [addTag]
 * @property {string} [removeTag]
 */

/**
 * Apply tag changes to one entry (pure). Returns true if anything changed.
 * @param {CatalogEntry} entry
 * @param {BulkChanges} changes
 */
export function applyTagChanges(entry, { addTag, removeTag }) {
  const before = (entry.tags || []).join('\u0000');
  let tags = [...(entry.tags || [])];
  const add = addTag?.trim();
  if (add && !tags.includes(add)) tags.push(add);
  if (removeTag) tags = tags.filter((t) => t !== removeTag);
  entry.tags = tags;
  return tags.join('\u0000') !== before;
}

/**
 * Apply `changes` to every entry in `ids`. Returns how many entries changed.
 * @param {string[]} ids
 * @param {BulkChanges} changes
 */
export async function applyBulkChanges(ids, changes) {
  const all = await listEntries();
  let changed = 0;
  for (const id of ids) {
    const entry = await getEntry(id);
    if (!entry) continue;
    let dirty = applyTagChanges(entry, changes);
    if (changes.status !== undefined && entry.type !== 'quote' && (entry.status ?? null) !== changes.status) {
      await applyStatus(entry, changes.status, all);
      dirty = true;
    }
    if (dirty) {
      await saveEntry(entry);
      changed++;
    }
  }
  return changed;
}

/** @param {string[]} ids */
export async function deleteEntries(ids) {
  for (const id of ids) await deleteEntry(id);
}

/**
 * The "Edit selected" dialog.
 * @param {string[]} ids
 * @param {{ onApplied?: (changed: number) => void }} [options]
 */
export function openBulkEdit(ids, { onApplied } = {}) {
  openModal((card) => {
    clear(card);
    const closeBtn = el('button', { type: 'button', class: 'btn-icon modal-close', 'aria-label': 'Close', onClick: closeModal });
    closeBtn.innerHTML = icons.x();
    card.appendChild(closeBtn);
    card.appendChild(el('div', { class: 'add-head' },
      el('div', { class: 'modal-eyebrow' }, `${ids.length} selected`),
      el('h2', { class: 'add-title', id: 'modal-title', tabindex: '-1' }, 'Edit selected')
    ));

    const form = el('form', { class: 'add-form bulk-form' });
    const status = el('select', { class: 'select', id: 'bulk-status' });
    status.append(
      el('option', { value: '__keep' }, '— No change —'),
      ...Object.entries(STATUS_LABEL).map(([v, l]) => el('option', { value: v }, l)),
      el('option', { value: '' }, 'Clear status')
    );
    const addTag = el('input', { type: 'text', class: 'input', id: 'bulk-add-tag', placeholder: 'e.g. Summer 2026', autocomplete: 'off' });
    const removeTag = el('select', { class: 'select', id: 'bulk-remove-tag' });
    removeTag.appendChild(el('option', { value: '' }, '— None —'));
    const err = el('div', {});
    const apply = el('button', { type: 'submit', class: 'btn btn-primary' });
    apply.innerHTML = `${icons.check()} Apply to ${ids.length}`;

    form.append(
      el('div', { class: 'field' }, el('label', { class: 'label-field', for: 'bulk-status' }, 'Status'), selectWrap(status)),
      el('div', { class: 'field' }, el('label', { class: 'label-field', for: 'bulk-add-tag' }, 'Add tag'), addTag),
      el('div', { class: 'field' }, el('label', { class: 'label-field', for: 'bulk-remove-tag' }, 'Remove tag'), selectWrap(removeTag)),
      err,
      el('div', { class: 'modal-actions add-form-actions' }, apply)
    );
    card.appendChild(form);

    // Offer only tags the selection actually has.
    void Promise.all(ids.map((id) => getEntry(id))).then((entries) => {
      const tags = [...new Set(entries.flatMap((e) => e?.tags || []))].sort();
      for (const t of tags) removeTag.appendChild(el('option', { value: t }, t));
    });

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      apply.disabled = true;
      /** @type {BulkChanges} */
      const changes = { addTag: addTag.value, removeTag: removeTag.value };
      if (status.value !== '__keep') changes.status = /** @type {EntryStatus} */ (status.value) || null;
      try {
        const changed = await applyBulkChanges(ids, changes);
        closeModal();
        onApplied?.(changed);
      } catch (e) {
        clear(err);
        err.appendChild(el('div', { class: 'msg-error' }, messageOf(e)));
        apply.disabled = false;
      }
    });
  });
}
