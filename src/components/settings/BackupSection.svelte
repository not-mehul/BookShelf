<script lang="ts">
  import {
    BACKUP_EVERY_KEY,
    chooseSyncFolder,
    forgetSyncFolder,
    getSyncStatus,
    readBackupEvery,
    syncNow,
    type BackupEvery,
    type SyncStatus
  } from '../../sync/sync';
  import { shelf } from '../../state/shelf.svelte';
  import { messageOf } from '../../util/errors';
  import { getSetting, setSetting } from '../../util/settings';
  import Segmented from '../Segmented.svelte';

  // The backup: one file in a folder that a cloud drive keeps, merged with
  // every device that backs up there. Its folder, schedule and a button to
  // back up now.

  // undefined until the shell answers; null when no folder is chosen.
  let status = $state.raw<SyncStatus | undefined>(undefined);
  let every = $state<BackupEvery>(readBackupEvery());
  let notice = $state<{ text: string; kind: 'ok' | 'err' } | null>(null);
  let busy = $state(false);

  const EVERY: { value: BackupEvery; label: string }[] = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'off', label: 'Off' }
  ];

  const say = (text: string, kind: 'ok' | 'err' = 'ok') => (notice = { text, kind });
  const when = (iso: string) =>
    new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  async function refresh() {
    status = await getSyncStatus();
  }

  $effect(() => {
    void (async () => {
      const lastError = await getSetting('sync_last_error');
      const last = await getSetting('sync_last');
      if (lastError) say(`The last backup failed: ${lastError}`, 'err');
      else if (last) say(`Last backed up ${when(last)}.`);
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

  async function backUp() {
    busy = true;
    say('Backing up…');
    try {
      const r = await syncNow();
      const brought = r.pulled + r.removed;
      say(
        brought
          ? `Backed up, and brought in ${brought === 1 ? 'a change' : `${brought} changes`} from your other devices.`
          : 'Backed up.'
      );
      if (brought) void shelf.refresh();
    } catch (err) {
      say(messageOf(err), 'err');
    } finally {
      busy = false;
    }
  }

  async function stop() {
    await forgetSyncFolder();
    await refresh();
    notice = null;
  }

  function schedule(next: BackupEvery) {
    every = next;
    void setSetting(BACKUP_EVERY_KEY, next);
  }
</script>

<div class="sync-section">
  <h3 class="settings-section-heading" id="set-backup">Backup</h3>
  <p class="field-hint">
    A copy of your shelf in a folder that Google Drive, Nextcloud or Syncthing keeps. Every device that backs
    up to the same folder stays in step. It’s a plain file: anyone who can open that folder can read it.
  </p>
  <div class="settings-rows">
    <div class="settings-row">
      <div class="settings-row-text">
        <div class="settings-row-label">Folder</div>
        <div class="field-hint">
          {status === undefined ? '…' : status ? status.folderName : 'Not chosen yet'}
        </div>
      </div>
      <button type="button" class="btn btn-muted btn-sm" disabled={busy} onclick={choose}>
        {status ? 'Change' : 'Choose'}
      </button>
    </div>
  </div>
  <div class="settings-stack">
    <div class="settings-row-label" id="backupEveryLabel">Back up automatically</div>
    <Segmented options={EVERY} value={every} label="Back up automatically" onchange={schedule} full />
    <p class="field-hint">
      {every === 'off'
        ? 'Only when you tap Back up now.'
        : 'When the app opens or comes back, if the last backup is older than that.'}
    </p>
  </div>
  {#if status}
    <div class="settings-actions">
      <button type="button" class="btn btn-muted" onclick={stop}>Stop backing up</button>
      <button type="button" class="btn btn-primary" disabled={busy} onclick={backUp}>Back up now</button>
    </div>
  {/if}
  <div
    class="settings-notice {notice ? `settings-notice-${notice.kind}` : ''}"
    role="status"
    aria-live="polite"
  >
    {notice?.text ?? ''}
  </div>
</div>
