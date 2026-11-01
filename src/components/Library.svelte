<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import { saveAndShareMarkdown } from '../export/markdown';
  import { pushBackHandler } from '../platform/native';
  import { shelf } from '../state/shelf.svelte';
  import { ui } from '../state/ui.svelte';
  import { deleteEntries, restoreEntries } from '../util/bulk';
  import { messageOf } from '../util/errors';
  import { plural, TYPE_ICON } from '../util/labels';
  import { compareSeriesOrder, seriesSortKey } from '../util/series';
  import type { CatalogEntry, EntryType } from '../types';
  import EntryCard from './EntryCard.svelte';
  import Icon from './Icon.svelte';
  import TabRail from './ui/TabRail.svelte';
  import UpNext from './UpNext.svelte';

  type TypeFilter = 'all' | EntryType;
  type SortKey = 'dateAdded' | 'rating' | 'title' | 'year' | 'series';

  const TYPE_TABS: { id: TypeFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'book', label: 'Books' },
    { id: 'movie', label: 'Movies' },
    { id: 'tv', label: 'TV' },
    { id: 'quote', label: 'Quotes' }
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
  }

  function toggle(id: string) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
  }

  // Deleting can be undone for a few seconds instead of being confirmed (style.md §8.12).
  async function deleteSelected() {
    const removed = await deleteEntries([...selected]);
    exitSelection();
    shelf.changed();
    ui.notify(`Deleted ${plural(removed.length, 'entry', 'entries')}.`, 'info', {
      label: 'Undo',
      run: () =>
        void restoreEntries(removed).then(
          () => shelf.changed(),
          (err: unknown) => ui.notify(`Couldn't restore them: ${messageOf(err)}`, 'error')
        )
    });
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
    <TabRail tabs={TYPE_TABS} value={type} label="Show" onselect={(id) => (type = id)} />
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
      <button type="button" class="chip" aria-pressed={tag === null} onclick={() => (tag = null)}>
        All tags
      </button>
      {#each shelf.tags as t (t)}
        <button type="button" class="chip" aria-pressed={tag === t} onclick={() => (tag = t)}>{t}</button>
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
    {#if query || tag}
      <!-- style.md §8.14: a filter found nothing. -->
      <div class="empty-match">
        <p class="t-hint">Nothing on the shelf matches that filter.</p>
        <button
          type="button"
          class="btn btn-muted"
          onclick={() => {
            query = '';
            tag = null;
          }}>Clear filter</button
        >
      </div>
    {:else}
      <!-- style.md §8.14: nothing here yet. -->
      <div class="empty-state">
        {#if type === 'all'}
          <Icon name="bookmark" />
          <p class="empty-title">The shelf is empty</p>
          <p class="empty-text">Books, films, shows and quotes you keep will live here.</p>
        {:else if type === 'quote'}
          <Icon name="quote" />
          <p class="empty-title">No quotes yet</p>
          <p class="empty-text">Lines worth keeping, from anything you read or watch.</p>
        {:else}
          <Icon name={TYPE_ICON[type]} />
          <p class="empty-title">No {EMPTY_LABEL[type]} yet</p>
          <p class="empty-text">Add one and it will appear here.</p>
        {/if}
        <button
          type="button"
          class="btn btn-secondary"
          onclick={() =>
            type === 'quote'
              ? ui.openAdd({ startWith: 'quote' })
              : type === 'all'
                ? ui.openAdd()
                : ui.openAdd({ startWith: 'search', searchType: type })}>Add the first one</button
        >
      </div>
    {/if}
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
      Delete
    </button>
    <button type="button" class="btn btn-muted btn-sm" onclick={exitSelection}>Done</button>
  {/if}
</div>
