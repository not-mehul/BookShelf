<script lang="ts">
  // The synopsis, near the end of an entry: four lines, and the rest on request.
  let { text }: { text: string } = $props();
  let open = $state(false);
  // Roughly more than four lines on a phone.
  const long = $derived(text.trim().length > 260);
</script>

<div class="modal-section">
  <div class="modal-section-label">Synopsis</div>
  <p class="modal-summary" class:is-clamped={long && !open}>{text}</p>
  {#if long}
    <button type="button" class="link-button synopsis-more" onclick={() => (open = !open)}>
      {open ? 'Show less' : 'Show more'}
    </button>
  {/if}
</div>

<style>
  .is-clamped {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 4;
    line-clamp: 4;
  }
  .synopsis-more {
    margin-top: var(--space-2);
  }
</style>
