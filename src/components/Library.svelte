<script lang="ts">
  import { Select } from 'dusk-dawn';
  import { hatch } from '../util/delight';
  import { SvelteSet } from 'svelte/reactivity';
  import { tick, untrack } from 'svelte';
  import { pushBackHandler } from '../platform/native';
  import { shelf } from '../state/shelf.svelte';
  import { ui } from '../state/ui.svelte';
  import { deleteEntries, restoreEntries } from '../util/bulk';
  import { messageOf } from '../util/errors';
  import { plural, TYPE_ICON, TYPE_NOUN } from '../util/labels';
  import { compareSeriesOrder, seriesSortKey } from '../util/series';
  import type { CatalogEntry, EntryType } from '../types';
  import EntryCard from './EntryCard.svelte';
  import Icon from './Icon.svelte';
  import { IconTabs } from 'dusk-dawn';
  import type { Snippet } from 'svelte';
  import FloatingBar from './FloatingBar.svelte';
  import HomeStrip from './HomeStrip.svelte';
  import LibraryEmpty from './LibraryEmpty.svelte';
  import { foldText } from '../util/fold';
  import OverflowMenu from './OverflowMenu.svelte';
  import { loadView, saveView } from '../util/view-prefs';
  import { compareTitles } from '../util/text';
  import { hasTag } from '../util/tags';

  type TypeFilter = 'all' | EntryType;
  type SortKey = 'dateAdded' | 'finished' | 'rating' | 'title' | 'year' | 'series';
  type Layout = 'grid' | 'list';

  // Icons only, the chosen tab opening to its word (style.md §8.5.2).
  const TYPE_TABS: { id: TypeFilter; label: string; icon: Snippet }[] = [
    { id: 'all', label: 'All', icon: allIcon },
    { id: 'book', label: 'Books', icon: bookIcon },
    { id: 'movie', label: 'Movies', icon: movieIcon },
    { id: 'tv', label: 'TV', icon: tvIcon },
    { id: 'quote', label: 'Quotes', icon: quoteIcon }
  ];
  const SORT_OPTS: { value: SortKey; label: string }[] = [
    { value: 'dateAdded', label: 'Recent' },
    { value: 'finished', label: 'Finished' },
    { value: 'rating', label: 'Rating' },
    { value: 'title', label: 'Title' },
    { value: 'year', label: 'Year' },
    { value: 'series', label: 'Series' }
  ];
  /** Last finished first; things never finished (or undated) after. */
  const lastFinish = (e: CatalogEntry) => e.finishes?.at(-1) ?? '';
  const SORTERS: Record<SortKey, (a: CatalogEntry, b: CatalogEntry) => number> = {
    dateAdded: (a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || ''),
    finished: (a, b) => lastFinish(b).localeCompare(lastFinish(a)) || compareTitles(a, b),
    rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || compareTitles(a, b),
    title: (a, b) => compareTitles(a, b),
    year: (a, b) => (b.year ?? 0) - (a.year ?? 0) || compareTitles(a, b),
    // Series grouped together in reading order; everything else after, A–Z.
    series: (a, b) => seriesSortKey(a).localeCompare(seriesSortKey(b)) || compareSeriesOrder(a, b)
  };

  // The tab and sort come back as they were left (this device only).
  const saved = loadView();
  let type = $state<TypeFilter>(
    TYPE_TABS.some((t) => t.id === saved.type) ? (saved.type as TypeFilter) : 'all'
  );
  let sort = $state<SortKey>(
    saved.sort && Object.hasOwn(SORTERS, saved.sort) ? (saved.sort as SortKey) : 'dateAdded'
  );
  // Covers in a grid, or a denser list of rows (style.md §7.2).
  let layout = $state<Layout>(saved.layout === 'list' ? 'list' : 'grid');
  $effect(() => saveView({ type, sort, layout }));
  let filterInput = $state<HTMLInputElement>();
  let typesRow = $state<HTMLElement>();
  let query = $state('');
  let tag = $state<string | null>(null);

  const visible = $derived.by(() => {
    let list = shelf.entries;
    if (type !== 'all') list = list.filter((e) => e.type === type);
    if (tag) list = list.filter((e) => hasTag(e.tags, tag!));
    const q = foldText(query.trim());
    if (q) {
      list = list.filter((e) =>
        foldText(
          [
            e.title,
            e.originalTitle,
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
        ).includes(q)
      );
    }
    return [...list].sort(SORTERS[sort]);
  });
  // The count of what the tab shows sits once, under the tabs (and in Stats),
  // not on every tab.
  const typeTotal = $derived(
    type === 'all' ? shelf.entries.length : shelf.entries.filter((e) => e.type === type).length
  );
  const countLine = $derived.by(() => {
    if (!shelf.entries.length) return '';
    const [one, many] = type === 'all' ? ['entry', 'entries'] : [TYPE_NOUN[type], `${TYPE_NOUN[type]}s`];
    const total = plural(typeTotal, one, many);
    return visible.length === typeTotal ? total : `${visible.length} of ${total}`;
  });

  // ── Drawing the shelf in batches ──────────────────────────────
  // A tab change draws the first screenful at once and the rest a batch a
  // frame after, so the tab answers the tap straight away, however big the
  // shelf is. Edits and syncs keep everything drawn.
  const FIRST_BATCH = 12;
  const BATCH = 24;
  let limit = $state(FIRST_BATCH);
  const drawn = $derived(limit >= visible.length ? visible : visible.slice(0, limit));
  // While the chosen tab opens to its word, the rest of the shelf waits, so
  // the word's animation has the frames to itself.
  const TAB_SETTLE_MS = 420;
  let quietUntil = 0;
  $effect(() => {
    if (limit >= visible.length) return;
    const wait = quietUntil - performance.now();
    let frame = 0;
    const timer = setTimeout(
      () => (frame = requestAnimationFrame(() => (limit += BATCH))),
      Math.max(0, wait)
    );
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  });

  let grid = $state<HTMLElement>();
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  // The tab that looks chosen: it answers the tap at once, and the shelf
  // follows a frame later, once the tab has started to open.
  let tab = $state<TypeFilter>(untrack(() => type));
  let switching = 0;

  /** Show another tab: the tab first, then its first entries easing in, then the rest. */
  function chooseType(id: TypeFilter) {
    if (id === tab) return;
    tab = id;
    const mine = ++switching;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (mine !== switching) return;
        quietUntil = performance.now() + TAB_SETTLE_MS;
        limit = FIRST_BATCH;
        type = id;
        if (calm()) return;
        void tick().then(() =>
          grid?.animate(
            [
              { opacity: 0, transform: 'translateY(10px)' },
              { opacity: 1, transform: 'none' }
            ],
            { duration: 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
          )
        );
      })
    );
  }

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

  const filtering = $derived(Boolean(query || tag));
  const showUpNext = $derived(!filtering && !selecting && (type === 'all' || type === 'tv'));
  const showQuote = $derived(!filtering && !selecting && type === 'all');

  // An easter egg: the word for a pile of books bought and not yet read.
  let piled = false;
  $effect(() => {
    const said = query.trim().toLowerCase() === 'tsundoku';
    if (said && !piled)
      hatch(
        'tsundoku',
        'Tsundoku: the art of owning more books than you will read. You are in good company.'
      );
    piled = said;
  });
</script>

<svelte:document
  onkeydown={(ev) => {
    // Escape leaves selection mode (when no dialog is open).
    if (document.querySelector('dialog[open]')) return;
    if (ev.key === 'Escape' && selecting) exitSelection();
    // "/" jumps to the filter, as on most catalogs (not while typing elsewhere).
    const typing =
      ev.target instanceof HTMLElement && ev.target.closest('input, textarea, select, [contenteditable]');
    if (ev.key === '/' && !typing && !ev.metaKey && !ev.ctrlKey && !ev.altKey) {
      ev.preventDefault();
      filterInput?.focus();
    }
  }}
/>

{#snippet allIcon()}<Icon name="library" />{/snippet}
{#snippet bookIcon()}<Icon name={TYPE_ICON.book} />{/snippet}
{#snippet movieIcon()}<Icon name={TYPE_ICON.movie} />{/snippet}
{#snippet tvIcon()}<Icon name={TYPE_ICON.tv} />{/snippet}
{#snippet quoteIcon()}<Icon name={TYPE_ICON.quote} />{/snippet}

<FloatingBar tabs={TYPE_TABS} value={tab} onselect={chooseType} anchor={typesRow} />

<div class="lib-header">
  <div class="lib-types-row" bind:this={typesRow}>
    <IconTabs tabs={TYPE_TABS} value={tab} label="Show" labels="selected" onselect={chooseType} />
    <!-- What the tab shows, and what a filter or tag leaves of it. -->
    <div class="lib-count">{countLine}</div>
  </div>

  <div class="lib-tools-row">
    <input
      type="search"
      class="input filter-input"
      placeholder="Filter…"
      aria-label="Filter library"
      aria-keyshortcuts="/"
      enterkeyhint="search"
      bind:this={filterInput}
      bind:value={query}
      onkeydown={(ev) => {
        if (ev.key === 'Escape' && query) {
          ev.stopPropagation();
          query = '';
        }
      }}
    />
    <div class="select-wrap select-wrap-sm">
      <Select class="select-sm" label="Sort by" bind:value={sort} options={SORT_OPTS} />
    </div>
    <OverflowMenu
      label="More library actions"
      items={[
        {
          label: layout === 'list' ? 'Show as a grid' : 'Show as a list',
          icon: layout === 'list' ? 'grid' : 'list',
          onselect: () => (layout = layout === 'list' ? 'grid' : 'list')
        },
        { label: 'Select entries', icon: 'select', onselect: () => enterSelection() }
      ]}
    />
  </div>

  {#if shelf.tags.length}
    <!-- One row that scrolls sideways, however many tags there are. -->
    <div class="lib-tags-row" role="group" aria-label="Filter by tag">
      <button type="button" class="chip" aria-pressed={tag === null} onclick={() => (tag = null)}>
        All tags
      </button>
      {#each shelf.tags as t (t)}
        <button type="button" class="chip" aria-pressed={tag === t} onclick={() => (tag = t)}>{t}</button>
      {/each}
    </div>
  {/if}
</div>

<HomeStrip upNext={showUpNext} quote={showQuote} />

<div
  bind:this={grid}
  class="entry-grid"
  class:quote-grid={type === 'quote' && layout === 'grid'}
  class:is-list={layout === 'list'}
>
  {#each drawn as entry (entry.id)}
    <EntryCard
      {entry}
      {layout}
      hideType={type !== 'all'}
      {selecting}
      selected={selected.has(entry.id)}
      ontoggle={toggle}
      onlongpress={enterSelection}
    />
  {:else}
    <LibraryEmpty
      {type}
      filtered={filtering}
      onclear={() => {
        query = '';
        tag = null;
      }}
    />
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
    <button type="button" class="btn btn-muted btn-sm select-done" onclick={exitSelection}>Done</button>
  {/if}
</div>
