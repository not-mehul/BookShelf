<script lang="ts">
  // A dialog's heading: an eyebrow and an italic title. Its Back button lives
  // in the dialog's bar, and the bar shows the title once it has scrolled away.
  import { barTitle, useSheetBar } from './Modal.svelte';

  interface Props {
    eyebrow: string;
    /** Without a title, the eyebrow names the dialog. */
    title?: string;
    onback?: () => void;
    class?: string;
  }

  let { eyebrow, title, onback, class: extra = '' }: Props = $props();
  const bar = useSheetBar();

  $effect(() => {
    if (!bar || !onback) return;
    const back = onback;
    bar.back = back;
    return () => {
      if (bar.back === back) bar.back = null;
    };
  });
</script>

<div class="add-head {extra}">
  {#if title}
    <div class="modal-eyebrow">{eyebrow}</div>
    <h2 class="add-title" id="modal-title" tabindex="-1" {@attach barTitle(bar, title)}>{title}</h2>
  {:else}
    <div class="modal-eyebrow" id="modal-title" tabindex="-1" {@attach barTitle(bar, eyebrow)}>{eyebrow}</div>
  {/if}
</div>
