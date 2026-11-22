<script lang="ts">
  import { removeSetting } from '../../util/settings';
  import SettingField from './SettingField.svelte';
  import { GOOGLE, TVDB } from './search-keys';

  // Search providers, each folded behind a summary that says whether it is set up.
  let { values, tokenIssued = $bindable() }: { values: Record<string, string>; tokenIssued: number } =
    $props();

  const tvdbReady = $derived(Boolean(values.tvdb_api_key || values.tvdb_proxy_url));
  const googleReady = $derived(Boolean(values.google_books_api_key));
  const issuedText = $derived(
    tokenIssued
      ? new Date(tokenIssued).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
      : 'not yet cached'
  );

  async function clearToken() {
    await removeSetting('tvdb_token');
    await removeSetting('tvdb_token_issued');
    tokenIssued = 0;
  }
</script>

<h3 class="settings-section-heading" id="set-search">Search</h3>
<p class="field-hint settings-lead">
  Book search works as it is. Movies and shows come from TheTVDB, which needs a key of your own or a BookShelf
  proxy.
</p>

<details class="settings-fold">
  <summary>
    <span class="settings-fold-name">Movies and TV <span class="settings-fold-via">TheTVDB</span></span>
    <span class="settings-fold-state" class:is-ready={tvdbReady}>{tvdbReady ? 'Set up' : 'Not set up'}</span>
  </summary>
  <div class="settings-fold-body">
    {#each TVDB as d (d.key)}
      <SettingField {...d} initial={values[d.key] ?? ''} />
    {/each}
    {#if tokenIssued}
      <div class="token-info-row">
        <p class="token-info-text">Signed in to TheTVDB {issuedText}.</p>
        <button type="button" class="btn btn-muted btn-sm" onclick={clearToken}>Sign in again</button>
      </div>
    {/if}
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
