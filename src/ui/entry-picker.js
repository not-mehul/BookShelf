// "From (on your shelf)" picker: an accessible combobox that links a quote to
// a book / movie / show already in the catalog.

import { el, clear } from './components.js';
import { icons } from '../util/icons.js';
import { listEntries } from '../db/database.js';

/** @typedef {import('../types').CatalogEntry} CatalogEntry */

const TYPE_LABEL = { book: 'Book', movie: 'Movie', tv: 'TV' };
const MAX_OPTIONS = 6;

/**
 * Entries whose title or creators contain the query (case-insensitive),
 * title-prefix matches first. Quotes are never candidates.
 * @param {CatalogEntry[]} entries
 * @param {string} query
 * @param {number} [limit]
 */
export function matchEntries(entries, query, limit = MAX_OPTIONS) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return entries
    .filter((e) => e.type !== 'quote')
    .map((e) => {
      const title = e.title.toLowerCase();
      const inCreators = (e.creators || []).some((c) => c.toLowerCase().includes(q));
      const score = title.startsWith(q) ? 0 : title.includes(q) ? 1 : inCreators ? 2 : -1;
      return { e, score };
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) => a.score - b.score || a.e.title.localeCompare(b.e.title))
    .slice(0, limit)
    .map((x) => x.e);
}

/**
 * The entry whose title equals `title` (ignoring case, punctuation and a
 * leading "The"/"A"), for auto-linking shared quotes. Null if none / ambiguous.
 * @param {CatalogEntry[]} entries
 * @param {string} title
 */
export function findEntryByTitle(entries, title) {
  const norm = (/** @type {string} */ s) =>
    s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/^(the|a|an)\s+/, '').replace(/\s+/g, ' ').trim();
  const target = norm(title || '');
  if (!target) return null;
  const hits = entries.filter((e) => e.type !== 'quote' && norm(e.title) === target);
  return hits.length === 1 ? hits[0] : null;
}

/**
 * @param {object} options
 * @param {string} options.id            Input id (for the label).
 * @param {string} [options.label]
 * @param {string | null} [options.selectedId]  Initially linked entry.
 * @param {string} [options.autoLinkTitle]      Link this title if it matches exactly one entry.
 * @param {(entry: CatalogEntry | null) => void} [options.onSelect]
 */
export function entryPicker({ id, label = 'From (on your shelf)', selectedId = null, autoLinkTitle = '', onSelect }) {
  /** @type {CatalogEntry[]} */
  let entries = [];
  /** @type {CatalogEntry | null} */
  let selected = null;
  /** @type {CatalogEntry[]} */
  let options = [];
  let active = -1;

  const listId = `${id}-list`;
  const field = el('div', { class: 'field entry-picker' });
  field.appendChild(el('label', { class: 'label-field', for: id }, label));
  const chipSlot = el('div', { class: 'picker-chip-slot' });
  const input = el('input', {
    id,
    type: 'text',
    class: 'input',
    role: 'combobox',
    'aria-autocomplete': 'list',
    'aria-expanded': 'false',
    'aria-controls': listId,
    autocomplete: 'off',
    placeholder: 'Search your books, films and shows…'
  });
  const list = el('ul', { id: listId, class: 'picker-list', role: 'listbox', hidden: true });
  field.append(chipSlot, input, list);

  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  };

  /** @param {CatalogEntry | null} entry @param {boolean} [notify] */
  const select = (entry, notify = true) => {
    selected = entry;
    clear(chipSlot);
    input.hidden = Boolean(entry);
    if (entry) {
      const chip = el('div', { class: 'picker-chip' },
        el('span', { class: 'picker-chip-type' }, TYPE_LABEL[/** @type {'book'} */ (entry.type)] || ''),
        el('span', { class: 'picker-chip-title' }, entry.title + (entry.creators?.[0] ? ` — ${entry.creators[0]}` : ''))
      );
      const unlink = el('button', { type: 'button', class: 'btn-icon picker-chip-x', 'aria-label': `Unlink ${entry.title}` });
      unlink.innerHTML = icons.x();
      unlink.addEventListener('click', () => {
        select(null);
        input.value = '';
        input.focus();
      });
      chip.appendChild(unlink);
      chipSlot.appendChild(chip);
    }
    close();
    if (notify) onSelect?.(entry);
  };

  const renderOptions = () => {
    clear(list);
    options = matchEntries(entries, input.value);
    if (!options.length) {
      close();
      return;
    }
    options.forEach((entry, i) => {
      const opt = el('li', {
        id: `${listId}-${i}`,
        class: 'picker-option',
        role: 'option',
        'aria-selected': i === active ? 'true' : 'false'
      },
        el('span', { class: 'picker-option-title' }, entry.title),
        el('span', { class: 'picker-option-sub' },
          [TYPE_LABEL[/** @type {'book'} */ (entry.type)], entry.creators?.[0], entry.year].filter(Boolean).join(' · '))
      );
      // pointerdown (not click) so the input doesn't blur first.
      opt.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        select(entry);
      });
      list.appendChild(opt);
    });
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (active >= 0) input.setAttribute('aria-activedescendant', `${listId}-${active}`);
    else input.removeAttribute('aria-activedescendant');
  };

  input.addEventListener('input', () => {
    active = -1;
    renderOptions();
  });
  input.addEventListener('blur', () => setTimeout(close, 0));
  input.addEventListener('keydown', (ev) => {
    if (list.hidden || !options.length) return;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      const delta = ev.key === 'ArrowDown' ? 1 : -1;
      active = (active + delta + options.length) % options.length;
      renderOptions();
    } else if (ev.key === 'Enter' && active >= 0) {
      ev.preventDefault();
      select(options[active]);
    } else if (ev.key === 'Escape') {
      // Close the list only — don't let Escape also close the dialog.
      ev.preventDefault();
      ev.stopPropagation();
      close();
    }
  });

  // Load candidates, then apply the initial / auto link.
  const ready = listEntries().then((all) => {
    entries = all.filter((e) => e.type !== 'quote');
    const initial = (selectedId && entries.find((e) => e.id === selectedId)) || null;
    if (initial) select(initial, false);
    else if (autoLinkTitle) {
      const match = findEntryByTitle(entries, autoLinkTitle);
      if (match) select(match, false);
    }
  });

  return {
    field,
    ready,
    /** @returns {string | null} */
    value: () => selected?.id ?? null,
    selectedEntry: () => selected
  };
}
