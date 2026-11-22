<script lang="ts">
  // A labelled bar list (style.md §8.15): the longest bar is the largest value.
  let { rows }: { rows: [string, number][] } = $props();
  const max = $derived(Math.max(1, ...rows.map(([, n]) => n)));
</script>

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

<style>
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
    transform-origin: left;
    animation: stats-grow var(--dur-settle) var(--ease-settle) both;
  }
  @keyframes stats-grow {
    from {
      transform: scaleX(0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .stats-bar-fill {
      animation: none;
    }
  }
  .stats-bar-val {
    text-align: right;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
  }
</style>
