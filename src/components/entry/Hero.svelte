<script lang="ts">
  import { thumbnailUrl } from '../../db/database';
  import { TYPE_ICON, TYPE_LABEL } from '../../util/labels';
  import type { CatalogEntry } from '../../types';
  import CoverImage from '../CoverImage.svelte';
  import Icon from '../Icon.svelte';

  let { entry }: { entry: CatalogEntry } = $props();
  const src = $derived(thumbnailUrl(entry) || entry.thumbnailUrl);
</script>

<div class="modal-hero">
  <div class="modal-poster">
    <CoverImage {src}>
      {#snippet fallback()}
        <div class="modal-poster-placeholder"><Icon name={TYPE_ICON[entry.type]} /></div>
      {/snippet}
    </CoverImage>
  </div>
  <div class="modal-heading">
    <div class="modal-eyebrow">{TYPE_LABEL[entry.type]}</div>
    <h2 class="modal-title" id="modal-title" tabindex="-1">{entry.title}</h2>
    {#if entry.creators?.length}
      <p class="modal-creators">{entry.creators.join(', ')}</p>
    {/if}
    {#if entry.year}
      <p class="modal-year">{entry.year}</p>
    {/if}
    {#if entry.genres?.length}
      <div class="tag-row">
        {#each entry.genres.slice(0, 8) as g (g)}
          <span class="tag">{g}</span>
        {/each}
      </div>
    {/if}
  </div>
</div>
