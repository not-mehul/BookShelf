<script lang="ts">
  import { untrack } from 'svelte';
  import type { AddOptions } from '../../state/ui.svelte';
  import type { EntryType } from '../../types';
  import { useModalFocus } from '../Modal.svelte';
  import ManualForm from './ManualForm.svelte';
  import MediumPicker from './MediumPicker.svelte';
  import QuoteForm from './QuoteForm.svelte';
  import SearchStep from './SearchStep.svelte';

  // Adding to the catalog, in steps:
  //   1. choose a medium (book / movie / TV / quote)
  //   2. quotes: the quote form; others: search, then add a result or enter it manually
  // Saving opens the new entry.
  let { options }: { options: AddOptions } = $props();
  type MediaType = Exclude<EntryType, 'quote'>;
  type Step = { name: 'pick' } | { name: 'quote' } | { name: 'search' | 'manual'; type: MediaType };

  const start = untrack((): Step => {
    if (options.startWith === 'quote') return { name: 'quote' };
    if (options.startWith === 'search' && options.searchType)
      return { name: 'search', type: options.searchType };
    return { name: 'pick' };
  });
  let step = $state.raw<Step>(start);
  const settleFocus = useModalFocus();

  function go(next: Step) {
    step = next;
    settleFocus();
  }
</script>

{#key step}
  {#if step.name === 'pick'}
    <MediumPicker
      prefill={options.prefill}
      onpick={(type) => go(type === 'quote' ? { name: 'quote' } : { name: 'search', type })}
    />
  {:else if step.name === 'quote'}
    <QuoteForm
      prefill={options.prefill}
      linkedEntryId={options.linkedEntryId}
      onback={() => go({ name: 'pick' })}
    />
  {:else if step.name === 'search'}
    {@const type = step.type}
    <SearchStep
      {type}
      query={options.prefill?.query ?? ''}
      onback={() => go({ name: 'pick' })}
      onmanual={() => go({ name: 'manual', type })}
    />
  {:else}
    {@const type = step.type}
    <ManualForm {type} onback={() => go({ name: 'search', type })} />
  {/if}
{/key}
