<script lang="ts">
  // A cover for something that has none: its title set like a plain cloth
  // binding, on a wash of one of the four series colours (picked from its id,
  // so it stays the same), with a hairline frame and the type's icon.
  import { TYPE_ICON } from '../util/labels';
  import type { CatalogEntry } from '../types';
  import Icon from './Icon.svelte';

  interface Props {
    entry: Pick<CatalogEntry, 'id' | 'type' | 'title' | 'creators'>;
    /** A list row's small cover: the icon alone. */
    compact?: boolean;
  }

  let { entry, compact = false }: Props = $props();

  const hue = $derived.by(() => {
    let h = 0;
    for (const ch of entry.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return (h % 4) + 1;
  });
</script>

<div class="placeholder-cover" class:is-compact={compact} style:--wash="var(--series-{hue})">
  <span class="placeholder-icon"><Icon name={TYPE_ICON[entry.type]} /></span>
  {#if !compact}
    <span class="placeholder-title">{entry.title}</span>
    {#if entry.creators?.[0]}<span class="placeholder-creator">{entry.creators[0]}</span>{/if}
  {/if}
</div>

<style>
  .placeholder-cover {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-4);
    overflow: hidden;
    background: color-mix(in srgb, var(--wash) 16%, var(--panel-bg-faint));
    text-align: center;
  }
  .placeholder-cover::after {
    content: '';
    position: absolute;
    inset: var(--space-2);
    border: 1px solid color-mix(in srgb, var(--wash) 45%, transparent);
    border-radius: var(--corner-xs);
    pointer-events: none;
  }
  .placeholder-icon {
    color: var(--wash);
  }
  .placeholder-icon :global(svg) {
    width: 22px;
    height: 22px;
    stroke-width: 1.5;
  }
  .placeholder-title {
    display: -webkit-box;
    overflow: hidden;
    font-family: var(--font-serif);
    font-size: 1rem;
    line-height: 1.25;
    color: var(--text-heading);
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 4;
    line-clamp: 4;
  }
  .placeholder-creator {
    font-family: var(--font-serif);
    font-style: italic;
    font-size: 0.8125rem;
    color: var(--text-dim);
  }
  .placeholder-cover.is-compact {
    padding: 0;
  }
  .placeholder-cover.is-compact::after {
    inset: 3px;
  }
  .placeholder-cover.is-compact .placeholder-icon :global(svg) {
    width: 16px;
    height: 16px;
  }
</style>
