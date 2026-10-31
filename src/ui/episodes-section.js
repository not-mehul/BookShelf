// "Episodes" section of a TV show's detail view: next up, per-episode
// checkboxes by season, and (in the Android app) new-episode reminders.

import { el } from './components.js';
import { icons } from '../util/icons.js';
import { saveEntry, listEntries } from '../db/database.js';
import { applyStatus } from '../util/apply-status.js';
import { isNativeShell, callNative } from '../platform/native.js';
import {
  episodeProgress, seasons, setWatched, derivedTvState, episodeCode, hasAired, localDate
} from '../util/episodes.js';
import { pushEpisodeReminders } from '../api/episode-sync.js';

/** @typedef {import('../types').CatalogEntry} CatalogEntry */
/** @typedef {import('../types').Episode} Episode */

/** Seasons the user has expanded, per show (survives re-renders). */
const openSeasons = new Map();

const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
/** @param {string | null} ymd */
const fmtDate = (ymd) => (ymd ? dateFmt.format(new Date(`${ymd}T12:00:00`)) : '');

/**
 * Record watched changes: update progress and (forward-only) status, save.
 * @param {CatalogEntry} entry
 * @param {number[]} ids
 * @param {boolean} watched
 */
export async function markEpisodes(entry, ids, watched) {
  setWatched(entry, ids, watched);
  const { progress, status } = derivedTvState(entry);
  entry.progress = progress;
  if (status === 'finished' || (status === 'in-progress' && entry.status !== 'finished' && entry.status !== 'in-progress')) {
    await applyStatus(entry, status);
  }
  await saveEntry(entry);
}

/**
 * @param {CatalogEntry} entry
 * @param {{ onChanged?: () => void }} ctx
 * @returns {HTMLElement}
 */
export function episodesSection(entry, ctx) {
  const today = localDate();
  const p = episodeProgress(entry, today);
  const open = openSeasons.get(entry.id) ?? new Set();
  openSeasons.set(entry.id, open);

  const sec = el('div', { class: 'modal-section episodes-section' });

  /** Re-render in place, restoring focus to the same control. @param {string} [focusKey] */
  const rerender = (focusKey) => {
    const next = episodesSection(entry, ctx);
    sec.replaceWith(next);
    if (focusKey) /** @type {HTMLElement | null} */ (next.querySelector(`[data-focus="${focusKey}"]`))?.focus();
    ctx.onChanged?.();
  };
  /** @param {number[]} ids @param {boolean} watched @param {string} [focusKey] */
  const mark = async (ids, watched, focusKey) => {
    await markEpisodes(entry, ids, watched);
    rerender(focusKey);
  };

  const head = el('div', { class: 'episodes-head' }, el('div', { class: 'modal-section-label' }, 'Episodes'));
  if (isNativeShell()) head.appendChild(reminderToggle(entry, ctx));
  sec.appendChild(head);

  sec.appendChild(el('p', { class: 'episodes-summary' },
    `${p.watched} of ${p.aired} aired episode${p.aired === 1 ? '' : 's'} watched` + (p.total > p.aired ? ` · ${p.total - p.aired} upcoming` : '')
  ));

  if (p.next) {
    const markNext = el('button', { type: 'button', class: 'btn btn-primary btn-sm', 'data-focus': 'mark-next' });
    markNext.innerHTML = `${icons.check()} <span>Mark watched</span>`;
    markNext.addEventListener('click', () => mark([/** @type {Episode} */ (p.next).id], true, 'mark-next'));
    sec.appendChild(el('div', { class: 'episodes-next' },
      el('div', {},
        el('div', { class: 'episodes-next-label' }, 'Next up'),
        el('div', { class: 'episodes-next-title' }, `${episodeCode(p.next)} · ${p.next.name || 'Untitled'}`)
      ),
      markNext
    ));
  } else if (p.caughtUp) {
    sec.appendChild(el('p', { class: 'episodes-next-note' },
      p.upcoming ? `Caught up — ${episodeCode(p.upcoming)} airs ${fmtDate(p.upcoming.aired)}` : 'Caught up on every aired episode.'));
  }

  const bar = el('div', { class: 'progress-bar', role: 'progressbar', 'aria-label': 'Episodes watched',
    'aria-valuemin': '0', 'aria-valuemax': String(p.aired || 1), 'aria-valuenow': String(p.watched) });
  const fill = el('div', { class: 'progress-bar-fill' });
  fill.style.width = `${p.aired ? Math.round((p.watched / p.aired) * 100) : 0}%`;
  bar.appendChild(fill);
  sec.appendChild(bar);

  const watched = new Set(entry.watchedEpisodes || []);
  for (const { season, episodes } of seasons(entry)) {
    const aired = episodes.filter((ep) => hasAired(ep, today));
    const done = aired.filter((ep) => watched.has(ep.id)).length;
    const details = el('details', { class: 'season' });
    // Open the season holding "next up", plus any the user opened.
    if (open.has(season) || (p.next && p.next.s === season && !open.size)) details.open = true;
    details.addEventListener('toggle', () => (details.open ? open.add(season) : open.delete(season)));

    const label = season === 0 ? 'Specials' : `Season ${season}`;
    details.appendChild(el('summary', {},
      el('span', { class: 'season-name' }, label),
      el('span', { class: 'season-count' }, `${done}/${aired.length}${done === aired.length && aired.length ? ' ✓' : ''}`)
    ));

    if (aired.length) {
      const all = done === aired.length;
      const toggleSeason = el('button', { type: 'button', class: 'btn btn-muted btn-sm season-toggle', 'data-focus': `season-${season}` },
        all ? 'Mark season unwatched' : 'Mark season watched');
      toggleSeason.addEventListener('click', () => mark(aired.map((ep) => ep.id), !all, `season-${season}`));
      details.appendChild(toggleSeason);
    }

    const list = el('ul', { class: 'episode-list' });
    for (const ep of episodes) {
      const id = `ep-${entry.id}-${ep.id}`;
      const isAired = hasAired(ep, today);
      const box = el('input', { type: 'checkbox', id, 'data-focus': `ep-${ep.id}`, disabled: !isAired, checked: watched.has(ep.id) });
      box.addEventListener('change', () => mark([ep.id], box.checked, `ep-${ep.id}`));
      list.appendChild(el('li', { class: `episode${isAired ? '' : ' is-upcoming'}` },
        box,
        el('label', { for: id },
          el('span', { class: 'episode-code' }, `E${ep.e}`),
          el('span', { class: 'episode-name' }, ep.name || 'Untitled'),
          el('span', { class: 'episode-date' }, ep.aired ? (isAired ? fmtDate(ep.aired) : `airs ${fmtDate(ep.aired)}`) : 'TBA')
        )
      ));
    }
    details.appendChild(list);
    sec.appendChild(details);
  }
  return sec;
}

/**
 * Per-show "notify me" switch (Android app). Asks for notification
 * permission when turned on, and reverts if it's refused.
 * @param {CatalogEntry} entry
 * @param {{ onChanged?: () => void }} ctx
 */
function reminderToggle(entry, ctx) {
  const id = `remind-${entry.id}`;
  const box = el('input', { type: 'checkbox', id, checked: Boolean(entry.remindNewEpisodes) });
  const note = el('span', { class: 'remind-note', role: 'status' });
  box.addEventListener('change', async () => {
    if (box.checked) {
      const granted = await callNative('requestNotificationPermission').catch(() => false);
      if (!granted) {
        box.checked = false;
        note.textContent = 'Notifications are off for BookShelf — allow them in system settings.';
        return;
      }
    }
    note.textContent = '';
    entry.remindNewEpisodes = box.checked;
    await saveEntry(entry);
    await pushEpisodeReminders(await listEntries());
    ctx.onChanged?.();
  });
  const label = el('label', { class: 'remind-toggle', for: id }, box);
  const bell = el('span', { 'aria-hidden': 'true' });
  bell.innerHTML = icons.bell();
  label.append(bell, ' New-episode alerts');
  return el('div', { class: 'remind-wrap' }, label, note);
}
