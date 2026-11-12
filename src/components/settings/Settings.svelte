<script lang="ts">
  import { EGGS, eggsFound } from '../../util/delight';
  import { importMarkdown } from '../../export/import';
  import { importJson, saveAndShareJson } from '../../export/json';
  import { isNativeShell } from '../../platform/native';
  import { shelf } from '../../state/shelf.svelte';
  import { syncSupported } from '../../sync/sync';
  import { messageOf } from '../../util/errors';
  import { getSetting, removeSetting } from '../../util/settings';
  import { useModalFocus } from '../Modal.svelte';
  import Icon from '../Icon.svelte';
  import ModalHead from '../ModalHead.svelte';
  import SettingField from './SettingField.svelte';
  import SyncSection from './SyncSection.svelte';
  import { setTheme, theme, type ThemeChoice } from '../../platform/theme.svelte';
  import Segmented from '../Segmented.svelte';

  type Def = { key: string; label: string; hint: string; type: 'password' | 'url' };
  const TVDB: Def[] = [
    {
      key: 'tvdb_api_key',
      label: 'API key',
      hint: 'Your project key from thetvdb.com.',
      type: 'password'
    },
    {
      key: 'tvdb_pin',
      label: 'Subscriber PIN',
      hint: 'Only for keys funded by subscriber PINs.',
      type: 'password'
    },
    {
      key: 'tvdb_proxy_url',
      label: 'Proxy URL (optional)',
      hint: 'A BookShelf proxy (proxy/ in the repo), instead of a key on this device.',
      type: 'url'
    },
    {
      key: 'tvdb_proxy_token',
      label: 'Proxy access token',
      hint: 'Only if the proxy was deployed with a PROXY_TOKEN.',
      type: 'password'
    }
  ];
  const GOOGLE: Def = {
    key: 'google_books_api_key',
    label: 'API key (optional)',
    hint: 'Book search works without one; a key raises the daily limit.',
    type: 'password'
  };
  const CORS: Def = {
    key: 'cors_proxy',
    label: 'CORS proxy',
    hint: 'In a plain browser, TheTVDB blocks cross-origin requests; a CORS proxy you trust gets around it. The Android app needs none.',
    type: 'url'
  };

  const native = isNativeShell();
  let values = $state<Record<string, string> | null>(null);
  let tokenIssued = $state(0);
  let notice = $state<{ text: string; kind: 'ok' | 'err' } | null>(null);
  let busy = $state<'backup' | 'json' | 'md' | null>(null);
  let jsonInput = $state<HTMLInputElement>();
  let mdInput = $state<HTMLInputElement>();
  const settleFocus = useModalFocus();

  // Inline status line (the Android WebView has no window.alert).
  const say = (text: string, kind: 'ok' | 'err' = 'ok') => (notice = { text, kind });

  $effect(() => {
    void (async () => {
      const keys = [...TVDB, GOOGLE, CORS].map((d) => d.key);
      const loaded = await Promise.all(keys.map((k) => getSetting(k, '')));
      tokenIssued = parseInt(await getSetting('tvdb_token_issued', '0'), 10) || 0;
      values = Object.fromEntries(keys.map((k, i) => [k, loaded[i] ?? '']));
      settleFocus();
    })();
  });

  // A group that's already set up starts folded, showing that it is.
  const tvdbReady = $derived(Boolean(values?.tvdb_api_key || values?.tvdb_proxy_url));
  const googleReady = $derived(Boolean(values?.google_books_api_key));

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

  async function backup() {
    busy = 'backup';
    try {
      const { method, filename } = await saveAndShareJson();
      say(method === 'native' ? 'Backup shared.' : `Downloaded ${filename}.`);
    } catch (err) {
      say('Backup failed: ' + messageOf(err), 'err');
    } finally {
      busy = null;
    }
  }

  // Read a chosen file and import it.
  async function importFile(input: HTMLInputElement, kind: 'json' | 'md') {
    const file = input.files?.[0];
    if (!file) return;
    busy = kind;
    try {
      const text = await file.text();
      if (kind === 'json') {
        const { imported, skippedExisting } = await importJson(text);
        say(`Imported ${imported} entries${skippedExisting ? `, skipped ${skippedExisting} existing` : ''}.`);
      } else {
        say(`Imported ${await importMarkdown(text)} entries from Markdown.`);
      }
      shelf.changed();
    } catch (err) {
      say('Import failed: ' + messageOf(err), 'err');
    } finally {
      busy = null;
      input.value = '';
    }
  }

  const THEMES: { value: ThemeChoice; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'dark', label: 'Dusk' },
    { value: 'light', label: 'Dawn' }
  ];
</script>

<ModalHead eyebrow="Settings" title="Preferences" />

<div class="settings-modal-body">
  <section class="settings-group" aria-labelledby="set-appearance">
    <h3 class="settings-section-heading" id="set-appearance">Appearance</h3>
    <div class="theme-setting-row">
      <div class="theme-setting-text">
        <div class="theme-setting-label" id="themeLabel">Theme</div>
        <div class="theme-setting-sub">System follows your device.</div>
      </div>
      <Segmented
        options={THEMES}
        value={theme.choice}
        label="Theme"
        onchange={(choice) => void setTheme(choice)}
      />
    </div>
  </section>

  {#if values}
    <section class="settings-group" aria-labelledby="set-search">
      <h3 class="settings-section-heading" id="set-search">Search</h3>

      <details class="settings-fold" open={!tvdbReady}>
        <summary>
          <span class="settings-fold-name">Movies and TV <span class="settings-fold-via">TheTVDB</span></span>
          <span class="settings-fold-state" class:is-ready={tvdbReady}
            >{tvdbReady ? 'Set up' : 'Not set up'}</span
          >
        </summary>
        <div class="settings-fold-body">
          {#each TVDB as d (d.key)}
            <SettingField {...d} initial={values[d.key] ?? ''} />
          {/each}
          <div class="token-info-row">
            <p class="token-info-text">Sign-in token: <strong>{issuedText}</strong></p>
            <button type="button" class="btn btn-muted btn-sm" onclick={clearToken}>Clear</button>
          </div>
        </div>
      </details>

      <details class="settings-fold" open={!googleReady && !tvdbReady}>
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

      {#if !native}
        <details class="settings-fold" open={!tvdbReady}>
          <summary>
            <span class="settings-fold-name">Browser only</span>
            <span class="settings-fold-state" class:is-ready={Boolean(values[CORS.key])}
              >{values[CORS.key] ? 'Proxy set' : 'Optional'}</span
            >
          </summary>
          <div class="settings-fold-body">
            <SettingField {...CORS} initial={values[CORS.key] ?? ''} />
          </div>
        </details>
      {/if}
    </section>

    {#if syncSupported()}
      <section class="settings-group">
        <SyncSection />
      </section>
    {/if}

    <section class="settings-group" aria-labelledby="set-data">
      <h3 class="settings-section-heading" id="set-data">Your data</h3>
      <input
        bind:this={jsonInput}
        type="file"
        accept=".json,application/json"
        hidden
        onchange={(ev) => importFile(ev.currentTarget, 'json')}
      />
      <input
        bind:this={mdInput}
        type="file"
        accept=".md,text/markdown"
        hidden
        onchange={(ev) => importFile(ev.currentTarget, 'md')}
      />
      <div class="settings-data-row">
        <button type="button" class="btn btn-primary" disabled={busy !== null} onclick={backup}
          ><Icon name="download" /> <span>Back up</span></button
        >
        <button
          type="button"
          class="btn btn-muted"
          disabled={busy !== null}
          onclick={() => jsonInput?.click()}
        >
          {busy === 'json' ? 'Restoring…' : 'Restore'}
        </button>
      </div>
      <p class="field-hint">
        A backup is one JSON file with everything, covers included. Restoring it again never duplicates
        entries.
      </p>
      <button
        type="button"
        class="settings-text-link"
        disabled={busy !== null}
        onclick={() => mdInput?.click()}
      >
        {busy === 'md' ? 'Importing…' : 'Import an older Markdown export'}
      </button>
      <div
        class="settings-notice {notice ? `settings-notice-${notice.kind}` : ''}"
        role="status"
        aria-live="polite"
      >
        {notice?.text ?? ''}
      </div>
    </section>

    <section class="settings-group" aria-labelledby="set-about">
      <h3 class="settings-section-heading" id="set-about">About</h3>
      <p class="field-hint" id="eggCount">Easter eggs: {eggsFound()} of {EGGS.length} found</p>
      <p class="field-hint settings-footnote">
        <em>Private.</em> Your shelf lives on this device. Searches go to the services above, and nothing else leaves
        it.
      </p>
    </section>
  {/if}
</div>

<style>
  .settings-group + .settings-group {
    margin-top: 2.25rem;
  }
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
    color: var(--text-faint);
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
  .settings-data-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }
  .settings-text-link {
    margin-top: var(--space-2);
    padding: 0;
    font-family: var(--font-serif);
    font-style: italic;
    font-size: 0.875rem;
    color: var(--text-dim);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .settings-text-link:hover:not(:disabled) {
    color: var(--text-heading);
  }
  .settings-footnote {
    margin-top: var(--space-2);
  }
  .settings-footnote em {
    color: var(--accent-amber);
  }
</style>
