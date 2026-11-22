<script lang="ts">
  import { importMarkdown } from '../../export/import';
  import { importJson, saveAndShareJson } from '../../export/json';
  import { importCatalogExport, type CatalogSource } from '../../export/catalog-import';
  import { shelf } from '../../state/shelf.svelte';
  import { backupToDocuments, lastBackupAt } from '../../sync/auto-backup';
  import { messageOf } from '../../util/errors';

  // Back up, restore and import: one settings row each (style.md §8.17).
  let notice = $state<{ text: string; kind: 'ok' | 'err' } | null>(null);
  let busy = $state<'backup' | 'json' | 'md' | 'catalog' | 'weekly' | null>(null);
  let catalogInput = $state<HTMLInputElement>();
  let lastWeekly = $state(lastBackupAt());
  let jsonInput = $state<HTMLInputElement>();
  let mdInput = $state<HTMLInputElement>();

  // Inline status line (the Android WebView has no window.alert).
  const say = (text: string, kind: 'ok' | 'err' = 'ok') => (notice = { text, kind });

  async function backup() {
    busy = 'backup';
    try {
      await saveAndShareJson();
      say('Backup shared.');
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
        const { imported, skippedExisting, skippedInvalid } = await importJson(text);
        const skipped = [
          skippedExisting ? `skipped ${skippedExisting} existing` : '',
          skippedInvalid ? `left out ${skippedInvalid} that couldn’t be read` : ''
        ].filter(Boolean);
        say(`Imported ${imported} entries${skipped.length ? `, ${skipped.join(', ')}` : ''}.`);
      } else {
        const { imported, skipped } = await importMarkdown(text);
        say(
          `Imported ${imported} entries from Markdown${skipped ? `, skipped ${skipped} already on the shelf` : ''}.`
        );
      }
      shelf.changed();
    } catch (err) {
      say('Import failed: ' + messageOf(err), 'err');
    } finally {
      busy = null;
      input.value = '';
    }
  }

  const SOURCE_NAME: Record<CatalogSource, string> = {
    goodreads: 'Goodreads',
    storygraph: 'StoryGraph',
    letterboxd: 'Letterboxd'
  };

  // Goodreads or StoryGraph's CSV, or Letterboxd's zip (or the CSVs inside it).
  async function importCatalog(input: HTMLInputElement) {
    const files = [...(input.files ?? [])];
    if (!files.length) return;
    busy = 'catalog';
    try {
      const r = await importCatalogExport(files);
      const parts = [r.added === 1 ? '1 new entry' : `${r.added} new entries`];
      if (r.updated) parts.push(`${r.updated} already here filled in`);
      if (r.unchanged) parts.push(`${r.unchanged} already here as they were`);
      say(`From ${SOURCE_NAME[r.source]}: ${parts.join(', ')}.`);
      shelf.changed();
    } catch (err) {
      say('Import failed: ' + messageOf(err), 'err');
    } finally {
      busy = null;
      input.value = '';
    }
  }

  async function weeklyNow() {
    busy = 'weekly';
    try {
      const where = await backupToDocuments();
      lastWeekly = lastBackupAt();
      say(`Backed up to ${where}.`);
    } catch (err) {
      say('Backup failed: ' + messageOf(err), 'err');
    } finally {
      busy = null;
    }
  }

  const lastWeeklyText = $derived(
    lastWeekly
      ? new Date(lastWeekly).toLocaleDateString(undefined, {
          weekday: 'short',
          day: 'numeric',
          month: 'short'
        })
      : 'not yet'
  );
</script>

{#snippet row(label: string, hint: string, action: string, run: () => void)}
  <div class="settings-row">
    <div class="settings-row-text">
      <div class="settings-row-label">{label}</div>
      <div class="field-hint">{hint}</div>
    </div>
    <button type="button" class="btn btn-muted btn-sm" disabled={busy !== null} onclick={run}>{action}</button
    >
  </div>
{/snippet}

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
<input
  bind:this={catalogInput}
  type="file"
  accept=".csv,text/csv,.zip,application/zip"
  multiple
  hidden
  onchange={(ev) => importCatalog(ev.currentTarget)}
/>
<!-- Settings rows (style.md §8.17): what it is and a hint, the action on the right. -->
<div class="settings-rows">
  {@render row(
    'Back up',
    'One file with everything, covers included.',
    busy === 'backup' ? 'Backing up…' : 'Back up',
    backup
  )}
  {@render row(
    'Restore a backup',
    'Restoring the same file again never duplicates entries.',
    busy === 'json' ? 'Restoring…' : 'Restore',
    () => jsonInput?.click()
  )}
  <div class="settings-row" id="weeklyBackup">
    <div class="settings-row-text">
      <div class="settings-row-label">Weekly backup</div>
      <div class="field-hint">
        To Documents/BookShelf/Backups, keeping the last five. Last: {lastWeeklyText}.
      </div>
    </div>
    <button type="button" class="btn btn-muted btn-sm" disabled={busy !== null} onclick={weeklyNow}>
      {busy === 'weekly' ? 'Backing up…' : 'Now'}
    </button>
  </div>
  {@render row(
    'Import from Goodreads, StoryGraph or Letterboxd',
    'Pick the CSV, or Letterboxd’s zip as it is. Anything already here only gains what it was missing.',
    busy === 'catalog' ? 'Importing…' : 'Import',
    () => catalogInput?.click()
  )}
  {@render row(
    'Import a Markdown export',
    'From an older BookShelf; the backup file keeps more.',
    busy === 'md' ? 'Importing…' : 'Import',
    () => mdInput?.click()
  )}
</div>
<div
  class="settings-notice {notice ? `settings-notice-${notice.kind}` : ''}"
  role="status"
  aria-live="polite"
>
  {notice?.text ?? ''}
</div>

<style>
  .settings-rows {
    border-top: 1px solid var(--border-faint);
  }
  .settings-row {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    min-height: 56px;
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--border-faint);
  }
  .settings-row-text {
    flex: 1;
    min-width: 0;
  }
  .settings-row-label {
    font-size: 0.9375rem;
    color: var(--text-heading);
  }
  .settings-row-text :global(.field-hint) {
    margin: var(--space-1) 0 0;
  }
  .settings-row .btn {
    flex: none;
  }
</style>
