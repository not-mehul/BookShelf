<script lang="ts">
  import type { IconName } from '../../util/icons';
  import type { SharePrefill } from '../../util/share-intake';
  import type { EntryType } from '../../types';
  import Icon from '../Icon.svelte';
  import ModalHead from '../ModalHead.svelte';

  interface Props {
    prefill?: SharePrefill;
    onpick: (type: EntryType) => void;
  }

  let { prefill, onpick }: Props = $props();

  const MEDIA: { type: EntryType; label: string; icon: IconName; blurb: string }[] = [
    { type: 'book', label: 'Book', icon: 'book', blurb: 'Search Google Books' },
    { type: 'movie', label: 'Movie', icon: 'film', blurb: 'Search TheTVDB' },
    { type: 'tv', label: 'TV', icon: 'tv', blurb: 'Search TheTVDB' },
    { type: 'quote', label: 'Quote', icon: 'quote', blurb: 'Enter manually' }
  ];
  // Shared text: show what arrived, then let the user pick what it is.
  const shared = $derived(prefill && (prefill.quoteText || prefill.query || prefill.link));
</script>

<ModalHead eyebrow="Add to catalog" title="What would you like to add?" />

{#if shared}
  <div class="shared-preview">
    <div class="shared-preview-label">Shared with BookShelf</div>
    <div class="shared-preview-text">{shared}</div>
  </div>
{/if}

<div class="medium-grid">
  {#each MEDIA as m (m.type)}
    <button type="button" class="medium-choice" onclick={() => onpick(m.type)}>
      <span class="medium-choice-icon" aria-hidden="true"><Icon name={m.icon} /></span>
      <span class="medium-choice-label">{m.label}</span>
      <span class="medium-choice-blurb">{m.blurb}</span>
    </button>
  {/each}
</div>
