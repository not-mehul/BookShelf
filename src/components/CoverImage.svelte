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
  let loaded = $state(false);

  // A new picture starts over (thumbnailUrl keeps a cached cover's URL the
  // same across re-renders, so only a real change gets here).
  $effect(() => {
    void src;
    failed = false;
    loaded = false;
  });
</script>

{#if src && !failed}
  <img
    {src}
    {alt}
    loading="lazy"
    decoding="async"
    class="cover-img"
    class:is-loaded={loaded}
    onload={() => (loaded = true)}
    onerror={() => (failed = true)}
  />
{:else}
  {@render fallback?.()}
{/if}
