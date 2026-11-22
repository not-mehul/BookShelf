<script lang="ts">
  import { ui } from '../state/ui.svelte';
  import type { EntryType } from '../types';
  import { TYPE_ICON } from '../util/labels';
  import Icon from './Icon.svelte';

  // What an empty tab says (style.md §8.14): a filter that found nothing, or a
  // shelf with nothing on it yet.
  let { type, filtered, onclear }: { type: EntryType | 'all'; filtered: boolean; onclear: () => void } =
    $props();

  const EMPTY_LABEL: Record<Exclude<EntryType, 'quote'>, string> = {
    book: 'books',
    movie: 'movies',
    tv: 'shows'
  };
</script>

{#if filtered}
  <!-- style.md §8.14: a filter found nothing. -->
  <div class="empty-match">
    <p class="t-hint">Nothing on the shelf matches that filter.</p>
    <button type="button" class="btn btn-muted" onclick={onclear}>Clear filter</button>
  </div>
{:else}
  <!-- style.md §8.14: nothing here yet. -->
  <div class="empty-state">
    {#if type === 'all'}
      <Icon name="bookmark" />
      <p class="empty-title">The shelf is empty</p>
      <p class="empty-text">Books, films, shows and quotes you keep will live here.</p>
    {:else if type === 'quote'}
      <Icon name="quote" />
      <p class="empty-title">No quotes yet</p>
      <p class="empty-text">Lines worth keeping, from anything you read or watch.</p>
    {:else}
      <Icon name={TYPE_ICON[type]} />
      <p class="empty-title">No {EMPTY_LABEL[type]} yet</p>
      <p class="empty-text">Add one and it will appear here.</p>
    {/if}
    <button
      type="button"
      class="btn btn-secondary"
      onclick={() =>
        type === 'quote'
          ? ui.openAdd({ startWith: 'quote' })
          : type === 'all'
            ? ui.openAdd()
            : ui.openAdd({ startWith: 'search', searchType: type })}>Add the first one</button
    >
  </div>
{/if}
