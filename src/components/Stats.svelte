<script lang="ts">
  import { shelf } from '../state/shelf.svelte';
  import { ratingDistribution } from '../util/stars';
  import ModalHead from './ModalHead.svelte';

  // A read-only summary of the catalog.
  const TYPES = [
    ['book', 'Books'],
    ['movie', 'Movies'],
    ['tv', 'TV'],
    ['quote', 'Quotes']
  ] as const;

  const entries = $derived(shelf.entries);
  const counts = $derived(
    TYPES.map(([t, label]) => ({ label, n: entries.filter((e) => e.type === t).length }))
  );
  const ratings = $derived(entries.map((e) => e.rating).filter((r): r is number => r != null));
  const average = $derived(
    ratings.length ? (ratings.reduce((s, r) => s + r, 0) / ratings.length).toFixed(1) : ''
  );
  const bins = $derived(ratingDistribution(ratings));
  const maxBin = $derived(Math.max(...bins.map((b) => b.count), 1));
  const topGenres = $derived.by(() => {
    const counts: Record<string, number> = {};
    for (const e of entries) for (const g of e.genres || []) counts[g] = (counts[g] || 0) + 1;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  });
  const finished = $derived(entries.filter((e) => e.status === 'finished').length);
  const inProgress = $derived(entries.filter((e) => e.status === 'in-progress').length);
</script>

{#snippet tile(value: number, label: string)}
  <div class="stat-tile">
    <div class="stat-tile-value">{value}</div>
    <div class="stat-tile-label">{label}</div>
  </div>
{/snippet}

<ModalHead eyebrow="Overview" title="Statistics" />

<div class="stats-body">
  {#if !entries.length}
    <p class="field-hint">No entries yet — add something to see statistics.</p>
  {:else}
    <div class="stats-tiles">
      {@render tile(entries.length, 'Total')}
      {#each counts as { label, n } (label)}
        {#if n}{@render tile(n, label)}{/if}
      {/each}
    </div>

    {#if ratings.length}
      <div class="stats-section-label">Ratings — avg {average}★ across {ratings.length}</div>
      <div class="stats-bars">
        {#each bins as { rating, count } (rating)}
          <div class="stats-bar-row">
            <span class="stats-bar-key">{rating}★</span>
            <div class="stats-bar-track">
              <div class="stats-bar-fill" style:width="{Math.round((count / maxBin) * 100)}%"></div>
            </div>
            <span class="stats-bar-val">{count}</span>
          </div>
        {/each}
      </div>
    {/if}

    {#if topGenres.length}
      <div class="stats-section-label">Top genres</div>
      <div class="tag-row">
        {#each topGenres as [g, n] (g)}
          <span class="tag">{g} · {n}</span>
        {/each}
      </div>
    {/if}

    {#if finished || inProgress}
      <div class="stats-section-label">Activity</div>
      <div class="stats-tiles">
        {#if inProgress}{@render tile(inProgress, 'In progress')}{/if}
        {#if finished}{@render tile(finished, 'Finished')}{/if}
      </div>
    {/if}
  {/if}
</div>
