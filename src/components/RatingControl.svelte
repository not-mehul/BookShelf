<script lang="ts">
  import { play } from 'dusk-dawn';
  import { normalizeRating, ratingLabel } from '../util/stars';
  import { ratingView } from '../state/rating-scale.svelte';
  import Icon from './Icon.svelte';

  /**
   * A rating (stored 0.25–5, or null = unrated), exposed as a slider, on the
   * scale chosen in Settings: five stars in half steps, or ten in half points.
   *   • Pointer: the left half of a star sets x.5, the right half x; tapping the
   *     current value again clears it. Mouse hover previews.
   *   • Keyboard: ←/↓ and →/↑ step by ½, digits jump, Home/End = ½/top,
   *     Delete/Backspace/0 clear.
   */
  interface Props {
    value: number | null | undefined;
    onchange: (value: number | null) => void;
    label?: string;
    compact?: boolean;
  }

  let { value: raw, onchange, label = 'Rating', compact = false }: Props = $props();
  const scale = $derived(ratingView.scale);
  /** Points on the shown scale ↔ the stored rating. */
  const toPoints = (r: number) => Math.round(r * (scale / 5) * 2) / 2;
  const fromPoints = (p: number) => normalizeRating(p * (5 / scale));
  const value = $derived(normalizeRating(raw));
  const points = $derived(value == null ? null : toPoints(value));
  let preview = $state<number | null>(null);
  let slider: HTMLDivElement;

  const shown = $derived(preview ?? points);
  const fill = (i: number) => (shown == null ? 0 : Math.min(1, Math.max(0, shown - i)));
  const stars = $derived(Array.from({ length: scale }, (_, i) => i));

  function commit(nextPoints: number | null) {
    const n = nextPoints == null ? null : fromPoints(nextPoints);
    if (n === value) return;
    onchange(n);
    // The stars light up one after another, up to the new rating.
    if (n == null) return;
    const els = slider.querySelectorAll('.rating-star');
    for (let i = 0; i < Math.ceil(toPoints(n)); i++) setTimeout(() => play(els[i], 'pop'), i * 30);
  }

  /** Points under the pointer, from its x position across the stars. */
  function pointsAt(ev: MouseEvent): number {
    const rect = slider.getBoundingClientRect();
    const x = Math.min(Math.max(ev.clientX - rect.left, 0), rect.width - 0.01);
    return Math.floor((x / rect.width) * scale * 2) / 2 + 0.5;
  }

  function onkeydown(ev: KeyboardEvent) {
    const v = points ?? 0;
    let next: number | null;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') next = Math.min(scale, v + 0.5);
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') next = v - 0.5 <= 0 ? null : v - 0.5;
    else if (ev.key === 'Home') next = 0.5;
    else if (ev.key === 'End') next = scale;
    else if (ev.key === 'Delete' || ev.key === 'Backspace' || ev.key === '0') next = null;
    else if (/^[1-9]$/.test(ev.key) && Number(ev.key) <= scale) next = Number(ev.key);
    else return;
    ev.preventDefault();
    commit(next);
  }
</script>

<div class="rating-row" class:rating-row-compact={compact}>
  <div
    bind:this={slider}
    class="rating-stars"
    class:rating-stars-ten={scale === 10}
    role="slider"
    tabindex="0"
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={scale}
    aria-valuenow={points ?? 0}
    aria-valuetext={points == null
      ? 'Unrated'
      : scale === 10
        ? `${points} out of 10`
        : `${points} of 5 stars`}
    onclick={(ev) => {
      const v = pointsAt(ev);
      commit(v === points ? null : v);
    }}
    onpointermove={(ev) => {
      if (ev.pointerType === 'mouse') preview = pointsAt(ev);
    }}
    onpointerleave={() => (preview = null)}
    {onkeydown}
  >
    {#each stars as i (i)}
      <span class="rating-star" aria-hidden="true">
        <Icon name="star" />
        <span class="rating-star-fill" style:width="{fill(i) * 100}%"><Icon name="star" /></span>
      </span>
    {/each}
  </div>
  {#if scale === 10 && points != null}
    <span class="rating-number" aria-hidden="true">{ratingLabel(value, scale)}</span>
  {/if}
  <button
    type="button"
    class="rating-clear"
    aria-label="Clear {label.toLowerCase()}"
    hidden={value == null}
    onclick={() => commit(null)}
  >
    Clear
  </button>
</div>
