<script lang="ts">
  import Icon from './Icon.svelte';

  interface Props {
    eyebrow: string;
    /** Without a title, the eyebrow names the dialog. */
    title?: string;
    onback?: () => void;
    class?: string;
  }

  let { eyebrow, title, onback, class: extra = '' }: Props = $props();
</script>

{#if onback}
  <button type="button" class="btn-icon modal-back" aria-label="Back" onclick={onback}>
    <Icon name="arrowLeft" />
  </button>
{/if}
<div class="add-head {extra}">
  {#if title}
    <div class="modal-eyebrow">{eyebrow}</div>
    <h2 class="add-title" id="modal-title" tabindex="-1">{title}</h2>
  {:else}
    <div class="modal-eyebrow" id="modal-title" tabindex="-1">{eyebrow}</div>
  {/if}
</div>
