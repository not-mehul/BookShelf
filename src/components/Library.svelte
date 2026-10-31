<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import { saveAndShareMarkdown } from '../export/markdown';
  import { pushBackHandler } from '../platform/native';
  import { shelf } from '../state/shelf.svelte';
  import { ui } from '../state/ui.svelte';
  import { deleteEntries } from '../util/bulk';
  import { plural, TYPE_ICON } from '../util/labels';
  import { compareSeriesOrder, seriesSortKey } from '../util/series';
  import type { CatalogEntry, EntryType } from '../types';
  import EntryCard from './EntryCard.svelte';
  import Icon from './Icon.svelte';
  import Segmented from './Segmented.svelte';
  import UpNext from './UpNext.svelte';

  type TypeFilter = 'all' | EntryType;
  type SortKey = 'dateAdded' | 'rating' | 'title' | 'year' | 'series';

  const TYPE_OPTS: { value: TypeFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'book', label: 'Books' },
    { value: 'movie', label: 'Movies' },
    { value: 'tv', label: 'TV' },
    { value: 'quote', label: 'Quotes' }
  ];
  const SORT_OPTS: { value: SortKey; label: string }[] = [
    { value: 'dateAdded', label: 'Recently added' },
    { value: 'rating', label: 'Highest rated' },
    { value: 'title', label: 'Title (A–Z)' },
    { value: 'year', label: 'Year (newest)' },
    { value: 'series', label: 'Series order' }
  ];
  const SORTERS: Record<SortKey, (a: CatalogEntry, b: CatalogEntry) => number> = {
    dateAdded: (a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || ''),
    rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.title.localeCompare(b.title),
    title: (a, b) => a.title.localeCompare(b.title),
    year: (a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title),
    // Series grouped together in reading order; everything else after, A–Z.
    series: (a, b) => seriesSortKey(a).localeCompare(seriesSortKey(b)) || compareSeriesOrder(a, b)
  };
  const EMPTY_LABEL: Record<Exclude<EntryType, 'quote'>, string> = {
    book: 'books',
    movie: 'movies',
    tv: 'shows'
  };

  let type = $state<TypeFilter>('all');
  let sort = $state<SortKey>('dateAdded');
  let query = $state('');
  let tag = $state<string | null>(null);

  const visible = $derived.by(() => {
    let list = shelf.entries;
    if (type !== 'all') list = list.filter((e) => e.type === type);
    if (tag) list = list.filter((e) => (e.tags || []).includes(tag!));
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((e) =>
        [
          e.title,
          e.quoteText,
          e.summary,
          e.notes,
          e.source,
          e.series?.name,
          ...(e.creators || []),
          ...(e.genres || []),
          ...(e.tags || [])
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q)
      );
    }
    return [...list].sort(SORTERS[sort]);
  });

  // ── Selection mode ────────────────────────────────────────────
  let selecting = $state(false);
  const selected = new SvelteSet<string>();
  let releaseBack: (() => void) | null = null;
  let deleteArmed = $state(false);
  let armTimer: ReturnType<typeof setTimeout> | undefined;

  function enterSelection(firstId?: string) {
    if (!selecting) {
      selecting = true;
      releaseBack = pushBackHandler(exitSelection);
    }
    if (firstId) selected.add(firstId);
  }

  function exitSelection() {
    selecting = false;
    selected.clear();
    releaseBack?.();
    releaseBack = null;
    deleteArmed = false;
  }

  function toggle(id: string) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
  }

  async function deleteSelected() {
    if (!deleteArmed) {
      deleteArmed = true;
      clearTimeout(armTimer);
      armTimer = setTimeout(() => (deleteArmed = false), 3000);
      return;
    }
    clearTimeout(armTimer);
    await deleteEntries([...selected]);
    exitSelection();
    shelf.changed();
  }

  // Drop selected ids that no longer exist (deleted, or synced away).
  $effect(() => {
    const ids = new Set(shelf.entries.map((e) => e.id));
    for (const id of [...selected]) if (!ids.has(id)) selected.delete(id);
  });

  $effect(() => {
    document.body.classList.toggle('is-selecting', selecting);
  });

  let exporting = $state(false);
  async function exportMarkdown() {
    exporting = true;
    try {
      await saveAndShareMarkdown();
    } finally {
      exporting = false;
    }
  }

  const showUpNext = $derived(!query && !selecting && (type === 'all' || type === 'tv'));
</script>

<svelte:document
  onkeydown={(ev) => {
    // Escape leaves selection mode (when no dialog is open).
    if (ev.key === 'Escape' && selecting && !document.querySelector('dialog[open]')) exitSelection();
  }}
/>

<div class="lib-header">
  <div class="lib-types-row">
    <Segmented options={TYPE_OPTS} bind:value={type} />
    <div class="lib-count">{visible.length ? plural(visible.length, 'entry', 'entries') : ''}</div>
  </div>

  <div class="lib-tools-row">
    <input
      type="search"
      class="input filter-input"
      placeholder="Filter…"
      aria-label="Filter library"
      bind:value={query}
    />
    <div class="select-wrap select-wrap-sm">
      <select class="select select-sm" aria-label="Sort by" bind:value={sort}>
        {#each SORT_OPTS as opt (opt.value)}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
    </div>
    <button
      type="button"
      class="btn btn-muted"
      title="View statistics"
      aria-label="View statistics"
      onclick={() => ui.open({ kind: 'stats' })}
    >
      <Icon name="chart" /> <span class="btn-label">Stats</span>
    </button>
    <button
      type="button"
      class="btn btn-muted"
      title="Your queue"
      aria-label="Your queue"
      onclick={() => ui.open({ kind: 'queue' })}
    >
      <Icon name="queue" /> <span class="btn-label">Queue</span>
    </button>
    <button
      type="button"
      class="btn btn-muted"
      title="Select entries"
      aria-label="Select entries"
      aria-pressed={selecting}
      onclick={() => (selecting ? exitSelection() : enterSelection())}
    >
      <Icon name="select" /> <span class="btn-label">Select</span>
    </button>
    <button
      type="button"
      class="btn btn-muted"
      title="Export catalog as Markdown"
      disabled={exporting}
      onclick={exportMarkdown}
    >
      <Icon name="download" /> <span class="btn-label">Export</span>
    </button>
  </div>

  {#if shelf.tags.length}
    <div class="lib-tags-row">
      <button type="button" class="lib-tag-chip" class:active={tag === null} onclick={() => (tag = null)}>
        All tags
      </button>
      {#each shelf.tags as t (t)}
        <button type="button" class="lib-tag-chip" class:active={tag === t} onclick={() => (tag = t)}
          >{t}</button
        >
      {/each}
    </div>
  {/if}
</div>

{#if showUpNext}
  <UpNext />
{/if}

<div class="entry-grid" class:quote-grid={type === 'quote'}>
  {#each visible as entry (entry.id)}
    <EntryCard
      {entry}
      {selecting}
      selected={selected.has(entry.id)}
      ontoggle={toggle}
      onlongpress={enterSelection}
    />
  {:else}
    <div class="empty-state">
      {#if query}
        <Icon name="search" />
        <h3>No matches</h3>
        <p>Try different words or clear the filter.</p>
      {:else if type === 'all'}
        <Icon name="bookmark" />
        <h3>The shelf is empty</h3>
        <p>Tap the + button to add a book, film, show, or quote.</p>
      {:else if type === 'quote'}
        <Icon name="quote" />
        <h3>No quotes yet</h3>
        <p>Tap the + button to add a quote.</p>
      {:else}
        <Icon name={TYPE_ICON[type]} />
        <h3>No {EMPTY_LABEL[type]} yet</h3>
        <p>Tap the + button to add one.</p>
      {/if}
    </div>
  {/each}
</div>

<div class="select-bar" role="toolbar" aria-label="Selected entries" hidden={!selecting}>
  {#if selecting}
    <span class="select-count" aria-live="polite">{selected.size} selected</span>
    <button
      type="button"
      class="btn btn-muted btn-sm"
      onclick={() => {
        for (const e of visible) selected.add(e.id);
      }}>Select all</button
    >
    <button
      type="button"
      class="btn btn-primary btn-sm"
      disabled={selected.size === 0}
      onclick={() => ui.open({ kind: 'bulk', ids: [...selected] })}>Edit…</button
    >
    <button
      type="button"
      class="btn btn-danger btn-sm"
      disabled={selected.size === 0}
      onclick={deleteSelected}
    >
      {deleteArmed ? `Tap again to delete ${selected.size}` : 'Delete'}
    </button>
    <button type="button" class="btn btn-muted btn-sm" onclick={exitSelection}>Done</button>
  {/if}
</div>
