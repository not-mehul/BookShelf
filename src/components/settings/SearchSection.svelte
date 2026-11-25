<script lang="ts">
  import { untrack } from 'svelte';
  import { isLegacy, moveToTmdb } from '../../api/tmdb-move';
  import { plural } from '../../util/labels';
  import { shelf } from '../../state/shelf.svelte';
  import SettingField from './SettingField.svelte';
  import { GOOGLE, TMDB } from './search-keys';

  // Search providers, each folded behind a summary that says whether it is set up.
  let { values }: { values: Record<string, string> } = $props();

  let tmdbReady = $state(untrack(() => Boolean(values[TMDB.key])));
  const googleReady = $derived(Boolean(values.google_books_api_key));

  // Films and shows still on TheTVDB move over once a key is saved.
  const waiting = $derived(shelf.entries.filter(isLegacy).length);
  const unmatched = $derived(shelf.entries.filter((e) => e.needsMatch).length);
  let moving = $state<{ done: number; total: number } | null>(null);
  let moved = $state<string>('');

  async function keySaved(value: string) {
    tmdbReady = Boolean(value);
    if (!value || !waiting) return;
    moving = { done: 0, total: waiting };
    const report = await moveToTmdb((done, total) => (moving = { done, total }));
    moving = null;
    await shelf.refresh();
    moved = report.moved ? `Moved ${plural(report.moved, 'film or show', 'films and shows')} to TMDB.` : '';
  }
</script>

<h3 class="settings-section-heading" id="set-search">Search</h3>
<p class="field-hint settings-lead">
  Book search works as it is. Films and shows come from TMDB, which needs a free key of your own.
</p>

<details class="settings-fold" open={!tmdbReady && waiting > 0}>
  <summary>
    <span class="settings-fold-name">Films and TV <span class="settings-fold-via">TMDB</span></span>
    <span class="settings-fold-state" class:is-ready={tmdbReady}>{tmdbReady ? 'Set up' : 'Not set up'}</span>
  </summary>
  <div class="settings-fold-body">
    <SettingField {...TMDB} initial={values[TMDB.key] ?? ''} onsaved={keySaved} />
    <div class="tmdb-status" role="status">
      {#if moving}
        <p class="field-hint">Moving films and shows to TMDB: {moving.done} of {moving.total}…</p>
      {:else}
        {#if moved}<p class="field-hint">{moved}</p>{/if}
        {#if waiting}
          <p class="field-hint">
            {plural(waiting, 'film or show', 'films and shows')} from TheTVDB will move to TMDB once a key is saved.
          </p>
        {/if}
        {#if unmatched}
          <p class="field-hint">
            {plural(unmatched, 'film or show', 'films and shows')} need a match: open one and use Find a match.
          </p>
        {/if}
      {/if}
    </div>
  </div>
</details>

<details class="settings-fold">
  <summary>
    <span class="settings-fold-name">Books <span class="settings-fold-via">Google Books</span></span>
    <span class="settings-fold-state" class:is-ready={googleReady}
      >{googleReady ? 'Key saved' : 'Optional'}</span
    >
  </summary>
  <div class="settings-fold-body">
    <SettingField {...GOOGLE} initial={values[GOOGLE.key] ?? ''} />
  </div>
</details>

<style>
  .settings-fold {
    border-top: 1px solid var(--border-faint);
  }
  .settings-fold:last-child {
    border-bottom: 1px solid var(--border-faint);
  }
  .settings-fold summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-height: 56px;
    cursor: pointer;
    list-style: none;
  }
  .settings-fold summary::-webkit-details-marker {
    display: none;
  }
  .settings-fold summary::after {
    content: '';
    flex: none;
    width: 7px;
    height: 7px;
    margin-right: 4px;
    border: solid var(--text-faint);
    border-width: 0 1.5px 1.5px 0;
    transform: rotate(45deg);
    transition: transform var(--spring-spatial-fast-dur) var(--spring-spatial-fast);
  }
  .settings-fold[open] summary::after {
    transform: rotate(-135deg);
  }
  .settings-fold-name {
    flex: 1;
    font-family: var(--font-serif);
    font-size: 1rem;
    color: var(--text-heading);
  }
  .settings-fold-via {
    margin-left: 0.35rem;
    font-family: var(--font-mono);
    font-size: 0.6875rem;
    color: var(--text-dim);
  }
  .settings-fold-state {
    font-family: var(--font-mono);
    font-size: 0.625rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  .settings-fold-state.is-ready {
    color: var(--accent-sage);
  }
  .settings-fold-body {
    padding-bottom: var(--space-4);
  }
  .settings-lead {
    margin: 0 0 var(--space-3);
  }
  .settings-lead {
    margin: 0 0 var(--space-3);
  }
</style>
