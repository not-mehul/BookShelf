<script lang="ts">
  import { untrack } from 'svelte';
  import { shelf } from '../state/shelf.svelte';
  import { ui } from '../state/ui.svelte';
  import { plural } from '../util/labels';
  import { getSetting, setSetting } from '../util/settings';
  import { ratingDistribution, ratingValue } from '../util/stars';
  import { ratingView } from '../state/rating-scale.svelte';
  import {
    bookPages,
    decades,
    finishesIn,
    goalPace,
    highlights,
    journalYears,
    medianDays,
    monthly,
    paceSentence,
    topCreators,
    undatedFinished,
    type FinishedType
  } from '../util/year-stats';
  import ModalHead from './ModalHead.svelte';

  // A read-only summary of the catalog: the year in review first (what was
  // finished, against a goal), then the shelf as a whole.

  const TYPES = [
    ['book', 'Books'],
    ['movie', 'Movies'],
    ['tv', 'TV'],
    ['quote', 'Quotes']
  ] as const;
  const SERIES: { type: FinishedType; label: string; token: string }[] = [
    { type: 'book', label: 'Books', token: '--series-1' },
    { type: 'movie', label: 'Films', token: '--series-2' },
    { type: 'tv', label: 'Shows', token: '--series-3' }
  ];
  const now = new Date();
  const thisYear = now.getFullYear();
  const MONTHS = Array.from({ length: 12 }, (_, m) =>
    new Date(2000, m, 1).toLocaleDateString(undefined, { month: 'short' })
  );

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
  const maxMonth = $derived(Math.max(1, ...months.map((m) => m.book + m.movie + m.tv)));
  const median = $derived(medianDays(finishes));
  const notable = $derived(highlights(finishes));
  const undated = $derived(undatedFinished(entries).length);
  const yearCreators = $derived(
    topCreators(
      finishes.map((f) => f.entry),
      3
    )
  );
  const monthsLabel = $derived(
    'Finished per month: ' + months.map((m, i) => `${MONTHS[i]} ${m.book + m.movie + m.tv}`).join(', ')
  );

  // The year's book goal, kept per year so last year's stays as it was.
  let goal = $state(0);
  const goalKey = (y: number) => `reading_goal_${y}`;
  $effect(() => {
    const y = year;
    untrack(() => {
      void getSetting(goalKey(y), '0').then((v) => {
        if (year === y) goal = Math.max(0, parseInt(v, 10) || 0);
      });
    });
  });
  function setGoal(next: number) {
    goal = Math.max(0, Math.min(999, next));
    void setSetting(goalKey(year), goal);
  }
  const pace = $derived(goalPace(byType.book, goal, year, now));
  const goalPct = $derived(goal ? Math.min(100, Math.round((byType.book / goal) * 100)) : 0);

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
  const bins = $derived(ratingDistribution(ratings, ratingView.scale));
  const maxBin = $derived(Math.max(...bins.map((b) => b.count), 1));
  const topGenres = $derived.by(() => {
    const counts: Record<string, number> = {};
    for (const e of entries) for (const g of e.genres || []) counts[g] = (counts[g] || 0) + 1;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  });
  const creators = $derived(topCreators(entries));
  const maxCreator = $derived(Math.max(1, ...creators.map(([, n]) => n)));
  const eras = $derived(decades(entries));
  const maxEra = $derived(Math.max(1, ...eras.map(([, n]) => n)));
  const finished = $derived(entries.filter((e) => e.status === 'finished').length);
  const inProgress = $derived(entries.filter((e) => e.status === 'in-progress').length);
  const stopped = $derived(entries.filter((e) => e.status === 'abandoned').length);
  const reread = $derived(entries.filter((e) => (e.finishes?.length || 0) > 1).length);
</script>

{#snippet tile(value: number | string, label: string)}
  <div class="stat-tile">
    <div class="t-stat">{value}</div>
    <div class="t-field-label">{label}</div>
  </div>
{/snippet}

{#snippet bars(rows: [string, number][], max: number)}
  <div class="stats-bars">
    {#each rows as [key, n] (key)}
      <div class="stats-bar-row">
        <span class="stats-bar-key">{key}</span>
        <div class="stats-bar-track">
          <div class="stats-bar-fill" style:width="{Math.round((n / max) * 100)}%"></div>
        </div>
        <span class="stats-bar-val">{n}</span>
      </div>
    {/each}
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
            <select class="select select-sm" aria-label="Year" bind:value={year}>
              {#each years as y (y)}
                <option value={y}>{y}</option>
              {/each}
            </select>
          </div>
        {:else}
          <span class="t-data-small">{year}</span>
        {/if}
      </div>

      <div class="stats-goal">
        <div class="stats-goal-row">
          <span class="t-field-label">Reading goal</span>
          {#if goal}
            <div class="stats-goal-stepper">
              <button
                type="button"
                class="chip"
                aria-label="Lower the goal by one"
                disabled={goal <= 1}
                onclick={() => setGoal(goal - 1)}>−</button
              >
              <button
                type="button"
                class="chip"
                aria-label="Raise the goal by one"
                onclick={() => setGoal(goal + 1)}>+</button
              >
            </div>
          {/if}
        </div>
        {#if goal}
          <p class="stats-goal-figure">
            <span class="t-stat">{byType.book}</span>
            <span class="stats-goal-of">of {plural(goal, 'book')}</span>
          </p>
          <div
            class="meter"
            role="progressbar"
            aria-label="Books towards the goal"
            aria-valuemin={0}
            aria-valuemax={goal}
            aria-valuenow={Math.min(byType.book, goal)}
          >
            <div class="meter-fill" class:is-complete={goalPct === 100} style:width="{goalPct}%"></div>
          </div>
          <p class="t-hint stats-goal-pace">{paceSentence(pace, now)}</p>
        {:else}
          <p class="t-hint">A number of books to read in {year}, measured as you finish them.</p>
          <button type="button" class="btn btn-muted btn-sm stats-goal-set" onclick={() => setGoal(12)}
            >Set a goal</button
          >
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

        <div class="stats-months" role="img" aria-label={monthsLabel}>
          {#each months as m, i (i)}
            {@const sum = m.book + m.movie + m.tv}
            <div class="stats-month" class:is-now={year === thisYear && i === now.getMonth()}>
              <span class="stats-month-n">{sum || ''}</span>
              <div class="stats-month-col">
                {#each SERIES as s (s.type)}
                  {#if m[s.type]}
                    <div
                      class="stats-month-seg"
                      style:height="{(m[s.type] / maxMonth) * 100}%"
                      style:background="var({s.token})"
                    ></div>
                  {/if}
                {/each}
              </div>
              <span class="stats-month-key">{MONTHS[i]?.slice(0, 1)}</span>
            </div>
          {/each}
        </div>
        <div class="stats-legend" aria-hidden="true">
          {#each SERIES as s (s.type)}
            {#if byType[s.type]}
              <span class="stats-legend-item"
                ><span class="stats-swatch" style:background="var({s.token})"></span>{s.label}</span
              >
            {/if}
          {/each}
        </div>

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
          {#if finished}{@render tile(finished, 'Completed')}{/if}
          {#if stopped}{@render tile(stopped, 'Did not finish')}{/if}
          {#if reread}{@render tile(reread, 'Returned to')}{/if}
        </div>
      {/if}

      {#if ratings.length}
        <div class="stats-label">Ratings · average {average} across {ratings.length}</div>
        {@render bars(
          bins.map((b) => [ratingView.scale === 10 ? `${b.rating}` : `${b.rating}★`, b.count]),
          maxBin
        )}
      {/if}

      {#if creators.length}
        <div class="stats-label">Most on the shelf</div>
        {@render bars(creators, maxCreator)}
      {/if}

      {#if eras.length > 1}
        <div class="stats-label">By decade</div>
        {@render bars(eras, maxEra)}
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
  @media (max-width: 640px) {
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
  .stats-grid {
    display: flex;
    flex-wrap: wrap;
    margin-bottom: var(--space-4);
  }
  .stats-grid > :global(.stat-tile) {
    flex: 1 1 96px;
  }
  .stats-label {
    font-family: var(--font-mono);
    font-size: 0.625rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--text-dim);
    margin: var(--space-5) 0 var(--space-3);
  }

  /* Goal */
  .stats-goal {
    padding: var(--space-4);
    margin-bottom: var(--space-4);
    background: var(--panel-bg-faint);
    border: 1px solid var(--border-soft);
    border-radius: var(--corner-lg);
  }
  .stats-goal-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 32px;
  }
  .stats-goal-stepper {
    display: flex;
    gap: var(--space-2);
  }
  .stats-goal-stepper .chip {
    min-width: 44px;
    justify-content: center;
    font-family: var(--font-mono);
  }
  .stats-goal-figure {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    margin: var(--space-2) 0 var(--space-3);
  }
  .stats-goal-of {
    font-family: var(--font-serif);
    font-style: italic;
    color: var(--text-dim);
  }
  .stats-goal .meter-fill {
    transition: width var(--dur-settle) var(--ease-settle);
  }
  .stats-goal-pace {
    margin-top: var(--space-3);
  }
  .stats-goal-set {
    margin-top: var(--space-3);
  }

  /* Month chart */
  .stats-months {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: var(--space-1);
    align-items: end;
    margin-top: var(--space-2);
  }
  .stats-month {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
  }
  .stats-month-n {
    font-family: var(--font-mono);
    font-size: 0.625rem;
    font-variant-numeric: tabular-nums;
    color: var(--text-dim);
    min-height: 1em;
  }
  .stats-month-col {
    width: 100%;
    max-width: 28px;
    height: 96px;
    display: flex;
    flex-direction: column-reverse;
    background: var(--chart-track);
    border-radius: var(--corner-xs);
    overflow: hidden;
  }
  /* Bars rise to their value once, when the chart appears (style.md §8.15). */
  .stats-month-seg {
    width: 100%;
    transform-origin: bottom;
    animation: stats-rise var(--dur-settle) var(--ease-settle) both;
  }
  @keyframes stats-rise {
    from {
      transform: scaleY(0);
    }
  }
  .stats-bar-fill {
    transform-origin: left;
    animation: stats-grow var(--dur-settle) var(--ease-settle) both;
  }
  @keyframes stats-grow {
    from {
      transform: scaleX(0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .stats-month-seg,
    .stats-bar-fill {
      animation: none;
    }
  }
  .stats-month-key {
    font-family: var(--font-mono);
    font-size: 0.625rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .stats-month.is-now .stats-month-col {
    box-shadow: inset 0 0 0 1px rgba(var(--accent-amber-rgb), 0.4);
  }
  .stats-month.is-now .stats-month-key {
    color: var(--accent-amber);
  }
  .stats-legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    margin-top: var(--space-3);
    font-family: var(--font-mono);
    font-size: 0.625rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  .stats-legend-item {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }
  .stats-swatch {
    width: 10px;
    height: 10px;
    border-radius: var(--corner-xs);
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

  /* Bar list (style.md §8.15) */
  .stats-bars {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .stats-bar-row {
    display: grid;
    grid-template-columns: minmax(3rem, 9rem) 1fr 2rem;
    align-items: center;
    gap: var(--space-3);
  }
  .stats-bar-key {
    font-size: 0.8125rem;
    color: var(--text-body);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .stats-bar-track {
    height: 4px;
    border-radius: var(--corner-full);
    background: var(--chart-track);
    overflow: hidden;
  }
  .stats-bar-fill {
    height: 100%;
    background: var(--series-1);
  }
  .stats-bar-val {
    text-align: right;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
  }
</style>
