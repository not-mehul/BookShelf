<script lang="ts">
  import type { Modal } from '../state/ui.svelte';
  import AddFlow from './add/AddFlow.svelte';
  import BulkEdit from './BulkEdit.svelte';
  import EntryModal from './entry/EntryModal.svelte';
  import Queue from './Queue.svelte';
  import Settings from './settings/Settings.svelte';
  import ShareCard from './ShareCard.svelte';
  import Stats from './Stats.svelte';

  let { modal }: { modal: Modal } = $props();
</script>

{#if modal.kind === 'entry'}
  <EntryModal id={modal.id} />
{:else if modal.kind === 'add'}
  <AddFlow options={modal.options} />
{:else if modal.kind === 'settings'}
  <Settings />
{:else if modal.kind === 'stats'}
  <Stats />
{:else if modal.kind === 'queue'}
  <Queue />
{:else if modal.kind === 'bulk'}
  <BulkEdit ids={modal.ids} />
{:else if modal.kind === 'share'}
  <ShareCard id={modal.id} />
{/if}
