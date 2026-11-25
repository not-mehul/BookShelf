<script lang="ts">
  import { LoadingIndicator } from 'dusk-dawn';
  import { untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { searchAllBooks } from '../../api/books';
  import { isTmdbConfigured, searchTmdb } from '../../api/tmdb';
  import { findBySource, saveEntry } from '../../db/database';
  import { shelf } from '../../state/shelf.svelte';
  import { ui, type AddSeed } from '../../state/ui.svelte';
  import { canScanBarcodes, scanBarcode } from '../../util/barcode';
  import { deleteEntries } from '../../util/bulk';
  import { findCopy } from '../../util/duplicates';
  import { messageOf } from '../../util/errors';
  import { plural, TYPE_ICON, TYPE_NOUN } from '../../util/labels';
  import { newEntry } from '../../util/new-entry';
  import { parseSeriesFromTitle } from '../../util/series';
  import { fetchThumbBlob } from '../../util/thumbs';
  import type { CatalogEntry, EntryType, SearchHit } from '../../types';
  import CoverImage from '../CoverImage.svelte';
  import Icon from '../Icon.svelte';
  import ModalHead from '../ModalHead.svelte';

  interface Props {
    type: Exclude<EntryType, 'quote'>;
    /** Search for this straight away. */
    query: string;
    /** Status from another app's link, for the entry this adds. */
    seed?: AddSeed;
    onback: () => void;
    onmanual: () => void;
  }

  let { type, query: initialQuery, seed, onback, onmanual }: Props = $props();
  const PLURAL = { book: 'books', movie: 'movies', tv: 'TV shows' } as const;

  type Results =
    | { state: 'idle' }
    | { state: 'loading' }
    | { state: 'no-tmdb' }
    | { state: 'error'; message: string }
    | { state: 'done'; hits: { hit: SearchHit; existingId: string | null }[] };

  let query = $state(untrack(() => initialQuery));
  let results = $state.raw<Results>({ state: 'idle' });
  let scanning = $state(false);
  let input: HTMLInputElement;
  // Each search gets a sequence number; a slower, older response (or one that
  // lands after the user left this step) is dropped instead of overwriting newer results.
  let seq = 0;
  let alive = true;

  $effect(() => {
    input.focus();
    if (untrack(() => query)) void runSearch();
    return () => (alive = false);
  });

  // Books: ISBNs go straight to Open Library; otherwise try Google Books first
  // and fall back to Open Library if it returns nothing or rate-limits.

  async function runSearch() {
    const mine = ++seq;
    const stale = () => mine !== seq || !alive;
    const q = query.trim();
    results = { state: 'idle' };
    picked.clear();
    if (!q) {
      input.focus();
      return;
    }
    // Movies and TV need the user's own free TMDB key.
    if (type !== 'book' && !(await isTmdbConfigured())) {
      if (!stale()) results = { state: 'no-tmdb' };
      return;
    }
    results = { state: 'loading' };
    try {
      const hits = type === 'book' ? await searchAllBooks(q) : await searchTmdb(q, type);
      const existing = await Promise.all(hits.map(onShelf));
      if (stale()) return;
      results = { state: 'done', hits: hits.map((hit, i) => ({ hit, existingId: existing[i]?.id ?? null })) };
    } catch (err) {
      if (stale()) return;
      console.error(err);
      results = {
        state: 'error',
        message: messageOf(err) || 'Search failed. Check your connection and API key.'
      };
    }
  }

  async function scan() {
    scanning = true;
    try {
      const code = await scanBarcode();
      if (code) {
        query = code;
        void runSearch();
      }
    } catch (err) {
      results = { state: 'error', message: messageOf(err) };
    } finally {
      scanning = false;
    }
  }

  function seeded(): Partial<CatalogEntry> {
    if (!seed) return {};
    return {
      ...(seed.status ? { status: seed.status } : {}),
      // The day the sender says it was finished, not today.
      ...(seed.status === 'finished' && seed.finishedAt ? { finishes: [seed.finishedAt] } : {}),
      ...(seed.notes ? { notes: seed.notes } : {})
    };
  }

  // One add at a time. A tapped result shows the loading indicator in place of
  // its plus while its cover downloads, and every row waits, so quick repeat
  // taps can't save it twice.
  let addingIndex = $state<number | null>(null);
  let addingMany = $state(false);
  const busy = $derived(addingIndex !== null || addingMany);

  // Several at once: Select several turns the rows into checkboxes.
  let selecting = $state(false);
  const picked = new SvelteSet<number>();

  /**
   * The shelf's copy of a result: the same catalog record, or (for an entry
   * from an import or the manual form) the same ISBN, or title and author.
   */
  async function onShelf(hit: SearchHit): Promise<CatalogEntry | null> {
    return (await findBySource(hit.type, hit.sourceId)) ?? findCopy(shelf.entries, hit);
  }

  /** The entry for a result: the one already on the shelf, or a new one, saved. */
  async function entryFor(hit: SearchHit, withSeed: boolean): Promise<{ id: string; created: boolean }> {
    const existing = await onShelf(hit);
    if (existing) return { id: existing.id, created: false };
    const entry = newEntry(hit.type, {
      sourceId: hit.sourceId != null ? String(hit.sourceId) : null,
      title: hit.title,
      originalTitle: hit.originalTitle || null,
      creators: hit.creators || [],
      year: hit.year ?? null,
      summary: hit.summary || '',
      genres: hit.genres || [],
      pageCount: hit.pageCount || null,
      isbn: hit.isbn || null,
      detailUrl: hit.detailUrl || null,
      series: parseSeriesFromTitle(hit.title),
      thumbnailUrl: hit.thumbnailUrl || null,
      thumbnailBlob: await fetchThumbBlob(hit.thumbnailUrl),
      ...(withSeed ? seeded() : {})
    });
    await saveEntry(entry);
    return { id: entry.id, created: true };
  }

  async function add(hit: SearchHit, i: number) {
    if (busy) return;
    addingIndex = i;
    try {
      const { id } = await entryFor(hit, true);
      shelf.changed();
      ui.openEntry(id);
    } catch (err) {
      ui.notify(`Couldn't add it: ${messageOf(err)}`, 'error');
      addingIndex = null;
    }
  }

  function startSelecting() {
    picked.clear();
    selecting = true;
  }

  function stopSelecting() {
    picked.clear();
    selecting = false;
  }

  /** Adds every picked result, closes the search and offers it all back. */
  async function addPicked() {
    if (busy || !picked.size || results.state !== 'done') return;
    const hits = results.hits;
    const chosen = [...picked].sort((a, b) => a - b).map((i) => hits[i]!.hit);
    addingMany = true;
    try {
      const done = await Promise.all(chosen.map((hit) => entryFor(hit, false)));
      const created = done.filter((d) => d.created).map((d) => d.id);
      shelf.changed();
      ui.close();
      ui.notify(`Added ${plural(created.length, TYPE_NOUN[type], PLURAL[type])}.`, 'success', {
        label: 'Undo',
        run: () =>
          void deleteEntries(created).then(
            () => shelf.changed(),
            (err: unknown) => ui.notify(`Couldn't remove them: ${messageOf(err)}`, 'error')
          )
      });
    } catch (err) {
      ui.notify(`Couldn't add them all: ${messageOf(err)}`, 'error');
      shelf.changed();
      addingMany = false;
    }
  }
</script>

<ModalHead eyebrow="Add to catalog" title="Add a {TYPE_NOUN[type]}" class="add-head-search" {onback} />

<form
  class="search-form add-search-form"
  onsubmit={(ev) => {
    ev.preventDefault();
    void runSearch();
  }}
>
  <input
    bind:this={input}
    type="search"
    class="input"
    placeholder="Search {PLURAL[type]} by title…"
    aria-label="Search {PLURAL[type]}"
    autocomplete="off"
    enterkeyhint="search"
    bind:value={query}
  />
  <!-- Books: scan an ISBN barcode instead of typing (Google's Code Scanner). -->
  {#if type === 'book' && canScanBarcodes()}
    <button type="button" class="btn btn-muted" aria-label="Scan barcode" disabled={scanning} onclick={scan}>
      <Icon name="barcode" /> <span class="btn-label">Scan</span>
    </button>
  {/if}
  <button type="submit" class="btn btn-primary"
    ><Icon name="search" /> <span class="btn-label">Search</span></button
  >
</form>

<div class="add-results-zone">
  {#if results.state === 'loading'}
    <div class="loading-row"><LoadingIndicator label="Searching" size={32} />Searching</div>
  {:else if results.state === 'no-tmdb'}
    <div class="notice">
      <Icon name="settings" />
      <div class="notice-text">
        <span class="notice-title">TMDB isn’t set up.</span>
        <span class="notice-detail">
          Add your free TMDB key in
          <a
            href="#settings"
            onclick={(ev) => {
              ev.preventDefault();
              ui.open({ kind: 'settings' });
            }}>Settings</a
          >
          to search movies and TV, or enter the details by hand below.
        </span>
      </div>
    </div>
  {:else if results.state === 'error'}
    <div class="msg-error">{results.message}</div>
  {:else if results.state === 'done' && !results.hits.length}
    <div class="add-empty">
      <Icon name="search" />
      <p class="add-empty-text">No results found. You can enter the details manually.</p>
      <button type="button" class="btn btn-primary" onclick={onmanual}>Enter manually</button>
    </div>
  {:else if results.state === 'done'}
    {@const addable = results.hits.filter((h) => !h.existingId).length}
    <div class="add-results-head">
      <div class="add-results-label">
        {selecting
          ? `${picked.size} of ${results.hits.length} picked`
          : `${results.hits.length} ${PLURAL[type]} found`}
      </div>
      {#if selecting}
        <button type="button" class="add-select-toggle" disabled={addingMany} onclick={stopSelecting}
          >Cancel</button
        >
      {:else if addable > 1}
        <button type="button" class="add-select-toggle" disabled={busy} onclick={startSelecting}
          >Select several</button
        >
      {/if}
    </div>
    <!-- Says what is happening while a cover downloads, for screen readers. -->
    <span class="visually-hidden" role="status"
      >{addingIndex !== null ? `Adding ${results.hits[addingIndex]?.hit.title}` : ''}</span
    >
    <div class="add-result-list" aria-busy={busy}>
      {#each results.hits as { hit, existingId }, i (i)}
        {#snippet face()}
          <div class="add-result-thumb">
            <CoverImage src={hit.thumbnailUrl}>
              {#snippet fallback()}
                <div class="add-result-thumb-ph"><Icon name={TYPE_ICON[hit.type]} /></div>
              {/snippet}
            </CoverImage>
          </div>
          <div class="add-result-meta">
            <div class="add-result-title">{hit.title}</div>
            {#if hit.originalTitle}
              <div class="add-result-original">{hit.originalTitle}</div>
            {/if}
            {#if hit.creators?.length || hit.year}
              <div class="add-result-sub">
                {[hit.creators?.slice(0, 2).join(', '), hit.year].filter(Boolean).join(' · ')}
              </div>
            {/if}
          </div>
        {/snippet}
        {#if selecting}
          <label class="add-result-row" class:is-in-library={existingId} class:is-picked={picked.has(i)}>
            {@render face()}
            <span class="add-result-action add-result-pick">
              {#if existingId}
                <Icon name="check" /><span class="visually-hidden">Already on the shelf</span>
              {:else}
                <input
                  type="checkbox"
                  class="check"
                  checked={picked.has(i)}
                  disabled={addingMany}
                  onchange={(ev) => (ev.currentTarget.checked ? picked.add(i) : picked.delete(i))}
                />
              {/if}
            </span>
          </label>
        {:else}
          <!-- Only the plus adds: the rest of the row is there to read. -->
          <div class="add-result-row" class:is-in-library={existingId} class:is-adding={addingIndex === i}>
            {@render face()}
            <button
              type="button"
              class="add-result-add"
              aria-label={existingId ? `Open ${hit.title}` : `Add ${hit.title}`}
              aria-disabled={busy}
              onclick={() => add(hit, i)}
            >
              <span class="add-result-action" class:is-in-library={existingId} aria-hidden="true">
                {#if addingIndex === i}
                  <LoadingIndicator label="Adding" size={24} />
                {:else}
                  <Icon name={existingId ? 'check' : 'plus'} />
                {/if}
              </span>
            </button>
          </div>
        {/if}
      {/each}
    </div>
    {#if selecting}
      <div class="add-picked-bar">
        <button
          type="button"
          class="btn btn-primary"
          disabled={!picked.size || addingMany}
          onclick={addPicked}
        >
          {#if addingMany}
            <LoadingIndicator label="Adding" size={20} /> Adding {plural(
              picked.size,
              TYPE_NOUN[type],
              PLURAL[type]
            )}…
          {:else}
            <Icon name="plus" />
            {picked.size
              ? `Add ${plural(picked.size, TYPE_NOUN[type], PLURAL[type])}`
              : `Add ${PLURAL[type]}`}
          {/if}
        </button>
      </div>
    {/if}
  {/if}
</div>

<!-- Always there: the way out when search can't find it. -->
<div class="add-manual-row">
  <button type="button" class="add-manual-link" onclick={onmanual}
    >Can't find it? Enter details manually</button
  >
</div>
