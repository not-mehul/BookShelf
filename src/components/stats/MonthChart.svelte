<script lang="ts" module>
  import type { FinishedType } from '../../util/year-stats';

  export const SERIES: { type: FinishedType; label: string; token: string }[] = [
    { type: 'book', label: 'Books', token: '--series-1' },
    { type: 'movie', label: 'Films', token: '--series-2' },
    { type: 'tv', label: 'Shows', token: '--series-3' }
  ];
  const MONTHS = Array.from({ length: 12 }, (_, m) =>
    new Date(2000, m, 1).toLocaleDateString(undefined, { month: 'short' })
  );
</script>

<script lang="ts">
  type Month = Record<FinishedType, number>;

  // Finishes per month, stacked by type, with the current month outlined.
  let { months, current = -1 }: { months: Month[]; current?: number } = $props();

  const total = (m: Month) => m.book + m.movie + m.tv;
  const max = $derived(Math.max(1, ...months.map(total)));
  const shown = $derived(SERIES.filter((s) => months.some((m) => m[s.type])));
  const label = $derived(
    'Finished per month: ' + months.map((m, i) => `${MONTHS[i]} ${total(m)}`).join(', ')
  );
</script>

<div class="stats-months" role="img" aria-label={label}>
  {#each months as m, i (i)}
    <div class="stats-month" class:is-now={i === current}>
      <span class="stats-month-n">{total(m) || ''}</span>
      <div class="stats-month-col">
        {#each SERIES as s (s.type)}
          {#if m[s.type]}
            <div
              class="stats-month-seg"
              style:height="{(m[s.type] / max) * 100}%"
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
  {#each shown as s (s.type)}
    <span class="stats-legend-item"
      ><span class="stats-swatch" style:background="var({s.token})"></span>{s.label}</span
    >
  {/each}
</div>

<style>
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
  @media (prefers-reduced-motion: reduce) {
    .stats-month-seg {
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
</style>
