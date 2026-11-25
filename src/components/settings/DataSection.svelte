<script lang="ts">
  import { importMarkdown } from '../../export/import';
  import { importJson, saveAndShareJson } from '../../export/json';
  import { importCatalogExport, type CatalogSource } from '../../export/catalog-import';
  import { shelf } from '../../state/shelf.svelte';
  import { backupToDocuments, lastBackupAt } from '../../sync/auto-backup';
  import { messageOf } from '../../util/errors';
  import { autoMatchAll, lacksMatch } from '../../api/match';
  import { findDuplicates, markNotDuplicates, mergeDuplicate } from '../../util/duplicates';
  import { plural, TYPE_NOUN } from '../../util/labels';
  import { ui } from '../../state/ui.svelte';

  // Back up, restore and import: one settings row each (style.md §8.17).
  let notice = $state<{ text: string; kind: 'ok' | 'err' } | null>(null);
  let busy = $state<'backup' | 'json' | 'md' | 'catalog' | 'weekly' | 'match' | null>(null);
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
      const covers = r.added ? ' Find covers and details below fills in their covers.' : '';
      say(`From ${SOURCE_NAME[r.source]}: ${parts.join(', ')}.${covers}`);
      shelf.changed();
    } catch (err) {
      say('Import failed: ' + messageOf(err), 'err');
    } finally {
      busy = null;
      input.value = '';
    }
  }

  // Covers and details for entries from imports or the manual form.
  const lacking = $derived(shelf.entries.filter(lacksMatch).length);
  async function matchAll() {
    busy = 'match';
    say('Looking for matches…');
    try {
      const r = await autoMatchAll((done, total) => say(`Looking for matches: ${done} of ${total}…`));
      const parts = [`Matched ${plural(r.matched, 'entry', 'entries')}.`];
      if (r.left.length)
        parts.push(
          `${plural(r.left.length, 'entry', 'entries')} had no sure match: open each and use Find a match.`
        );
      if (r.stopped) parts.push(`Stopped early: ${r.stopped}`);
      say(parts.join(' '), r.stopped ? 'err' : 'ok');
      shelf.changed();
    } catch (err) {
      say('Matching failed: ' + messageOf(err), 'err');
    } finally {
      busy = null;
    }
  }

  // Likely copies of one thing, to merge or keep apart.
  let reviewing = $state(false);
  let dismissedNow = $state(0);
  const pairs = $derived((void dismissedNow, findDuplicates(shelf.entries)));
  async function merge(keepId: string, dropId: string, title: string) {
    try {
      await mergeDuplicate(keepId, dropId);
      shelf.changed();
      ui.notify(`Merged the two copies of ${title}.`, 'success');
    } catch (err) {
      say('Merge failed: ' + messageOf(err), 'err');
    }
  }
  function keepBoth(a: string, b: string) {
    markNotDuplicates(a, b);
    dismissedNow++;
  }
  const describe = (e: import('../../types').CatalogEntry) =>
    [TYPE_NOUN[e.type], e.creators?.[0], e.year, e.sourceId && !e.needsMatch ? 'matched' : 'not matched']
      .filter(Boolean)
      .join(' · ');

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
  {@render row(
    'Find covers and details',
    lacking
      ? `${plural(lacking, 'entry has', 'entries have')} no catalog match yet. Matches the sure ones; nothing you wrote changes.`
      : 'Everything on the shelf is matched to the catalog.',
    busy === 'match' ? 'Matching…' : 'Match',
    () => void matchAll()
  )}
  <div class="settings-row">
    <div class="settings-row-text">
      <div class="settings-row-label">Possible duplicates</div>
      <div class="field-hint">
        {pairs.length
          ? `${plural(pairs.length, 'pair looks', 'pairs look')} like the same thing twice.`
          : 'No copies of the same thing found.'}
      </div>
    </div>
    <button
      type="button"
      class="btn btn-muted btn-sm"
      disabled={busy !== null || !pairs.length}
      aria-expanded={reviewing}
      onclick={() => (reviewing = !reviewing)}>{reviewing ? 'Done' : 'Review'}</button
    >
  </div>
  {#if reviewing && pairs.length}
    <ul class="dup-list" aria-label="Possible duplicates">
      {#each pairs as [keep, drop] (keep.id + drop.id)}
        <li class="dup-pair">
          <div class="dup-title">{keep.title}</div>
          <div class="field-hint">Keeps: {describe(keep)}</div>
          <div class="field-hint">
            Folds in: {describe(drop)}{drop.title !== keep.title ? ` (“${drop.title}”)` : ''}
          </div>
          <div class="dup-actions">
            <button type="button" class="btn btn-muted btn-sm" onclick={() => keepBoth(keep.id, drop.id)}
              >Keep both</button
            >
            <button
              type="button"
              class="btn btn-primary btn-sm"
              aria-label="Merge the two copies of {keep.title}"
              onclick={() => void merge(keep.id, drop.id, keep.title)}>Merge</button
            >
          </div>
        </li>
      {/each}
    </ul>
  {/if}
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
  .dup-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .dup-pair {
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--border-faint);
  }
  .dup-title {
    font-family: var(--font-serif);
    font-size: 1rem;
    color: var(--text-heading);
  }
  .dup-pair .field-hint {
    margin: var(--space-1) 0 0;
  }
  .dup-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }
</style>
