<script lang="ts">
  // Find a match: search the catalog for the book, film or show this entry
  // is, then fill in its cover and details from the one picked. A preview
  // names what will be filled; nothing the user wrote changes.
  import { LoadingIndicator } from 'dusk-dawn';
  import { untrack } from 'svelte';
  import { defaultQuery, findCandidates, matchEntry, matchFills } from '../../api/match';
  import { isTmdbConfigured } from '../../api/tmdb';
  import { ui } from '../../state/ui.svelte';
  import type { CatalogEntry, SearchHit } from '../../types';
  import { messageOf } from '../../util/errors';
  import { TYPE_ICON } from '../../util/labels';
  import CoverImage from '../CoverImage.svelte';
  import Icon from '../Icon.svelte';
  import ModalHead from '../ModalHead.svelte';

  interface Props {
    entry: CatalogEntry;
    onback: () => void;
    /** Called with the entry as saved once a match is applied. */
    onmatched: (saved: CatalogEntry) => void;
  }

  let { entry, onback, onmatched }: Props = $props();
  const e = untrack(() => entry);

  let query = $state(defaultQuery(e));
  let view = $state<
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'no-tmdb' }
    | { kind: 'error'; message: string }
    | { kind: 'done'; hits: SearchHit[] }
  >({ kind: 'idle' });
  let chosen = $state<SearchHit | null>(null);
  let applying = $state(false);
  let seq = 0;

  async function search() {
    const mine = ++seq;
    chosen = null;
    if (e.type !== 'book' && !(await isTmdbConfigured())) {
      view = { kind: 'no-tmdb' };
      return;
    }
    view = { kind: 'loading' };
    try {
      const hits = await findCandidates(e, query.trim() || defaultQuery(e));
      if (mine === seq) view = { kind: 'done', hits };
    } catch (err) {
      if (mine === seq) view = { kind: 'error', message: messageOf(err) };
    }
  }

  async function apply() {
    if (!chosen) return;
    applying = true;
    try {
      const saved = await matchEntry(e.id, chosen);
      if (saved) {
        ui.notify(`Matched ${saved.title}.`, 'success');
        onmatched(saved);
      }
    } catch (err) {
      ui.notify(`Couldn't match it: ${messageOf(err)}`, 'error');
    } finally {
      applying = false;
    }
  }

  $effect(() => {
    untrack(() => void search());
  });

  const sub = (hit: SearchHit) => [hit.creators.slice(0, 2).join(', '), hit.year].filter(Boolean).join(' · ');
</script>

<ModalHead eyebrow="Find a match" title={e.title} {onback} />

<form
  class="search-form add-search-form"
  onsubmit={(ev) => {
    ev.preventDefault();
    void search();
  }}
>
  <input
    type="search"
    class="input"
    aria-label="Search the catalog"
    autocomplete="off"
    enterkeyhint="search"
    bind:value={query}
  />
  <button type="submit" class="btn btn-primary"
    ><Icon name="search" /> <span class="btn-label">Search</span></button
  >
</form>

<div class="add-results-zone">
  {#if chosen}
    <div class="match-preview">
      <div class="add-result-row">
        <div class="add-result-thumb">
          <CoverImage src={chosen.thumbnailUrl}>
            {#snippet fallback()}
              <div class="add-result-thumb-ph"><Icon name={TYPE_ICON[chosen!.type]} /></div>
            {/snippet}
          </CoverImage>
        </div>
        <div class="add-result-meta">
          <div class="add-result-title">{chosen.title}</div>
          {#if sub(chosen)}<div class="add-result-sub">{sub(chosen)}</div>{/if}
        </div>
      </div>
      {#if matchFills(e, chosen).length}
        <p class="field-hint">Fills in: {matchFills(e, chosen).join(', ')}.</p>
      {:else}
        <p class="field-hint">Links it to the catalog; everything else is already filled in.</p>
      {/if}
      <p class="field-hint">Your title, status, rating, dates, notes and tags stay as they are.</p>
      <div class="modal-actions">
        <button type="button" class="btn btn-muted" disabled={applying} onclick={() => (chosen = null)}
          >Back to results</button
        >
        <button type="button" class="btn btn-primary" disabled={applying} onclick={apply}>
          {#if applying}<LoadingIndicator label="Matching" size={20} />{/if} Use this match
        </button>
      </div>
    </div>
  {:else if view.kind === 'loading'}
    <div class="loading-row"><LoadingIndicator label="Searching" size={32} />Searching</div>
  {:else if view.kind === 'no-tmdb'}
    <div class="notice">
      <Icon name="settings" />
      <div class="notice-text">
        <span class="notice-title">TMDB isn’t set up.</span>
        <span class="notice-detail">Add your free TMDB key in Settings to match films and shows.</span>
      </div>
    </div>
  {:else if view.kind === 'error'}
    <p class="msg-error" role="alert">{view.message}</p>
  {:else if view.kind === 'done'}
    {#if view.hits.length}
      <div class="add-results-label">Tap the one this is</div>
      <div class="add-result-list">
        {#each view.hits as hit, i (i)}
          <button type="button" class="add-result-row match-row" onclick={() => (chosen = hit)}>
            <div class="add-result-thumb">
              <CoverImage src={hit.thumbnailUrl}>
                {#snippet fallback()}
                  <div class="add-result-thumb-ph"><Icon name={TYPE_ICON[hit.type]} /></div>
                {/snippet}
              </CoverImage>
            </div>
            <div class="add-result-meta">
              <div class="add-result-title">{hit.title}</div>
              {#if hit.originalTitle}<div class="add-result-original">{hit.originalTitle}</div>{/if}
              {#if sub(hit)}<div class="add-result-sub">{sub(hit)}</div>{/if}
            </div>
          </button>
        {/each}
      </div>
    {:else}
      <p class="field-hint">Nothing found. Try the title alone, or another spelling.</p>
    {/if}
  {/if}
</div>

<style>
  .match-row:hover {
    border-color: rgba(var(--accent-amber-rgb), 0.5);
    background: var(--hover-bg);
  }
  .match-row:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }
  .match-preview {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .match-preview .field-hint {
    margin: 0;
  }
</style>
