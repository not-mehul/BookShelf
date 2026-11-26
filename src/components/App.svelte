<script lang="ts">
  import { ui } from '../state/ui.svelte';
  import HeaderActions from './HeaderActions.svelte';
  import Icon from './Icon.svelte';
  import IdleCat from './IdleCat.svelte';
  import IdleDock from './IdleDock.svelte';
  import Library from './Library.svelte';
  import Modal from './Modal.svelte';
  import ModalContent from './ModalContent.svelte';
  import { Toast, konami, play, secretTaps } from 'dusk-dawn';
  import { cheer, hatch } from '../util/delight';

  // Easter eggs (style.md §11.3). The Konami code turns every cover face out;
  // seven taps on the title get you shushed.
  let titleWord = $state<HTMLElement>();
  $effect(() =>
    konami(() => {
      for (const [i, card] of [...document.querySelectorAll('.entry-card')].slice(0, 30).entries()) {
        setTimeout(() => play(card, 'flip'), 45 * i);
      }
      cheer(null, { count: 70 });
      hatch('konami', 'Every cover, turned face out.');
    })
  );
  // Whole-height sheets: these load or change as they're used, and a sheet that
  // grew under the finger would jump. Short dialogs fit their content.
  const FULL_HEIGHT = new Set(['entry', 'add', 'settings', 'refresh', 'queue', 'stats']);

  function hush() {
    play(titleWord, 'wiggle');
    hatch('title', 'Shh. This is a library.');
  }
</script>

<!-- The name, then Stats, Queue and Settings. As the shelf scrolls, a compact
     bar with the name, those three and the tabs comes back on the way up
     (FloatingBar). -->
<header class="site-header">
  <div class="title-block">
    <h1 class="t-page-title" use:secretTaps={{ count: 7, onunlock: hush }}>
      Book<em class="title-word" bind:this={titleWord}>Shelf</em>
    </h1>
    <p class="t-tagline">Books, films, shows and the lines worth keeping</p>
  </div>
  <HeaderActions />
</header>

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

<IdleDock label="The library cat" disabled={!!ui.modal}><IdleCat /></IdleDock>

<Toast
  toast={ui.toast}
  onpause={() => ui.pauseToast()}
  onresume={() => ui.resumeToast()}
  onaction={() => ui.actOnToast()}
/>

{#if ui.modal}
  <Modal
    contentKey={ui.modalKey}
    size={FULL_HEIGHT.has(ui.modal.kind) ? 'full' : 'auto'}
    onclose={() => ui.close()}
  >
    {#key ui.modalKey}
      <ModalContent modal={ui.modal} />
    {/key}
  </Modal>
{/if}
