<script lang="ts">
  // A rating at rest, on a card or a row: the rating control's stars, small,
  // filled to the nearest half; out of 10 it is the number ("7.5/10").
  import { ratingView } from '../state/rating-scale.svelte';
  import { normalizeRating, ratingLabel } from '../util/stars';
  import Icon from './Icon.svelte';

  let { rating }: { rating: number | null | undefined } = $props();

  const value = $derived(normalizeRating(rating));
  // The nearest half star, for drawing.
  const half = $derived(value == null ? 0 : Math.max(0.5, Math.round(value * 2) / 2));
  const fill = (i: number) => Math.max(0, Math.min(1, half - i));
</script>

{#if value != null}
  {#if ratingView.scale === 10}
    <span class="stars-number">{ratingLabel(value, 10)}</span>
  {:else}
    <span class="stars" role="img" aria-label="{ratingLabel(value, 5).replace('/5', '')} of 5 stars">
      {#each [0, 1, 2, 3, 4] as i (i)}
        <span class="star" aria-hidden="true">
          <Icon name="star" />
          <span class="star-fill" style:width="{fill(i) * 100}%"><Icon name="star" /></span>
        </span>
      {/each}
    </span>
  {/if}
{/if}

<style>
  .stars {
    display: inline-flex;
    gap: 1px;
    vertical-align: middle;
  }
  .star {
    position: relative;
    width: 14px;
    height: 14px;
    color: var(--text-faint);
  }
  .star :global(svg) {
    display: block;
    width: 14px;
    height: 14px;
    stroke-width: 1.75;
  }
  .star-fill {
    position: absolute;
    inset: 0 auto 0 0;
    overflow: hidden;
    color: var(--accent-amber);
  }
  .star-fill :global(svg) {
    fill: currentColor;
  }
  .stars-number {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--accent-amber);
    font-variant-numeric: tabular-nums;
  }
</style>
