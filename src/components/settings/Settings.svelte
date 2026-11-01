<script lang="ts">
  import { importMarkdown } from '../../export/import';
  import { importJson, saveAndShareJson } from '../../export/json';
  import { isNativeShell } from '../../platform/native';
  import { shelf } from '../../state/shelf.svelte';
  import { syncSupported } from '../../sync/sync';
  import { messageOf } from '../../util/errors';
  import { getSetting, removeSetting } from '../../util/settings';
  import { useModalFocus } from '../Modal.svelte';
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
      hint: 'Project key from thetvdb.com — required for movie and TV search.',
      type: 'password'
    },
    {
      key: 'tvdb_pin',
      label: 'Subscriber PIN',
      hint: 'Your personal subscriber PIN. Leave blank if using a negotiated-license project key.',
      type: 'password'
    },
    {
      key: 'tvdb_proxy_url',
      label: 'Proxy URL (optional)',
      hint: 'Use a BookShelf TheTVDB proxy (see proxy/ in the repo) instead of entering an API key on this device.',
      type: 'url'
    },
    {
      key: 'tvdb_proxy_token',
      label: 'Proxy access token',
      hint: 'Only if your proxy was deployed with a PROXY_TOKEN.',
      type: 'password'
    }
  ];
  const GOOGLE: Def = {
    key: 'google_books_api_key',
    label: 'API key (optional)',
    hint: 'Raises the anonymous daily quota. Book search works without a key, but may rate-limit.',
    type: 'password'
  };
  const CORS: Def = {
    key: 'cors_proxy',
    label: 'CORS Proxy (Browser only)',
    hint: 'In a plain browser, TheTVDB blocks cross-origin requests. Set the base URL of a CORS proxy you trust/run to enable movie & TV search. The Android app does not need this. Leave blank otherwise.',
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
  <div class="settings-section-heading">Appearance</div>
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

  {#if values}
    <hr class="divider settings-divider" />
    <div class="settings-section-heading">TheTVDB</div>
    {#each TVDB as d (d.key)}
      <SettingField {...d} initial={values[d.key] ?? ''} />
    {/each}
    <div class="token-info-row">
      <p class="token-info-text">Token last refreshed: <strong>{issuedText}</strong></p>
      <button type="button" class="btn btn-muted" onclick={clearToken}>Clear cached token</button>
    </div>

    <hr class="divider settings-divider" />
    <div class="settings-section-heading">Google Books</div>
    <SettingField {...GOOGLE} initial={values[GOOGLE.key] ?? ''} />

    {#if !native}
      <hr class="divider settings-divider" />
      <div class="settings-section-heading">Browser Compatibility</div>
      <SettingField {...CORS} initial={values[CORS.key] ?? ''} />
    {/if}

    {#if syncSupported()}
      <hr class="divider settings-divider" />
      <SyncSection />
    {/if}

    <hr class="divider settings-divider" />
    <div class="settings-section-heading">Backup & Data</div>
    <p class="field-hint">
      JSON is a complete, lossless backup (covers included) and is safe to re-import. Markdown import is
      best-effort for older exports.
    </p>
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
    <div class="settings-btn-row">
      <button type="button" class="btn btn-primary" disabled={busy !== null} onclick={backup}
        >Export JSON backup</button
      >
      <button type="button" class="btn btn-muted" disabled={busy !== null} onclick={() => jsonInput?.click()}>
        {busy === 'json' ? 'Importing…' : 'Import JSON'}
      </button>
      <button type="button" class="btn btn-muted" disabled={busy !== null} onclick={() => mdInput?.click()}>
        {busy === 'md' ? 'Importing…' : 'Import Markdown'}
      </button>
    </div>
    <div
      class="settings-notice {notice ? `settings-notice-${notice.kind}` : ''}"
      role="status"
      aria-live="polite"
    >
      {notice?.text ?? ''}
    </div>
  {/if}
</div>

<style>
  .settings-divider {
    margin: 2rem 0;
  }
</style>
