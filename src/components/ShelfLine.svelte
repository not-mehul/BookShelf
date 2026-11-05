<script lang="ts">
  import { shelf } from '../state/shelf.svelte';
  import { ui } from '../state/ui.svelte';
  import { localDate } from '../util/episodes';
  import { dailyIndex } from '../util/daily';
  import Icon from './Icon.svelte';

  // One kept quote at the top of the library: the same one all day, a new one
  // tomorrow, and another on request.

  const quotes = $derived(
    shelf.entries
      .filter((e) => e.type === 'quote' && (e.quoteText || e.title))
      .sort((a, b) => a.id.localeCompare(b.id))
  );
  let offset = $state(0);
  const quote = $derived(
    quotes.length ? quotes[(dailyIndex(localDate(), quotes.length) + offset) % quotes.length] : undefined
  );
  const citation = $derived(quote ? [quote.creators?.[0], quote.source].filter(Boolean).join(', ') : '');
</script>

{#if quote}
  <section class="shelf-line" aria-label="A line from the shelf">
    <button type="button" class="shelf-line-open" onclick={() => ui.openEntry(quote.id)}>
      <span class="t-field-label">A line from the shelf</span>
      <span class="shelf-line-text">{quote.quoteText || quote.title}</span>
      {#if citation}<span class="shelf-line-cite">{citation}</span>{/if}
    </button>
    {#if quotes.length > 1}
      <button
        type="button"
        class="btn-icon shelf-line-next"
        aria-label="Show another quote"
        title="Another"
        onclick={() => offset++}
      >
        <Icon name="shuffle" />
      </button>
    {/if}
  </section>
{/if}

<style>
  .shelf-line {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    margin: 0 0 var(--space-5);
    border-left: 2px solid var(--accent-amber);
    background: var(--panel-bg-faint);
    border-radius: 0 2px 2px 0;
  }
  .shelf-line-open {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-4) var(--space-4) var(--space-4) var(--space-5);
    background: none;
    border: none;
    text-align: left;
    color: inherit;
    font: inherit;
    cursor: pointer;
    transition: background var(--dur-hover);
  }
  .shelf-line-open:hover {
    background: var(--hover-bg);
  }
  .shelf-line-text {
    font-family: var(--font-serif);
    font-style: italic;
    font-size: 1.0625rem;
    line-height: 1.5;
    color: var(--text-heading);
    display: -webkit-box;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .shelf-line-cite {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--text-dim);
  }
  .shelf-line-cite::before {
    content: '— ';
  }
  .shelf-line-next {
    margin: var(--space-2) var(--space-2) 0 0;
    flex-shrink: 0;
  }
</style>
