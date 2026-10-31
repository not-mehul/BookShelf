<script lang="ts">
  import { shelf } from '../state/shelf.svelte';
  import { ui } from '../state/ui.svelte';
  import { plural } from '../util/labels';
  import Icon from './Icon.svelte';
  import Library from './Library.svelte';
  import Modal from './Modal.svelte';
  import ModalContent from './ModalContent.svelte';

  const counts = $derived.by(() => {
    const c = { book: 0, movie: 0, tv: 0, quote: 0 };
    for (const e of shelf.entries) c[e.type]++;
    return c;
  });
  const parts = $derived(
    [
      counts.book && plural(counts.book, 'book'),
      counts.movie && plural(counts.movie, 'movie'),
      counts.tv && plural(counts.tv, 'show'),
      counts.quote && plural(counts.quote, 'quote')
    ].filter((p): p is string => Boolean(p))
  );
</script>

<header class="site-header">
  <div class="title-block">
    <h1 class="site-title">Book<em>Shelf</em></h1>
    <p class="site-subtitle">-by Mehul</p>
  </div>
  <div class="header-controls">
    <button
      type="button"
      class="btn-icon"
      aria-label="Settings"
      title="Settings"
      onclick={() => ui.open({ kind: 'settings' })}
    >
      <Icon name="settings" />
    </button>
  </div>
</header>

<div class="stats-bar">
  {#if shelf.entries.length}
    <span class="stat-accent">{plural(shelf.entries.length, 'entry', 'entries')}</span>
    {#each parts as part (part)}
      <span class="stat-sep"></span>
      <span>{part}</span>
    {/each}
  {:else}
    <span>0 entries</span>
  {/if}
</div>

<div id="screen">
  <Library />
</div>

<button
  type="button"
  class="fab"
  aria-label="Add to catalog"
  title="Add to catalog"
  onclick={() => ui.openAdd()}
>
  <Icon name="plus" />
</button>

{#if ui.modal}
  <Modal contentKey={ui.modalKey} onclose={() => ui.close()}>
    {#key ui.modalKey}
      <ModalContent modal={ui.modal} />
    {/key}
  </Modal>
{/if}
