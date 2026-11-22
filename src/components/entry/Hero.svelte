<script lang="ts">
  // The top of an entry: its cover beside its title, creators, year and genres.
  // Compact on a phone, so what you change (status, rating) is on the first screen.
  import { thumbnailUrl } from '../../db/database';
  import { TYPE_LABEL } from '../../util/labels';
  import type { CatalogEntry } from '../../types';
  import CoverImage from '../CoverImage.svelte';
  import { barTitle, useSheetBar } from '../Modal.svelte';
  import PlaceholderCover from '../PlaceholderCover.svelte';

  let { entry }: { entry: CatalogEntry } = $props();
  const src = $derived(thumbnailUrl(entry) || entry.thumbnailUrl);
  const bar = useSheetBar();
  const facts = $derived([entry.year, ...(entry.genres ?? []).slice(0, 3)].filter(Boolean).join(' · '));
</script>

<div class="modal-hero">
  <div class="modal-poster">
    <CoverImage {src}>
      {#snippet fallback()}<PlaceholderCover {entry} />{/snippet}
    </CoverImage>
  </div>
  <div class="modal-heading">
    <div class="modal-eyebrow">{TYPE_LABEL[entry.type]}</div>
    <h2 class="modal-title" id="modal-title" tabindex="-1" {@attach barTitle(bar, entry.title)}>
      {entry.title}
    </h2>
    {#if entry.originalTitle}
      <p class="modal-original">{entry.originalTitle}</p>
    {/if}
    {#if entry.creators?.length}
      <p class="modal-creators">{entry.creators.join(', ')}</p>
    {/if}
    {#if facts}
      <p class="modal-year">{facts}</p>
    {/if}
  </div>
</div>
