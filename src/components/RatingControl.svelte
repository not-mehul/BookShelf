<script lang="ts">
  import { normalizeRating } from '../util/stars';
  import Icon from './Icon.svelte';

  /**
   * Half-star rating (0.5–5, or null = unrated), exposed as a slider.
   *   • Pointer: the left half of a star sets x.5, the right half x; tapping the
   *     current value again clears it. Mouse hover previews.
   *   • Keyboard: ←/↓ and →/↑ step by ½, 1–5 jump, Home/End = ½/5,
   *     Delete/Backspace/0 clear.
   */
  interface Props {
    value: number | null | undefined;
    onchange: (value: number | null) => void;
    label?: string;
    compact?: boolean;
  }

  let { value: raw, onchange, label = 'Rating', compact = false }: Props = $props();
  const value = $derived(normalizeRating(raw));
  let preview = $state<number | null>(null);
  let slider: HTMLDivElement;

  const shown = $derived(preview ?? value);
  const fill = (i: number) => (shown == null ? 0 : Math.min(1, Math.max(0, shown - i)));

  function commit(next: number | null) {
    const n = normalizeRating(next);
    if (n !== value) onchange(n);
  }

  /** Rating under the pointer, from its x position across the five stars. */
  function valueAt(ev: MouseEvent): number {
    const rect = slider.getBoundingClientRect();
    const x = Math.min(Math.max(ev.clientX - rect.left, 0), rect.width - 0.01);
    return Math.floor((x / rect.width) * 10) / 2 + 0.5;
  }

  function onkeydown(ev: KeyboardEvent) {
    const v = value ?? 0;
    let next: number | null;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') next = Math.min(5, v + 0.5);
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') next = v - 0.5 <= 0 ? null : v - 0.5;
    else if (ev.key === 'Home') next = 0.5;
    else if (ev.key === 'End') next = 5;
    else if (ev.key === 'Delete' || ev.key === 'Backspace' || ev.key === '0') next = null;
    else if (/^[1-5]$/.test(ev.key)) next = Number(ev.key);
    else return;
    ev.preventDefault();
    commit(next);
  }
</script>

<div class="rating-row" class:rating-row-compact={compact}>
  <div
    bind:this={slider}
    class="rating-stars"
    role="slider"
    tabindex="0"
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={5}
    aria-valuenow={value ?? 0}
    aria-valuetext={value == null ? 'Unrated' : `${value} of 5 stars`}
    onclick={(ev) => {
      const v = valueAt(ev);
      commit(v === value ? null : v);
    }}
    onpointermove={(ev) => {
      if (ev.pointerType === 'mouse') preview = valueAt(ev);
    }}
    onpointerleave={() => (preview = null)}
    {onkeydown}
  >
    {#each [0, 1, 2, 3, 4] as i (i)}
      <span class="rating-star" aria-hidden="true">
        <Icon name="star" />
        <span class="rating-star-fill" style:width="{fill(i) * 100}%"><Icon name="star" /></span>
      </span>
    {/each}
  </div>
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
