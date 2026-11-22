<script lang="ts" module>
  import { getContext, type Snippet } from 'svelte';

  const KEY = Symbol('modal');

  /** What the dialog's sticky bar shows: set by whatever is open in it. */
  export interface SheetBar {
    /** The title the bar shows once the content's own heading has scrolled away. */
    title: string;
    titleShown: boolean;
    /** Buttons beside Close (an entry's menu, say). */
    actions: Snippet | null;
    /** A Back button at the start of the bar. */
    back: (() => void) | null;
  }

  interface Ctx {
    settle: () => void;
    bar: SheetBar;
  }

  /**
   * Call during init in content that renders after an async load; call the
   * returned function once it is on screen, so focus lands on its title.
   */
  export function useModalFocus(): () => void {
    const ctx = getContext<Ctx | undefined>(KEY);
    return () => ctx?.settle();
  }

  /** The open dialog's bar, for content to fill in (call during init). */
  export function useSheetBar(): SheetBar | undefined {
    return getContext<Ctx | undefined>(KEY)?.bar;
  }

  /**
   * Show `title` in the bar while `heading` is scrolled out of view.
   * Use as `{@attach barTitle(bar, title)}` on the content's own heading.
   */
  export function barTitle(bar: SheetBar | undefined, title: string) {
    return (heading: HTMLElement) => {
      if (!bar) return;
      bar.title = title;
      const root = heading.closest('.modal-card');
      const seen = new IntersectionObserver(
        ([e]) => {
          // Out of view above the bar (not below the fold).
          if (e)
            bar.titleShown = !e.isIntersecting && e.boundingClientRect.top < (e.rootBounds?.top ?? 0) + 80;
        },
        { root, rootMargin: '-56px 0px 0px 0px' }
      );
      seen.observe(heading);
      return () => {
        seen.disconnect();
        bar.titleShown = false;
        bar.title = '';
      };
    };
  }
</script>

<script lang="ts">
  import { setContext, tick } from 'svelte';
  import { pushBackHandler } from '../platform/native';
  import Icon from './Icon.svelte';

  interface Props {
    /** Changes whenever the content is replaced (another dialog opened in its place). */
    contentKey: number;
    /**
     * On phones every dialog is a sheet rising from the bottom (style.md §8.11);
     * `full` ones (an entry, the add flow) take the whole height, so they don't
     * jump as their content changes. From 900px up, a centred modal.
     */
    size?: 'auto' | 'full';
    onclose: () => void;
    children: Snippet;
  }

  let { contentKey, size = 'auto', onclose, children }: Props = $props();
  let dialog: HTMLDialogElement;
  let card: HTMLDivElement;
  let closeBtn: HTMLButtonElement;

  const bar = $state<SheetBar>({ title: '', titleShown: false, actions: null, back: null });
  // The bar is see-through over the top of the content, and solid once it scrolls.
  let scrolled = $state(false);

  // If the content didn't claim focus, land on its title (for screen readers),
  // or failing that on its first control. Never leave focus outside the card.
  // Focus on a heading from code shows no ring (it isn't a control).
  function settle() {
    void tick().then(() => {
      const active = document.activeElement;
      if (card && (!card.contains(active) || active === card || active === closeBtn)) {
        (
          card.querySelector<HTMLElement>('#modal-title') ??
          card.querySelector<HTMLElement>('input, textarea, select, button:not(.modal-close)')
        )?.focus();
      }
    });
  }
  setContext<Ctx>(KEY, { settle, bar });

  // One native <dialog> for the whole session of dialogs: showModal() gives the
  // top layer, an inert background and Escape (`cancel`). Focus returns to
  // whatever opened the first one, and Android Back closes it.
  $effect(() => {
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    const release = pushBackHandler(() => onclose());
    return () => {
      release();
      if (dialog.open) dialog.close();
      if (returnTo?.isConnected) returnTo.focus();
    };
  });

  $effect(() => {
    void contentKey;
    card.scrollTop = 0;
    scrolled = false;
    settle();
  });
</script>

<dialog
  bind:this={dialog}
  class="modal-dialog is-sheet"
  class:is-full={size === 'full'}
  aria-labelledby="modal-title"
  onclick={(ev) => {
    // The dialog box fills the viewport; a click on it outside the card dismisses.
    if (ev.target === dialog) onclose();
  }}
  oncancel={(ev) => {
    ev.preventDefault();
    onclose();
  }}
>
  <div class="modal-card" bind:this={card} onscroll={() => (scrolled = card.scrollTop > 4)}>
    <div class="sheet-bar" class:is-scrolled={scrolled} class:is-titled={bar.titleShown}>
      <div class="sheet-handle" aria-hidden="true"></div>
      {#if bar.back}
        <button type="button" class="btn-icon modal-back" aria-label="Back" onclick={bar.back}>
          <Icon name="arrowLeft" />
        </button>
      {/if}
      <div class="sheet-bar-title" aria-hidden="true">{bar.titleShown ? bar.title : ''}</div>
      {#if bar.actions}{@render bar.actions()}{/if}
      <button
        bind:this={closeBtn}
        type="button"
        class="btn-icon modal-close"
        aria-label="Close"
        onclick={onclose}
      >
        <Icon name="x" />
      </button>
    </div>
    {@render children()}
  </div>
</dialog>
