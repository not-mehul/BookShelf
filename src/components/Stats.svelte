<script lang="ts">
  import { Select } from 'dusk-dawn';
  import { shelf } from '../state/shelf.svelte';
  import { ui } from '../state/ui.svelte';
  import { plural } from '../util/labels';
  import { ratingDistribution, ratingValue } from '../util/stars';
  import { ratingView } from '../state/rating-scale.svelte';
  import {
    bookPages,
    decades,
    finishesIn,
    highlights,
    journalYears,
    medianDays,
    monthly,
    topCreators,
    undatedFinished,
    hoursWatched
  } from '../util/year-stats';
  import ModalHead from './ModalHead.svelte';
  import BarList from './stats/BarList.svelte';
  import MonthChart from './stats/MonthChart.svelte';

  // A read-only summary of the catalog: the year in review first (what was
  // finished, and when), then the shelf as a whole.

  const TYPES = [
    ['book', 'Books'],
    ['movie', 'Movies'],
    ['tv', 'TV'],
    ['quote', 'Quotes']
  ] as const;
  const now = new Date();
  const thisYear = now.getFullYear();

  const entries = $derived(shelf.entries);

  // ── Year in review ────────────────────────────────────────────
  const years = $derived(journalYears(entries, thisYear));
  let year = $state(thisYear);
  const finishes = $derived(finishesIn(entries, year));
  const byType = $derived.by(() => {
    const c = { book: 0, movie: 0, tv: 0 };
    for (const f of finishes) if (f.entry.type !== 'quote') c[f.entry.type]++;
    return c;
  });
  const pages = $derived(
    finishes.filter((f) => f.entry.type === 'book').reduce((s, f) => s + bookPages(f.entry), 0)
  );
  const months = $derived(monthly(finishes));
  const median = $derived(medianDays(finishes));
  const notable = $derived(highlights(finishes));
  const undated = $derived(undatedFinished(entries).length);
  const yearCreators = $derived(
    topCreators(
      finishes.map((f) => f.entry),
      3
    )
  );

  // ── The whole shelf ───────────────────────────────────────────
  const counts = $derived(
    TYPES.map(([t, label]) => ({ label, n: entries.filter((e) => e.type === t).length }))
  );
  const ratings = $derived(entries.map((e) => e.rating).filter((r): r is number => r != null));
  const average = $derived(
    ratings.length
      ? `${Number(ratingValue(ratings.reduce((s, r) => s + r, 0) / ratings.length, ratingView.scale)).toFixed(1)}/${ratingView.scale}`
      : ''
  );
  // Only the ratings given: ten rows, four of them empty, says less than six.
  const bins = $derived(ratingDistribution(ratings, ratingView.scale).filter((b) => b.count));
  const topGenres = $derived.by(() => {
    const counts: Record<string, number> = {};
    for (const e of entries) for (const g of e.genres || []) counts[g] = (counts[g] || 0) + 1;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  });
  const creators = $derived(topCreators(entries));
  const eras = $derived(decades(entries));
  const finished = $derived(entries.filter((e) => e.status === 'finished').length);
  const inProgress = $derived(entries.filter((e) => e.status === 'in-progress').length);
  const stopped = $derived(entries.filter((e) => e.status === 'abandoned').length);
  const reread = $derived(entries.filter((e) => (e.finishes?.length || 0) > 1).length);
  const hours = $derived(hoursWatched(entries));
</script>

{#snippet tile(value: number | string, label: string)}
  <div class="stat-tile">
    <div class="t-stat">{value}</div>
    <div class="t-field-label">{label}</div>
  </div>
{/snippet}

<ModalHead eyebrow="Overview" title="Statistics" />

<div class="stats-body">
  {#if !entries.length}
    <p class="t-hint">Nothing on the shelf yet. Add something and its numbers will gather here.</p>
  {:else}
    <section class="stats-section" aria-labelledby="stats-year">
      <div class="stats-head">
        <h3 class="t-section-label" id="stats-year">Year in review</h3>
        {#if years.length > 1}
          <div class="select-wrap select-wrap-sm">
            <Select
              class="select-sm"
              label="Year"
              bind:value={year}
              options={years.map((y) => ({ value: y, label: String(y) }))}
            />
          </div>
        {:else}
          <span class="t-data-small">{year}</span>
        {/if}
      </div>

      {#if finishes.length}
        <div class="hairline-grid stats-grid">
          {@render tile(byType.book, 'Books')}
          {#if pages}{@render tile(pages.toLocaleString(), 'Pages')}{/if}
          {#if byType.movie}{@render tile(byType.movie, 'Films')}{/if}
          {#if byType.tv}{@render tile(byType.tv, 'Shows')}{/if}
          {#if median != null}{@render tile(median, 'Days a book')}{/if}
        </div>

        <MonthChart {months} current={year === thisYear ? now.getMonth() : -1} />

        {#if notable.length}
          <div class="stats-highlights">
            {#each notable as h (h.label)}
              <button type="button" class="stats-highlight" onclick={() => ui.openEntry(h.entry.id)}>
                <span class="t-field-label">{h.label}</span>
                <span class="stats-highlight-title">{h.entry.title}</span>
                <span class="t-data-small">{h.detail}</span>
              </button>
            {/each}
          </div>
        {/if}

        {#if yearCreators.length}
          <p class="t-hint stats-year-creators">
            Kept coming back to {yearCreators.map(([name, n]) => `${name} (${n})`).join(', ')}.
          </p>
        {/if}
      {:else}
        <p class="t-hint stats-year-empty">
          Nothing finished in {year} yet. Mark something completed and it lands here, in the month it happened.
        </p>
      {/if}

      {#if undated}
        <p class="t-hint stats-undated">
          <em>Undated.</em>
          {plural(undated, 'entry was', 'entries were')} finished before BookShelf kept dates. Pick a finish day
          in each one's journal to count it in its year.
        </p>
      {/if}
    </section>

    <section class="stats-section" aria-labelledby="stats-all">
      <h3 class="t-section-label stats-head" id="stats-all">The whole shelf</h3>
      <div class="hairline-grid stats-grid">
        {@render tile(entries.length, 'Total')}
        {#each counts as { label, n } (label)}
          {#if n}{@render tile(n, label)}{/if}
        {/each}
      </div>

      {#if finished || inProgress}
        <div class="hairline-grid stats-grid">
          {#if inProgress}{@render tile(inProgress, 'In progress')}{/if}
          {#if finished}{@render tile(finished, 'Finished')}{/if}
          {#if stopped}{@render tile(stopped, 'Did not finish')}{/if}
          {#if reread}{@render tile(reread, 'Returned to')}{/if}
          {#if hours}{@render tile(hours.toLocaleString(), 'Hours watched')}{/if}
        </div>
      {/if}

      {#if ratings.length}
        <div class="stats-label">Ratings · average {average} across {ratings.length}</div>
        <BarList
          rows={bins.map((b) => [ratingView.scale === 10 ? `${b.rating}` : `${b.rating}★`, b.count])}
        />
      {/if}

      {#if creators.length}
        <div class="stats-label">Most on the shelf</div>
        <BarList rows={creators} />
      {/if}

      {#if eras.length > 1}
        <div class="stats-label">By decade</div>
        <BarList rows={eras} />
      {/if}

      {#if topGenres.length}
        <div class="stats-label">Top genres</div>
        <div class="tag-row">
          {#each topGenres as [g, n] (g)}
            <span class="tag">{g} · {n}</span>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</div>

<style>
  .stats-body {
    padding: 1.25rem 2rem 1.5rem;
  }
  @media (max-width: 639px) {
    .stats-body {
      padding: 1rem 1.25rem 1.25rem;
    }
  }
  .stats-section + .stats-section {
    margin-top: var(--space-6);
    padding-top: var(--space-5);
    border-top: 1px solid var(--border-soft);
  }
  .stats-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }
  /* A hairline grid that wraps: a short last row stretches instead of leaving a hole. */
  /* Two tiles a row on a phone (an odd last one spans both), more on wider screens. */
  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin-bottom: var(--space-4);
  }
  .stats-grid > :global(.stat-tile:last-child:nth-child(odd)) {
    grid-column: span 2;
  }
  @media (min-width: 640px) {
    .stats-grid {
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    }
    .stats-grid > :global(.stat-tile:last-child:nth-child(odd)) {
      grid-column: auto;
    }
  }
  .stats-label {
    font-family: var(--font-mono);
    font-size: 0.625rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--text-dim);
    margin: var(--space-5) 0 var(--space-3);
  }

  /* Highlights */
  .stats-highlights {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 1px;
    margin-top: var(--space-5);
    background: var(--border-faint);
    border: 1px solid var(--border-faint);
    border-radius: var(--corner-lg);
    overflow: hidden;
  }
  .stats-highlight {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-3) var(--space-4);
    background: var(--panel-bg-faint);
    border: none;
    text-align: left;
    cursor: pointer;
    color: inherit;
    font: inherit;
    transition: background var(--dur-hover);
  }
  .stats-highlight:hover {
    background: var(--hover-bg);
  }
  .stats-highlight-title {
    font-family: var(--font-serif);
    font-size: 1rem;
    line-height: 1.25;
    color: var(--text-heading);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .stats-year-creators,
  .stats-year-empty,
  .stats-undated {
    margin-top: var(--space-4);
  }
  .stats-undated em {
    color: var(--accent-amber);
  }
</style>
