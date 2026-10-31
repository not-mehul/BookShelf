import { el } from './components.js';
import { icons } from '../util/icons.js';
import { normalizeRating, starString } from '../util/stars.js';

/**
 * Half-star rating control (0.5–5, or null = unrated), exposed as a slider.
 *   • Pointer: the left half of a star sets x.5, the right half x; tapping the
 *     current value again clears it. Mouse hover previews.
 *   • Keyboard: ←/↓ and →/↑ step by ½, 1–5 jump, Home/End = ½/5,
 *     Delete/Backspace/0 clear.
 * @param {number | null | undefined} initial
 * @param {(value: number | null) => void} onChange
 * @param {{ label?: string, compact?: boolean }} [options]
 */
export function ratingControl(initial, onChange, { label = 'Rating', compact = false } = {}) {
  let value = normalizeRating(initial);
  const wrap = el('div', { class: `rating-row${compact ? ' rating-row-compact' : ''}` });
  const slider = el('div', {
    class: 'rating-stars',
    role: 'slider',
    tabindex: '0',
    'aria-label': label,
    'aria-valuemin': '0',
    'aria-valuemax': '5'
  });

  /** @type {HTMLElement[]} */
  const fills = [];
  for (let i = 0; i < 5; i++) {
    const star = el('span', { class: 'rating-star', 'aria-hidden': 'true' });
    star.innerHTML = icons.star();
    const fill = el('span', { class: 'rating-star-fill' });
    fill.innerHTML = icons.star();
    star.appendChild(fill);
    fills.push(fill);
    slider.appendChild(star);
  }

  /** @param {number | null} shown */
  const paint = (shown) => {
    fills.forEach((fill, i) => {
      const amount = shown == null ? 0 : Math.min(1, Math.max(0, shown - i));
      fill.style.width = `${amount * 100}%`;
    });
  };
  const render = () => {
    paint(value);
    slider.setAttribute('aria-valuenow', String(value ?? 0));
    slider.setAttribute('aria-valuetext', value == null ? 'Unrated' : `${value} of 5 stars`);
    clearBtn.hidden = value == null;
  };
  /** @param {number | null} next */
  const commit = (next) => {
    next = normalizeRating(next);
    if (next === value) return;
    value = next;
    render();
    onChange(value);
  };

  /** Rating under the pointer, from its x position across the five stars. */
  const valueAt = (/** @type {PointerEvent | MouseEvent} */ ev) => {
    const rect = slider.getBoundingClientRect();
    const x = Math.min(Math.max(ev.clientX - rect.left, 0), rect.width - 0.01);
    return Math.floor((x / rect.width) * 10) / 2 + 0.5;
  };
  slider.addEventListener('click', (ev) => {
    const v = valueAt(ev);
    commit(v === value ? null : v);
  });
  slider.addEventListener('pointermove', (ev) => {
    if (ev.pointerType === 'mouse') paint(valueAt(ev));
  });
  slider.addEventListener('pointerleave', () => paint(value));

  slider.addEventListener('keydown', (ev) => {
    const v = value ?? 0;
    /** @type {number | null | undefined} */
    let next;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') next = Math.min(5, v + 0.5);
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') next = v - 0.5 <= 0 ? null : v - 0.5;
    else if (ev.key === 'Home') next = 0.5;
    else if (ev.key === 'End') next = 5;
    else if (ev.key === 'Delete' || ev.key === 'Backspace' || ev.key === '0') next = null;
    else if (/^[1-5]$/.test(ev.key)) next = Number(ev.key);
    else return;
    ev.preventDefault();
    commit(next);
  });

  const clearBtn = el('button', {
    type: 'button',
    class: 'rating-clear',
    'aria-label': `Clear ${label.toLowerCase()}`,
    onClick: () => commit(null)
  }, 'Clear');

  wrap.append(slider, clearBtn);
  render();
  return wrap;
}

// Optional finer-grained scores, by media type.
export const ASPECTS = {
  book: [['story', 'Story'], ['writing', 'Writing'], ['characters', 'Characters'], ['pacing', 'Pacing']],
  movie: [['story', 'Story'], ['acting', 'Acting'], ['direction', 'Direction'], ['visuals', 'Visuals']],
  tv: [['story', 'Story'], ['acting', 'Acting'], ['characters', 'Characters'], ['pacing', 'Pacing']]
};

/**
 * Collapsible per-aspect ratings for a book / movie / show.
 * @param {import('../types').CatalogEntry} entry
 * @param {(aspects: Record<string, number>) => void} onChange
 */
export function aspectRatings(entry, onChange) {
  const aspects = ASPECTS[/** @type {'book' | 'movie' | 'tv'} */ (entry.type)] || [];
  const scores = { ...(entry.aspectRatings || {}) };
  const details = el('details', { class: 'aspect-ratings' });
  const summary = el('summary', {}, 'Rate aspects');
  const summaryValue = el('span', { class: 'aspect-summary' });
  summary.appendChild(summaryValue);
  details.appendChild(summary);

  const refreshSummary = () => {
    const parts = aspects.filter(([k]) => scores[k] != null).map(([k, l]) => `${l} ${starString(scores[k])}`);
    summaryValue.textContent = parts.length ? ` · ${parts.join(' · ')}` : '';
  };

  for (const [key, label] of aspects) {
    const row = el('div', { class: 'aspect-row' });
    row.appendChild(el('span', { class: 'aspect-label' }, label));
    row.appendChild(ratingControl(scores[key], (v) => {
      if (v == null) delete scores[key];
      else scores[key] = v;
      refreshSummary();
      onChange({ ...scores });
    }, { label: `${label} rating`, compact: true }));
    details.appendChild(row);
  }
  refreshSummary();
  return details;
}
