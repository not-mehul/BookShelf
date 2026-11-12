<script lang="ts">
  import { theme, toggleTheme } from '../platform/theme.svelte';
  import { shelf } from '../state/shelf.svelte';
  import { ui } from '../state/ui.svelte';
  import { plural } from '../util/labels';
  import Icon from './Icon.svelte';
  import IdleCat from './IdleCat.svelte';
  import IdleDock from './IdleDock.svelte';
  import Library from './Library.svelte';
  import Modal from './Modal.svelte';
  import ModalContent from './ModalContent.svelte';
  import { ThemeToggle, Toast, konami, play, secretTaps } from 'dusk-dawn';
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
  function hush() {
    play(titleWord, 'wiggle');
    hatch('title', 'Shh. This is a library.');
  }
</script>

<header class="site-header">
  <div class="title-block">
    <p class="eyebrow header-count">
      {shelf.entries.length
        ? `${plural(shelf.entries.length, 'entry', 'entries')} on the shelf`
        : 'An empty shelf'}
    </p>
    <h1 class="t-page-title" use:secretTaps={{ count: 7, onunlock: hush }}>
      Book<em class="title-word" bind:this={titleWord}>Shelf</em>
    </h1>
    <p class="t-tagline">Books, films, shows and the lines worth keeping</p>
  </div>
  <div class="header-controls">
    <ThemeToggle dawn={theme.shown === 'light'} label="Dawn theme" ontoggle={() => void toggleTheme()} />
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
  <Modal contentKey={ui.modalKey} sheet={ui.modal.kind === 'settings'} onclose={() => ui.close()}>
    {#key ui.modalKey}
      <ModalContent modal={ui.modal} />
    {/key}
  </Modal>
{/if}
