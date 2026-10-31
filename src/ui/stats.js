// Statistics overview — a read-only modal summarizing the catalog.

import { el, clear } from './components.js';
import { icons } from '../util/icons.js';
import { listEntries } from '../db/database.js';
import { openModal, closeModal } from './detail-modal.js';
import { ratingDistribution } from '../util/stars.js';

const TYPE_LABEL = { book: 'Books', movie: 'Movies', tv: 'TV', quote: 'Quotes' };

export function openStats() {
  openModal(async (card) => {
    clear(card);
    const closeBtn = el('button', {
      type: 'button', class: 'btn-icon modal-close', 'aria-label': 'Close', onClick: closeModal
    });
    closeBtn.innerHTML = icons.x();
    card.appendChild(closeBtn);

    card.appendChild(el('div', { class: 'add-head' },
      el('div', { class: 'modal-eyebrow' }, 'Overview'),
      el('h2', { class: 'add-title', id: 'modal-title', tabindex: '-1' }, 'Statistics')
    ));

    const body = el('div', { class: 'stats-body' });
    card.appendChild(body);
    body.appendChild(el('p', { class: 'field-hint' }, 'Loading…'));

    const entries = await listEntries();
    clear(body);

    if (!entries.length) {
      body.appendChild(el('p', { class: 'field-hint' }, 'No entries yet — add something to see statistics.'));
      return;
    }

    // ── Totals by type ──
    const counts = { book: 0, movie: 0, tv: 0, quote: 0 };
    for (const e of entries) if (counts[e.type] != null) counts[e.type]++;
    const tiles = el('div', { class: 'stats-tiles' });
    tiles.appendChild(statTile(entries.length, 'Total'));
    for (const t of ['book', 'movie', 'tv', 'quote']) {
      if (counts[t]) tiles.appendChild(statTile(counts[t], TYPE_LABEL[t]));
    }
    body.appendChild(tiles);

    // ── Ratings ──
    const ratings = entries.map((e) => e.rating).filter((r) => r != null);
    if (ratings.length) {
      const avg = (ratings.reduce((s, r) => s + r, 0) / ratings.length).toFixed(1);
      body.appendChild(sectionLabel(`Ratings — avg ${avg}★ across ${ratings.length}`));
      const bins = ratingDistribution(ratings);
      const max = Math.max(...bins.map((b) => b.count), 1);
      const chart = el('div', { class: 'stats-bars' });
      for (const { rating, count } of bins) {
        const row = el('div', { class: 'stats-bar-row' });
        row.appendChild(el('span', { class: 'stats-bar-key' }, `${rating}★`));
        const track = el('div', { class: 'stats-bar-track' });
        const fill = el('div', { class: 'stats-bar-fill' });
        fill.style.width = `${Math.round((count / max) * 100)}%`;
        track.appendChild(fill);
        row.appendChild(track);
        row.appendChild(el('span', { class: 'stats-bar-val' }, String(count)));
        chart.appendChild(row);
      }
      body.appendChild(chart);
    }

    // ── Top genres ──
    const genreCounts = new Map();
    for (const e of entries) for (const g of e.genres || []) {
      genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
    }
    const topGenres = [...genreCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (topGenres.length) {
      body.appendChild(sectionLabel('Top genres'));
      const gr = el('div', { class: 'tag-row' });
      for (const [g, n] of topGenres) gr.appendChild(el('span', { class: 'tag' }, `${g} · ${n}`));
      body.appendChild(gr);
    }

    // ── Reading / watching progress ──
    const withProgress = entries.filter((e) => e.progress && e.progress.total > 0);
    const finished = entries.filter((e) => e.status === 'finished').length;
    const inProgress = entries.filter((e) => e.status === 'in-progress').length;
    if (finished || inProgress || withProgress.length) {
      body.appendChild(sectionLabel('Activity'));
      const row = el('div', { class: 'stats-tiles' });
      if (inProgress) row.appendChild(statTile(inProgress, 'In progress'));
      if (finished) row.appendChild(statTile(finished, 'Finished'));
      body.appendChild(row);
    }
  });
}

function statTile(value, label) {
  const tile = el('div', { class: 'stat-tile' });
  tile.appendChild(el('div', { class: 'stat-tile-value' }, String(value)));
  tile.appendChild(el('div', { class: 'stat-tile-label' }, label));
  return tile;
}

function sectionLabel(text) {
  return el('div', { class: 'stats-section-label' }, text);
}
