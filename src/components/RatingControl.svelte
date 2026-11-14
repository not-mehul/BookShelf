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
   *   • Sliding: press and slide along the stars and the fill follows the finger
   *     in half steps, with a magnified copy of the stars and the value above
   *     them; lifting the finger sets it. A vertical swipe still scrolls.
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
  let lens = $state<HTMLDivElement>();

  // A press becomes a slide once it moves sideways past a small threshold; a
  // press that doesn't is an ordinary tap (handled by onclick).
  const SLIDE_AFTER = 6;
  let press: { id: number; x: number } | null = null;
  let sliding = $state(false);
  /** When a press last lifted. Taps and slides are handled there, so the click
   *  a browser may send after it is ignored; a click with no press before it
   *  (a screen reader's activation) still sets the rating. */
  let liftedAt = 0;

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

  /** The magnified stars sit above the row (below it near the top of the screen), clear of the finger. */
  function placeLens() {
    if (!lens) return;
    const row = slider.getBoundingClientRect();
    const { width, height } = lens.getBoundingClientRect();
    const margin = 8;
    const left = Math.min(
      Math.max(margin, row.left + row.width / 2 - width / 2),
      window.innerWidth - width - margin
    );
    const above = row.top - height - 12;
    lens.style.left = `${left}px`;
    lens.style.top = `${above >= margin ? above : row.bottom + 12}px`;
  }

  function onpointerdown(ev: PointerEvent) {
    if (ev.button !== 0) return;
    press = { id: ev.pointerId, x: ev.clientX };
  }

  function onpointermove(ev: PointerEvent) {
    if (!press || ev.pointerId !== press.id) {
      if (ev.pointerType === 'mouse') preview = pointsAt(ev);
      return;
    }
    if (!sliding) {
      if (Math.abs(ev.clientX - press.x) < SLIDE_AFTER) return;
      sliding = true;
      slider.setPointerCapture(ev.pointerId);
      lens?.showPopover?.();
    }
    preview = pointsAt(ev);
    placeLens();
  }

  /** Tapping the current value again clears it. */
  function tap(ev: MouseEvent) {
    const v = pointsAt(ev);
    commit(v === points ? null : v);
  }

  function endPress(ev: PointerEvent, lifted: boolean) {
    if (!press || ev.pointerId !== press.id) return;
    press = null;
    if (lifted) liftedAt = performance.now();
    if (!sliding) {
      if (lifted) tap(ev);
      return;
    }
    sliding = false;
    lens?.hidePopover?.();
    const next = preview;
    preview = null;
    if (lifted && next != null) commit(next);
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
    class:is-sliding={sliding}
    onclick={(ev) => {
      if (performance.now() - liftedAt < 600) return;
      tap(ev);
    }}
    {onpointerdown}
    {onpointermove}
    onpointerup={(ev) => endPress(ev, true)}
    onpointercancel={(ev) => endPress(ev, false)}
    onpointerleave={() => {
      if (!sliding) preview = null;
    }}
    {onkeydown}
  >
    {#each stars as i (i)}
      <span class="rating-star" aria-hidden="true">
        <Icon name="star" />
        <span class="rating-star-fill" style:width="{fill(i) * 100}%"><Icon name="star" /></span>
      </span>
    {/each}
  </div>
  <!-- The magnified view while sliding: the same stars, larger, and the value. -->
  <div bind:this={lens} class="rating-lens" popover="manual" aria-hidden="true">
    <span class="rating-lens-stars" class:rating-stars-ten={scale === 10}>
      {#each stars as i (i)}
        <span class="rating-star">
          <Icon name="star" />
          <span class="rating-star-fill" style:width="{fill(i) * 100}%"><Icon name="star" /></span>
        </span>
      {/each}
    </span>
    <span class="rating-lens-value">{shown == null ? '—' : `${shown} / ${scale}`}</span>
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
