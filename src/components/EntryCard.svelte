<script lang="ts">
  import { thumbnailUrl } from '../db/database';
  import { ui } from '../state/ui.svelte';
  import { TYPE_ICON, TYPE_LABEL } from '../util/labels';
  import { starString } from '../util/stars';
  import { statusLabel } from '../util/status';
  import type { CatalogEntry } from '../types';
  import CoverImage from './CoverImage.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    entry: CatalogEntry;
    /** Selection mode is on: the card is a checkbox. */
    selecting: boolean;
    selected: boolean;
    ontoggle: (id: string) => void;
    /** Long-press enters selection mode with this card selected. */
    onlongpress: (id: string) => void;
  }

  let { entry, selecting, selected, ontoggle, onlongpress }: Props = $props();

  const LONG_PRESS_MS = 450;
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let pressAt: { x: number; y: number } | null = null;
  let longPressed = false;

  function cancelPress() {
    clearTimeout(pressTimer);
    pressAt = null;
  }

  const src = $derived(entry.type === 'quote' ? null : thumbnailUrl(entry) || entry.thumbnailUrl);
  const attribution = $derived([entry.creators?.[0], entry.source].filter(Boolean).join(', '));
</script>

<button
  type="button"
  class="entry-card"
  class:quote-card={entry.type === 'quote'}
  class:is-selectable={selecting}
  class:is-selected={selecting && selected}
  role={selecting ? 'checkbox' : undefined}
  aria-checked={selecting ? selected : undefined}
  onpointerdown={(ev) => {
    if (selecting) return;
    longPressed = false;
    pressAt = { x: ev.clientX, y: ev.clientY };
    pressTimer = setTimeout(() => {
      longPressed = true;
      onlongpress(entry.id);
    }, LONG_PRESS_MS);
  }}
  onpointermove={(ev) => {
    if (pressAt && Math.hypot(ev.clientX - pressAt.x, ev.clientY - pressAt.y) > 10) cancelPress();
  }}
  onpointerup={cancelPress}
  onpointercancel={cancelPress}
  oncontextmenu={(ev) => !selecting && ev.preventDefault()}
  onclick={() => {
    if (longPressed) {
      longPressed = false; // the long-press already acted
      return;
    }
    if (selecting) ontoggle(entry.id);
    else ui.openEntry(entry.id);
  }}
>
  {#if entry.type === 'quote'}
    <div class="quote-card-body">
      <div class="quote-card-mark" aria-hidden="true">“</div>
      <div class="quote-card-text">{entry.quoteText || entry.title}</div>
      {#if attribution}
        <div class="quote-card-author">— {attribution}</div>
      {/if}
      {#if entry.rating != null}
        <div class="entry-rating-line">{starString(entry.rating)}</div>
      {/if}
    </div>
  {:else}
    <div class="entry-thumb">
      <CoverImage {src}>
        {#snippet fallback()}
          <div class="entry-thumb-placeholder">
            <span class="entry-thumb-icon"><Icon name={TYPE_ICON[entry.type]} /></span>
            <span>{entry.title}</span>
          </div>
        {/snippet}
      </CoverImage>
    </div>
    <div class="entry-meta">
      <div class="entry-type-label">{TYPE_LABEL[entry.type]}</div>
      <div class="entry-title">{entry.title}</div>
      {#if entry.creators?.length}
        <div class="entry-creator">{entry.creators.slice(0, 2).join(', ')}</div>
      {/if}
      {#if entry.series?.name}
        <div class="entry-series">
          {entry.series.name}{entry.series.position != null ? ` #${entry.series.position}` : ''}
        </div>
      {/if}
      {#if entry.rating != null}
        <div class="entry-rating-line">{starString(entry.rating)}</div>
      {:else}
        <div class="entry-rating-line unrated">unrated</div>
      {/if}
      {#if entry.status}
        <span class="entry-status-chip">{statusLabel(entry.status) || entry.status}</span>
      {/if}
    </div>
  {/if}
</button>

<style>
  .entry-thumb-icon {
    color: var(--text-faint);
    opacity: 0.45;
  }
</style>
