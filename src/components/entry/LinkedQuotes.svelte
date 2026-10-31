<script lang="ts">
  import { shelf } from '../../state/shelf.svelte';
  import { ui } from '../../state/ui.svelte';
  import type { CatalogEntry } from '../../types';
  import Icon from '../Icon.svelte';

  let { entry }: { entry: CatalogEntry } = $props();
  // Quotes from this book / film / show, oldest first.
  const quotes = $derived(
    shelf.entries
      .filter((q) => q.linkedEntryId === entry.id)
      .sort((a, b) => (a.dateAdded || '').localeCompare(b.dateAdded || ''))
  );
  const clip = (text: string) => (text.length > 160 ? `${text.slice(0, 159)}…` : text);
</script>

<div class="modal-section">
  <div class="modal-section-label">Quotes</div>
  <ul class="linked-quotes">
    {#each quotes as q (q.id)}
      <li>
        <button type="button" class="linked-quote" onclick={() => ui.openEntry(q.id)}>
          <span class="linked-quote-text">“{clip(q.quoteText || q.title)}”</span>
          {#if q.location}
            <span class="linked-quote-loc">{q.location}</span>
          {/if}
        </button>
      </li>
    {/each}
  </ul>
  <button
    type="button"
    class="btn btn-muted btn-sm"
    onclick={() => ui.openAdd({ startWith: 'quote', linkedEntryId: entry.id })}
  >
    <Icon name="quote" /> <span>Add a quote</span>
  </button>
</div>
