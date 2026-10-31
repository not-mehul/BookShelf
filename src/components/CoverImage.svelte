<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    src: string | null;
    alt?: string;
    /** Shown when there is no image, or it fails to load. */
    fallback?: Snippet;
  }

  let { src, alt = '', fallback }: Props = $props();
  let failed = $state(false);

  // A blob: URL (a locally cached cover) is revoked once decoded: the bitmap
  // survives, and object URLs don't pile up across re-renders.
  $effect(() => {
    const url = src;
    failed = false;
    return () => {
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
    };
  });
</script>

{#if src && !failed}
  <img
    {src}
    {alt}
    loading="lazy"
    onload={() => src?.startsWith('blob:') && URL.revokeObjectURL(src)}
    onerror={() => (failed = true)}
  />
{:else}
  {@render fallback?.()}
{/if}
