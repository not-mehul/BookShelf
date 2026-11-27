<script lang="ts">
  import { importJson } from '../../export/json';
  import { importCatalogExport, type CatalogSource } from '../../export/catalog-import';
  import { shelf } from '../../state/shelf.svelte';
  import { messageOf } from '../../util/errors';
  import { lacksMatch } from '../../api/match';
  import { refreshTodo } from '../../api/refresh';
  import { findDuplicates, markNotDuplicates, mergeDuplicate } from '../../util/duplicates';
  import { plural, TYPE_NOUN } from '../../util/labels';
  import { ui } from '../../state/ui.svelte';

  // Restore, import, refresh and tidy: one settings row each (style.md §8.17).
  let notice = $state<{ text: string; kind: 'ok' | 'err' } | null>(null);
  let busy = $state<'json' | 'catalog' | null>(null);
  let catalogInput = $state<HTMLInputElement>();
  let jsonInput = $state<HTMLInputElement>();

  // Inline status line (the Android WebView has no window.alert).
  const say = (text: string, kind: 'ok' | 'err' = 'ok') => (notice = { text, kind });

  // Read a chosen file and import it.
  async function restore(input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file) return;
    busy = 'json';
    try {
      const { imported, skippedInvalid } = await importJson(await file.text());
      const skipped = skippedInvalid ? `, left out ${skippedInvalid} that couldn’t be read` : '';
      say(`Imported ${imported} entries${skipped}.`);
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
      const covers = r.added ? ' Library refresh, below, finds their covers and details.' : '';
      say(`From ${SOURCE_NAME[r.source]}: ${parts.join(', ')}.${covers}`);
      shelf.changed();
    } catch (err) {
      say('Import failed: ' + messageOf(err), 'err');
    } finally {
      busy = null;
      input.value = '';
    }
  }

  // Covers, synopses and details missing anywhere on the shelf.
  const lacking = $derived(refreshTodo(shelf.entries).length);

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
    [TYPE_NOUN[e.type], e.creators?.[0], e.year, lacksMatch(e) ? 'not matched' : 'matched']
      .filter(Boolean)
      .join(' · ');
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
  onchange={(ev) => restore(ev.currentTarget)}
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
    'Restore a backup',
    'A BookShelf backup file. Restoring the same file again never duplicates entries.',
    busy === 'json' ? 'Restoring…' : 'Restore',
    () => jsonInput?.click()
  )}
  {@render row(
    'Import from Goodreads, StoryGraph or Letterboxd',
    'Pick the CSV, or Letterboxd’s zip as it is. Anything already here only gains what it was missing.',
    busy === 'catalog' ? 'Importing…' : 'Import',
    () => catalogInput?.click()
  )}
  {@render row(
    'Library refresh',
    lacking
      ? `${plural(lacking, 'entry is', 'entries are')} missing a cover, synopsis or details. Find matches and choose what to fill in.`
      : 'Everything on the shelf has its cover, synopsis and details.',
    'Refresh',
    () => ui.open({ kind: 'refresh' })
  )}
  <div class="settings-row">
    <div class="settings-row-text">
      <div class="settings-row-label">Duplicate check</div>
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
    <ul class="dup-list" aria-label="Likely duplicates">
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
