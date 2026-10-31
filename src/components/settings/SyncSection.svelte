<script lang="ts">
  import {
    chooseSyncFolder,
    forgetSyncFolder,
    getSyncStatus,
    syncNow,
    type SyncStatus
  } from '../../sync/sync';
  import { shelf } from '../../state/shelf.svelte';
  import { messageOf } from '../../util/errors';
  import { getSetting } from '../../util/settings';
  import SettingField from './SettingField.svelte';

  // Encrypted folder sync: folder picker, passphrase, status and actions.
  let status = $state.raw<SyncStatus | undefined>(undefined);
  let passphrase = $state<string | null>(null);
  let notice = $state<{ text: string; kind: 'ok' | 'err' } | null>(null);
  let busy = $state(false);

  const say = (text: string, kind: 'ok' | 'err' = 'ok') => (notice = { text, kind });

  async function refresh() {
    status = await getSyncStatus();
  }

  $effect(() => {
    void (async () => {
      passphrase = await getSetting('sync_passphrase');
      const lastError = await getSetting('sync_last_error');
      const last = await getSetting('sync_last');
      if (lastError) say(`Last sync failed: ${lastError}`, 'err');
      else if (last) say(`Last synced ${new Date(last).toLocaleString()}`);
      await refresh();
    })();
  });

  async function choose() {
    busy = true;
    try {
      await chooseSyncFolder();
    } catch (err) {
      say(messageOf(err), 'err');
    }
    await refresh();
    busy = false;
  }

  async function sync() {
    busy = true;
    say('Syncing…');
    try {
      const r = await syncNow();
      say(
        r.pulled || r.removed
          ? `Synced — ${r.pulled} updated, ${r.removed} removed on this device.`
          : 'Synced — already up to date.'
      );
      if (r.pulled || r.removed) void shelf.refresh();
    } catch (err) {
      say(messageOf(err), 'err');
    } finally {
      busy = false;
    }
  }

  async function stop() {
    await forgetSyncFolder();
    await refresh();
  }
</script>

<div class="sync-section">
  <div class="settings-section-heading">Sync</div>
  <p class="field-hint">
    Keeps an end-to-end encrypted copy of your shelf in a folder — e.g. one synced by Google Drive, Nextcloud
    or Syncthing — and merges changes from your other devices.
  </p>
  {#if status !== undefined && passphrase !== null}
    <div class="token-info-row">
      <p class="token-info-text">Folder: <strong>{status ? status.folderName : 'not chosen'}</strong></p>
      <button type="button" class="btn btn-muted" disabled={busy} onclick={choose}>
        {status ? 'Change folder' : 'Choose folder'}
      </button>
    </div>
    <SettingField
      key="sync_passphrase"
      label="Sync passphrase"
      hint="Use the same passphrase on every device. It encrypts the sync file and cannot be recovered if lost."
      type="password"
      initial={passphrase}
    />
    {#if status}
      <div class="settings-btn-row">
        <button type="button" class="btn btn-primary" disabled={busy} onclick={sync}>Sync now</button>
        <button type="button" class="btn btn-muted" onclick={stop}>Stop syncing</button>
      </div>
    {/if}
  {/if}
  <div
    class="settings-notice {notice ? `settings-notice-${notice.kind}` : ''}"
    role="status"
    aria-live="polite"
  >
    {notice?.text ?? ''}
  </div>
</div>
