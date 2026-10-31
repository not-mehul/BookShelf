<script lang="ts">
  import { untrack } from 'svelte';
  import { searchBooks } from '../../api/books';
  import { looksLikeIsbn, searchOpenLibrary } from '../../api/openlibrary';
  import { isTvdbConfigured, searchTvdb } from '../../api/tvdb';
  import { findBySource, saveEntry } from '../../db/database';
  import { shelf } from '../../state/shelf.svelte';
  import { ui } from '../../state/ui.svelte';
  import { canScanBarcodes, scanBarcode } from '../../util/barcode';
  import { messageOf } from '../../util/errors';
  import { TYPE_ICON, TYPE_LABEL } from '../../util/labels';
  import { newEntry } from '../../util/new-entry';
  import { parseSeriesFromTitle } from '../../util/series';
  import { fetchThumbBlob } from '../../util/thumbs';
  import type { EntryType, SearchHit } from '../../types';
  import CoverImage from '../CoverImage.svelte';
  import Icon from '../Icon.svelte';
  import ModalHead from '../ModalHead.svelte';

  interface Props {
    type: Exclude<EntryType, 'quote'>;
    /** Search for this straight away. */
    query: string;
    onback: () => void;
    onmanual: () => void;
  }

  let { type, query: initialQuery, onback, onmanual }: Props = $props();
  const PLURAL = { book: 'books', movie: 'movies', tv: 'TV shows' } as const;

  type Results =
    | { state: 'idle' }
    | { state: 'loading' }
    | { state: 'no-tvdb' }
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
  async function searchBooksMerged(q: string): Promise<SearchHit[]> {
    if (looksLikeIsbn(q)) {
      const ol = await searchOpenLibrary(q);
      return ol.length ? ol : searchBooks(q);
    }
    try {
      const g = await searchBooks(q);
      if (g.length) return g;
    } catch (err) {
      const ol = await searchOpenLibrary(q);
      if (ol.length) return ol;
      throw err;
    }
    return searchOpenLibrary(q);
  }

  async function runSearch() {
    const mine = ++seq;
    const stale = () => mine !== seq || !alive;
    const q = query.trim();
    results = { state: 'idle' };
    if (!q) {
      input.focus();
      return;
    }
    // Movies and TV need TheTVDB access: an API key or a BookShelf proxy.
    if (type !== 'book' && !(await isTvdbConfigured())) {
      if (!stale()) results = { state: 'no-tvdb' };
      return;
    }
    results = { state: 'loading' };
    try {
      const hits = type === 'book' ? await searchBooksMerged(q) : await searchTvdb(q, type);
      const existing = await Promise.all(hits.map((h) => findBySource(h.type, h.sourceId)));
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

  async function add(hit: SearchHit) {
    const existing = await findBySource(hit.type, hit.sourceId);
    if (existing) {
      ui.openEntry(existing.id);
      return;
    }
    const entry = newEntry(hit.type, {
      sourceId: hit.sourceId != null ? String(hit.sourceId) : null,
      title: hit.title,
      creators: hit.creators || [],
      year: hit.year ?? null,
      summary: hit.summary || '',
      genres: hit.genres || [],
      pageCount: hit.pageCount || null,
      isbn: hit.isbn || null,
      detailUrl: hit.detailUrl || null,
      series: parseSeriesFromTitle(hit.title),
      thumbnailUrl: hit.thumbnailUrl || null,
      thumbnailBlob: await fetchThumbBlob(hit.thumbnailUrl)
    });
    await saveEntry(entry);
    shelf.changed();
    ui.openEntry(entry.id);
  }
</script>

<ModalHead eyebrow="Add a {TYPE_LABEL[type].toLowerCase()}" class="add-head-search" {onback} />

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
  <!-- Books: scan an ISBN barcode instead of typing (native scanner or the
       browser's BarcodeDetector; hidden when neither is available). -->
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
    <div class="loading-row">Searching</div>
  {:else if results.state === 'no-tvdb'}
    <div class="notice">
      TheTVDB isn’t set up — add an API key or a proxy URL for movies and TV.
      <a
        href="#settings"
        onclick={(ev) => {
          ev.preventDefault();
          ui.open({ kind: 'settings' });
        }}>Open Settings</a
      >
      to add it, or enter details manually below.
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
    <div class="add-results-label">{results.hits.length} {PLURAL[type]} found — tap to add</div>
    <div class="add-result-list">
      {#each results.hits as { hit, existingId }, i (i)}
        <button
          type="button"
          class="add-result-row"
          class:is-in-library={existingId}
          onclick={() => add(hit)}
        >
          <div class="add-result-thumb">
            <CoverImage src={hit.thumbnailUrl}>
              {#snippet fallback()}
                <div class="add-result-thumb-ph"><Icon name={TYPE_ICON[hit.type]} /></div>
              {/snippet}
            </CoverImage>
          </div>
          <div class="add-result-meta">
            <div class="add-result-title">{hit.title}</div>
            {#if hit.creators?.length || hit.year}
              <div class="add-result-sub">
                {[hit.creators?.slice(0, 2).join(', '), hit.year].filter(Boolean).join(' · ')}
              </div>
            {/if}
          </div>
          <span class="add-result-action" class:is-in-library={existingId} aria-hidden="true">
            <Icon name={existingId ? 'check' : 'plus'} />
          </span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<!-- Always there: the way out when search can't find it. -->
<div class="add-manual-row">
  <button type="button" class="add-manual-link" onclick={onmanual}
    >Can't find it? Enter details manually</button
  >
</div>
