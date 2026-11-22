<script lang="ts">
  import { thumbnailUrl } from '../db/database';
  import { ui } from '../state/ui.svelte';
  import { TYPE_LABEL } from '../util/labels';
  import { statusLabel } from '../util/status';
  import type { CatalogEntry } from '../types';
  import CoverImage from './CoverImage.svelte';
  import PlaceholderCover from './PlaceholderCover.svelte';
  import Stars from './Stars.svelte';

  interface Props {
    entry: CatalogEntry;
    /** A cover over its words (grid), or a row with a small cover (list). */
    layout?: 'grid' | 'list';
    /** Inside a tab of one type, "Book" on every card says nothing. */
    hideType?: boolean;
    /** Selection mode is on: the card is a checkbox. */
    selecting: boolean;
    selected: boolean;
    ontoggle: (id: string) => void;
    /** Long-press enters selection mode with this card selected. */
    onlongpress: (id: string) => void;
  }

  let {
    entry,
    layout = 'grid',
    hideType = false,
    selecting,
    selected,
    ontoggle,
    onlongpress
  }: Props = $props();

  const LONG_PRESS_MS = 450;
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let pressAt: { x: number; y: number } | null = null;
  let longPressed = false;

  function cancelPress() {
    clearTimeout(pressTimer);
    pressAt = null;
  }

  const src = $derived(entry.type === 'quote' ? null : thumbnailUrl(entry) || entry.thumbnailUrl);
  // A thin meter for a book or a show under way, and a count for things returned to.
  const progressPct = $derived(
    (entry.type === 'tv' || entry.type === 'book') && entry.status === 'in-progress' && entry.progress?.total
      ? Math.min(100, Math.round((entry.progress.current / entry.progress.total) * 100))
      : null
  );
  const times = $derived(entry.finishes?.length ?? 0);
  const attribution = $derived([entry.creators?.[0], entry.source].filter(Boolean).join(', '));
</script>

<button
  type="button"
  class="entry-card dd-pressable"
  class:dd-lift={layout === 'grid'}
  class:is-row={layout === 'list'}
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
        <div class="entry-rating-line"><Stars rating={entry.rating} /></div>
      {/if}
    </div>
  {:else}
    <div class="entry-thumb">
      <CoverImage {src}>
        {#snippet fallback()}
          <PlaceholderCover {entry} compact={layout === 'list'} />
        {/snippet}
      </CoverImage>
    </div>
    <div class="entry-meta">
      {#if !hideType}<div class="entry-type-label">{TYPE_LABEL[entry.type]}</div>{/if}
      <div class="entry-title">{entry.title}</div>
      {#if entry.creators?.length}
        <div class="entry-creator">{entry.creators.slice(0, 2).join(', ')}</div>
      {/if}
      {#if entry.series?.name}
        <div class="entry-series">
          {entry.series.name}{entry.series.position != null ? ` #${entry.series.position}` : ''}
        </div>
      {/if}
      <!-- Rating and status share a line. -->
      {#if entry.rating != null || entry.status}
        <div class="entry-foot">
          {#if entry.rating != null}<Stars rating={entry.rating} />{/if}
          {#if entry.status}
            <span
              class="entry-status-chip"
              class:is-active={entry.status === 'in-progress'}
              class:is-planned={entry.status === 'want'}
              class:is-stopped={entry.status === 'abandoned'}
              >{statusLabel(entry.status, entry.type) ||
                entry.status}{#if entry.status === 'finished' && times > 1}<span
                  class="entry-times"
                  aria-hidden="true">&nbsp;×{times}</span
                ><span class="visually-hidden">, {times} times</span>{/if}</span
            >
          {/if}
        </div>
      {/if}
      {#if progressPct != null}
        <div class="meter entry-meter" title="{progressPct}%" aria-hidden="true">
          <div class="meter-fill" style:width="{progressPct}%"></div>
        </div>
      {/if}
    </div>
  {/if}
</button>

<style>
  .entry-meter {
    margin-top: var(--space-2);
    height: 2px;
  }
  .entry-times {
    font-variant-numeric: tabular-nums;
  }
</style>
