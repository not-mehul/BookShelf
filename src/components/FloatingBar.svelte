<script lang="ts" generics="V extends string">
  import { IconTabs } from 'dusk-dawn';
  import type { ComponentProps } from 'svelte';
  import HeaderActions from './HeaderActions.svelte';

  // The library's tabs, floated in at the top once the page's own tabs have
  // scrolled away and the reader scrolls back up a little; it slides away again
  // as soon as they scroll down, and stays out of the way whenever the page's
  // tabs are in view.
  interface Props {
    tabs: ComponentProps<typeof IconTabs<V>>['tabs'];
    value: V;
    onselect: (id: V) => void;
    /** The tabs in the page: the bar only appears once they are out of view. */
    anchor: HTMLElement | undefined;
  }

  let { tabs, value, onselect, anchor }: Props = $props();
  let shown = $state(false);

  /** How far up the reader scrolls, in one go, before the bar comes in, and
   *  how far down before it goes: a finger's jitter moves neither. */
  const REVEAL_AFTER = 24;
  const HIDE_AFTER = 8;

  $effect(() => {
    let lastY = window.scrollY;
    let upBy = 0;
    let downBy = 0;
    let queued = false;
    function update() {
      queued = false;
      // A dialog pins the page (Modal.svelte): that is not the reader scrolling.
      if (document.documentElement.classList.contains('is-locked')) return;
      const y = window.scrollY;
      const dy = y - lastY;
      lastY = y;
      const headerGone = anchor ? anchor.getBoundingClientRect().bottom < 0 : false;
      if (!headerGone) {
        shown = false;
        upBy = 0;
      } else if (dy < 0) {
        upBy -= dy;
        downBy = 0;
        if (upBy >= REVEAL_AFTER) shown = true;
      } else if (dy > 0) {
        downBy += dy;
        upBy = 0;
        if (downBy >= HIDE_AFTER) shown = false;
      }
    }
    function onscroll() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    }
    window.addEventListener('scroll', onscroll, { passive: true });
    return () => window.removeEventListener('scroll', onscroll);
  });

  function choose(id: V) {
    onselect(id);
    // A different shelf starts from its first entry, under the page's own tabs.
    const top = (anchor?.getBoundingClientRect().top ?? 0) + window.scrollY;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: Math.max(0, top - 16), behavior: reduce ? 'auto' : 'smooth' });
  }
</script>

<div class="floating-bar" class:is-shown={shown} inert={!shown} aria-hidden={!shown}>
  <div class="floating-bar-inner">
    <!-- The page header, collapsed: the name (back to the top), Stats, Queue and Settings. -->
    <div class="floating-bar-head">
      <button
        type="button"
        class="floating-bar-name"
        onclick={() =>
          window.scrollTo({
            top: 0,
            behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
          })}
      >
        Book<em>Shelf</em><span class="visually-hidden">, back to the top</span>
      </button>
      <HeaderActions />
    </div>
    <IconTabs {tabs} {value} label="Show" labels="selected" onselect={choose} />
  </div>
</div>

<style>
  .floating-bar-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-height: 44px;
  }
  .floating-bar-name {
    min-height: 44px;
    padding: 0;
    border: 0;
    background: none;
    font-family: var(--font-serif);
    font-size: 1.5rem;
    line-height: 1;
    letter-spacing: -0.01em;
    color: var(--text-heading);
    cursor: pointer;
  }
  .floating-bar-name em {
    font-style: italic;
    color: var(--accent-amber);
  }
</style>
