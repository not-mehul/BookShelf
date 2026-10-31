<script lang="ts">
  import { shelf } from '../state/shelf.svelte';
  import { matchEntries } from '../util/entry-match';
  import { TYPE_SHORT } from '../util/labels';
  import type { CatalogEntry } from '../types';
  import Icon from './Icon.svelte';

  // "From (on your shelf)": an accessible combobox that links a quote to a
  // book / movie / show already in the catalog.
  interface Props {
    /** Input id (for the label). */
    id: string;
    label?: string;
    /** The linked entry's id, or null. */
    value: string | null;
    /** Called when the user picks an entry (or unlinks: null). */
    onselect?: (entry: CatalogEntry | null) => void;
  }

  let { id, label = 'From (on your shelf)', value = $bindable(), onselect }: Props = $props();

  const candidates = $derived(shelf.entries.filter((e) => e.type !== 'quote'));
  const selected = $derived(value ? (candidates.find((e) => e.id === value) ?? null) : null);
  let query = $state('');
  let active = $state(-1);
  let expanded = $state(false);
  let input = $state<HTMLInputElement>();
  const options = $derived(matchEntries(candidates, query));
  const listId = $derived(`${id}-list`);
  const showList = $derived(expanded && options.length > 0);

  function select(entry: CatalogEntry | null) {
    value = entry?.id ?? null;
    expanded = false;
    active = -1;
    onselect?.(entry);
  }

  function onkeydown(ev: KeyboardEvent) {
    if (!showList) return;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      const delta = ev.key === 'ArrowDown' ? 1 : -1;
      active = (active + delta + options.length) % options.length;
    } else if (ev.key === 'Enter' && active >= 0) {
      ev.preventDefault();
      select(options[active] ?? null);
    } else if (ev.key === 'Escape') {
      // Close the list only; don't let Escape also close the dialog.
      ev.preventDefault();
      ev.stopPropagation();
      expanded = false;
      active = -1;
    }
  }
</script>

<div class="field entry-picker">
  <label class="label-field" for={id}>{label}</label>
  <div class="picker-chip-slot">
    {#if selected}
      <div class="picker-chip">
        <span class="picker-chip-type">{TYPE_SHORT[selected.type]}</span>
        <span class="picker-chip-title"
          >{selected.title}{selected.creators?.[0] ? ` — ${selected.creators[0]}` : ''}</span
        >
        <button
          type="button"
          class="btn-icon picker-chip-x"
          aria-label="Unlink {selected.title}"
          onclick={async () => {
            select(null);
            query = '';
            await Promise.resolve();
            input?.focus();
          }}
        >
          <Icon name="x" />
        </button>
      </div>
    {/if}
  </div>
  <input
    bind:this={input}
    {id}
    type="text"
    class="input"
    role="combobox"
    aria-autocomplete="list"
    aria-expanded={showList}
    aria-controls={listId}
    aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
    autocomplete="off"
    placeholder="Search your books, films and shows…"
    hidden={Boolean(selected)}
    bind:value={query}
    oninput={() => {
      active = -1;
      expanded = true;
    }}
    onblur={() => setTimeout(() => (expanded = false), 0)}
    {onkeydown}
  />
  <ul id={listId} class="picker-list" role="listbox" hidden={!showList}>
    {#each options as entry, i (entry.id)}
      <!-- pointerdown (not click) so the input doesn't blur first. -->
      <li
        id="{listId}-{i}"
        class="picker-option"
        role="option"
        aria-selected={i === active}
        onpointerdown={(ev) => {
          ev.preventDefault();
          select(entry);
        }}
      >
        <span class="picker-option-title">{entry.title}</span>
        <span class="picker-option-sub">
          {[TYPE_SHORT[entry.type], entry.creators?.[0], entry.year].filter(Boolean).join(' · ')}
        </span>
      </li>
    {/each}
  </ul>
</div>
