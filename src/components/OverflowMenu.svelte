<script lang="ts" module>
  import type { IconName } from '../util/icons';

  export interface MenuItem {
    label: string;
    icon?: IconName;
    onselect: () => void;
    disabled?: boolean;
    /** Deleting: in the danger colour, and kept last. */
    danger?: boolean;
    /** A setting that is on (List view): ticked. */
    checked?: boolean;
  }
</script>

<script lang="ts">
  // "More" for actions that don't earn a button of their own: a button with
  // three dots, and a menu that drops from it (style.md §8.1, icon button; the
  // menu looks like the Select menu's). Arrow keys move through it, Escape,
  // Back or a tap outside closes it, and focus goes back to the button.
  import { tick } from 'svelte';
  import { pushBackHandler } from '../platform/native';
  import Icon from './Icon.svelte';

  interface Props {
    label?: string;
    items: MenuItem[];
  }

  let { label = 'More', items }: Props = $props();
  let open = $state(false);
  let trigger: HTMLButtonElement;
  let menu = $state<HTMLDivElement>();
  const uid = $props.id();

  const buttons = () => [
    ...(menu?.querySelectorAll<HTMLButtonElement>('[role=menuitem]:not(:disabled)') ?? [])
  ];

  function place() {
    if (!menu) return;
    const r = trigger.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const edge = 8;
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    const above = r.bottom + 4 + h > vh - edge && r.top - 4 - h > edge;
    menu.style.left = `${Math.max(edge, Math.min(r.right - w, vw - edge - w))}px`;
    menu.style.top = `${above ? r.top - 4 - h : r.bottom + 4}px`;
  }

  async function show() {
    open = true;
    await tick();
    menu?.showPopover();
    place();
    buttons()[0]?.focus();
  }

  function hide({ refocus = true } = {}) {
    if (!open) return;
    open = false;
    if (refocus) trigger.focus();
  }

  $effect(() => {
    if (!open) return;
    const release = pushBackHandler(() => hide());
    const away = (ev: PointerEvent) => {
      if (!menu?.contains(ev.target as Node) && !trigger.contains(ev.target as Node))
        hide({ refocus: false });
    };
    const moved = () => hide({ refocus: false });
    document.addEventListener('pointerdown', away, true);
    window.addEventListener('resize', moved);
    document.addEventListener('scroll', moved, true);
    return () => {
      release();
      document.removeEventListener('pointerdown', away, true);
      window.removeEventListener('resize', moved);
      document.removeEventListener('scroll', moved, true);
    };
  });

  function onkeydown(ev: KeyboardEvent) {
    const list = buttons();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    const go = (i: number) => list.at(i % list.length)?.focus();
    if (ev.key === 'ArrowDown') go(at + 1);
    else if (ev.key === 'ArrowUp') go(at - 1);
    else if (ev.key === 'Home') go(0);
    else if (ev.key === 'End') go(-1);
    else if (ev.key === 'Escape' || ev.key === 'Tab') {
      if (ev.key === 'Escape') ev.stopPropagation();
      hide({ refocus: ev.key === 'Escape' });
      if (ev.key === 'Tab') return;
    } else return;
    ev.preventDefault();
  }

  // Danger last, after a rule.
  const ordered = $derived([...items.filter((i) => !i.danger), ...items.filter((i) => i.danger)]);
</script>

<button
  bind:this={trigger}
  type="button"
  class="btn-icon overflow-trigger"
  aria-label={label}
  title={label}
  aria-haspopup="menu"
  aria-expanded={open}
  aria-controls={open ? `${uid}-menu` : undefined}
  onclick={() => (open ? hide() : void show())}
>
  <Icon name="more" />
</button>

{#if open}
  <div
    bind:this={menu}
    id="{uid}-menu"
    class="dd-menu overflow-menu"
    role="menu"
    tabindex="-1"
    aria-label={label}
    popover="manual"
    {onkeydown}
  >
    {#each ordered as item, i (item.label)}
      <button
        type="button"
        role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
        aria-checked={item.checked}
        class="dd-option overflow-item"
        class:is-danger={item.danger}
        class:after-rule={item.danger && i > 0}
        disabled={item.disabled}
        onclick={() => {
          hide();
          item.onselect();
        }}
      >
        {#if item.icon}<Icon name={item.icon} />{/if}
        <span class="dd-option-label">{item.label}</span>
        {#if item.checked}<Icon name="check" />{/if}
      </button>
    {/each}
  </div>
{/if}

<style>
  .overflow-menu {
    min-width: 12rem;
  }
  .overflow-item {
    width: 100%;
    border: 0;
    background: none;
    font: inherit;
    font-size: 0.875rem;
    text-align: start;
  }
  .overflow-item:hover:not(:disabled),
  .overflow-item:focus-visible {
    background: var(--hover-bg);
    color: var(--text-heading);
  }
  .overflow-item:disabled {
    color: var(--text-faint);
    cursor: default;
  }
  .overflow-item :global(svg) {
    flex: none;
    color: var(--text-dim);
  }
  .overflow-item.is-danger,
  .overflow-item.is-danger :global(svg) {
    color: var(--danger);
  }
  .after-rule {
    margin-top: var(--space-1);
    border-top: 1px solid var(--border-faint);
    border-radius: 0 0 var(--corner-sm) var(--corner-sm);
  }
</style>
