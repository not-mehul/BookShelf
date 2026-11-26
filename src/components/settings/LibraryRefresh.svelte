<script lang="ts">
  // Library refresh: checks every entry missing a cover, synopsis, details or a
  // catalog match, then lists what it found. Sure matches start ticked; for
  // the rest the user picks the right one, searches, or leaves it as it is.
  // Update fills in the ticked ones, and only what each was missing.
  import { untrack } from 'svelte';
  import { matchEntry } from '../../api/match';
  import {
    MISSING_LABEL,
    markChecked,
    missingParts,
    propose,
    refreshFills,
    refreshTodo,
    type Missing
  } from '../../api/refresh';
  import { isTmdbConfigured } from '../../api/tmdb';
  import { thumbnailUrl } from '../../db/database';
  import { shelf } from '../../state/shelf.svelte';
  import { ui } from '../../state/ui.svelte';
  import type { CatalogEntry, SearchHit } from '../../types';
  import { messageOf } from '../../util/errors';
  import { plural, TYPE_ICON, TYPE_SHORT } from '../../util/labels';
  import CoverImage from '../CoverImage.svelte';
  import MatchEntry from '../entry/MatchEntry.svelte';
  import Icon from '../Icon.svelte';
  import ModalHead from '../ModalHead.svelte';
  import PlaceholderCover from '../PlaceholderCover.svelte';

  type Status = 'waiting' | 'sure' | 'choose' | 'none' | 'no-tmdb' | 'done' | 'left';
  interface Row {
    entry: CatalogEntry;
    missing: Missing[];
    status: Status;
    hits: SearchHit[];
    /** The match it will take, if ticked. */
    pick: SearchHit | null;
    on: boolean;
    /** Showing the other hits for a sure match. */
    open: boolean;
  }

  const todo = untrack(() => refreshTodo(shelf.entries));
  let rows = $state<Row[]>(
    todo.map((entry) => ({
      entry,
      missing: missingParts(entry),
      status: 'waiting',
      hits: [],
      pick: null,
      on: false,
      open: false
    }))
  );

  let phase = $state<'checking' | 'review' | 'updating'>('checking');
  let checked = $state(0);
  let updatedCount = $state(0);
  let updating = $state({ done: 0, total: 0 });
  let current = $state('');
  let stopNote = $state('');
  let stopAsked = false;
  /** The row being searched by hand (Find a match, in place of the list). */
  let searching = $state<Row | null>(null);
  let alive = true;

  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function check() {
    const tmdb = await isTmdbConfigured();
    for (const row of rows) {
      if (!alive) return;
      if (stopAsked) {
        stopNote = `Stopped after ${checked} of ${rows.length}.`;
        break;
      }
      current = row.entry.title;
      if (row.entry.type !== 'book' && !tmdb) {
        row.status = 'no-tmdb';
        checked++;
        continue;
      }
      try {
        const p = await propose($state.snapshot(row.entry) as CatalogEntry);
        if (p.kind === 'sure') Object.assign(row, { status: 'sure', hits: p.hits, pick: p.hit, on: true });
        else if (p.kind === 'choose') Object.assign(row, { status: 'choose', hits: p.hits });
        else if (p.kind === 'none') row.status = 'none';
        else {
          // Matched, and the catalog has nothing more: don't ask again.
          markChecked($state.snapshot(row.entry) as CatalogEntry);
          row.status = 'left';
        }
      } catch (err) {
        // A catalog stopped answering (a limit, or offline): try the rest later.
        stopNote = `Stopped after ${checked} of ${rows.length}: ${messageOf(err)}`;
        break;
      }
      checked++;
      await pause(200);
    }
    current = '';
    phase = 'review';
  }

  $effect(() => {
    untrack(() => void check());
    return () => {
      alive = false;
    };
  });

  const group = (s: Status) => rows.filter((r) => r.status === s);
  const ready = $derived(
    rows.filter((r) => r.on && r.pick && (r.status === 'sure' || r.status === 'choose'))
  );
  const counts = $derived({
    sure: group('sure').length,
    choose: group('choose').length,
    none: group('none').length,
    noTmdb: group('no-tmdb').length
  });

  function choose(row: Row, hit: SearchHit) {
    row.pick = hit;
    row.on = true;
  }

  function leave(row: Row) {
    markChecked($state.snapshot(row.entry) as CatalogEntry);
    row.status = 'left';
    row.on = false;
  }

  async function update() {
    const list = [...ready];
    phase = 'updating';
    updating = { done: 0, total: list.length };
    for (const row of list) {
      try {
        const saved = await matchEntry(row.entry.id, $state.snapshot(row.pick!) as SearchHit);
        if (saved) markChecked(saved);
        row.status = 'done';
        row.on = false;
        updatedCount++;
      } catch (err) {
        ui.notify(`Couldn’t update ${row.entry.title}: ${messageOf(err)}`, 'error');
        break;
      }
      updating.done++;
    }
    shelf.changed();
    phase = 'review';
  }

  const pct = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 100);
  const entrySub = (e: CatalogEntry) =>
    [TYPE_SHORT[e.type], e.creators?.[0], e.year].filter(Boolean).join(' · ');
  const hitSub = (h: SearchHit) => [h.creators.slice(0, 2).join(', '), h.year].filter(Boolean).join(' · ');
  const missingText = (m: Missing[]) => {
    const words = m.map((x) => MISSING_LABEL[x]);
    return words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}` : (words[0] ?? '');
  };
</script>

{#snippet entryThumb(entry: CatalogEntry)}
  <div class="refresh-thumb">
    <CoverImage src={thumbnailUrl(entry) || entry.thumbnailUrl}>
      {#snippet fallback()}<PlaceholderCover {entry} compact />{/snippet}
    </CoverImage>
  </div>
{/snippet}

{#snippet hitRow(row: Row, hit: SearchHit)}
  <button
    type="button"
    class="refresh-hit"
    role="radio"
    aria-checked={row.pick === hit && row.on}
    onclick={() => choose(row, hit)}
  >
    <div class="refresh-thumb is-small">
      <CoverImage src={hit.thumbnailUrl}>
        {#snippet fallback()}<div class="add-result-thumb-ph">
            <Icon name={TYPE_ICON[hit.type]} />
          </div>{/snippet}
      </CoverImage>
    </div>
    <span class="refresh-hit-text">
      <span class="refresh-hit-title">{hit.title}</span>
      {#if hitSub(hit)}<span class="refresh-sub">{hitSub(hit)}</span>{/if}
    </span>
    <span class="refresh-radio" aria-hidden="true"></span>
  </button>
{/snippet}

{#snippet item(row: Row)}
  <li class="refresh-item">
    <div class="refresh-head">
      {@render entryThumb(row.entry)}
      <div class="refresh-text">
        <div class="refresh-title">{row.entry.title}</div>
        {#if entrySub(row.entry)}<div class="refresh-sub">{entrySub(row.entry)}</div>{/if}
        <div class="refresh-missing">Missing its {missingText(row.missing)}</div>
      </div>
      {#if row.status === 'sure' || (row.status === 'choose' && row.pick)}
        <label class="refresh-tick">
          <input type="checkbox" class="check" bind:checked={row.on} aria-label="Update {row.entry.title}" />
        </label>
      {/if}
    </div>

    {#if row.status === 'sure' && row.pick && !row.open}
      <div class="refresh-match">
        <Icon name="chevronRight" />
        <div class="refresh-match-text">
          <span class="refresh-hit-title">{row.pick.title}</span>
          <span class="refresh-sub"
            >Fills in {refreshFills(row.entry, row.pick).join(', ').toLowerCase()}</span
          >
        </div>
      </div>
    {/if}
    {#if (row.status === 'sure' && row.open) || row.status === 'choose'}
      <div class="refresh-hits" role="radiogroup" aria-label="Matches for {row.entry.title}">
        {#each row.hits as hit, i (i)}{@render hitRow(row, hit)}{/each}
      </div>
    {/if}
    {#if row.status === 'none'}
      <p class="field-hint refresh-none">Nothing found under that title.</p>
    {/if}

    <div class="refresh-actions">
      {#if row.status === 'sure'}
        <button type="button" class="btn btn-muted btn-sm" onclick={() => (row.open = !row.open)}>
          {row.open ? 'Hide others' : 'Not this one?'}
        </button>
      {/if}
      <button type="button" class="btn btn-muted btn-sm" onclick={() => (searching = row)}>Search</button>
      <button type="button" class="btn btn-muted btn-sm" onclick={() => leave(row)}>Leave as is</button>
    </div>
  </li>
{/snippet}

{#if searching}
  {@const row = searching}
  <MatchEntry
    entry={$state.snapshot(row.entry) as CatalogEntry}
    onback={() => (searching = null)}
    onmatched={(saved) => {
      markChecked(saved);
      row.status = 'done';
      row.on = false;
      updatedCount++;
      searching = null;
      shelf.changed();
    }}
  />
{:else}
  <ModalHead eyebrow="Your data" title="Library refresh" onback={() => ui.open({ kind: 'settings' })} />

  <div class="refresh-body">
    {#if phase === 'checking'}
      <div class="refresh-progress">
        <div class="refresh-progress-line">
          <span>Checking {Math.min(checked + 1, rows.length)} of {rows.length}</span>
          <button type="button" class="link-button" onclick={() => (stopAsked = true)}>Stop</button>
        </div>
        <div
          class="refresh-bar"
          role="progressbar"
          aria-label="Checking the library"
          aria-valuemin="0"
          aria-valuemax={rows.length}
          aria-valuenow={checked}
        >
          <span style:width="{pct(checked, rows.length)}%"></span>
        </div>
        <div class="refresh-current">{current}</div>
      </div>
    {:else if phase === 'updating'}
      <div class="refresh-progress">
        <div class="refresh-progress-line">
          <span>Updating {Math.min(updating.done + 1, updating.total)} of {updating.total}</span>
        </div>
        <div
          class="refresh-bar"
          role="progressbar"
          aria-label="Updating entries"
          aria-valuemin="0"
          aria-valuemax={updating.total}
          aria-valuenow={updating.done}
        >
          <span style:width="{pct(updating.done, updating.total)}%"></span>
        </div>
      </div>
    {:else}
      <p class="refresh-summary" role="status">
        {#if !rows.length}
          Everything on the shelf has its cover, synopsis and details.
        {:else}
          {[
            updatedCount ? `Updated ${plural(updatedCount, 'entry', 'entries')}.` : '',
            `Checked ${plural(checked, 'entry', 'entries')}.`,
            stopNote
          ]
            .filter(Boolean)
            .join(' ')}
        {/if}
      </p>
    {/if}

    {#if counts.sure}
      <section aria-labelledby="refresh-sure">
        <h3 class="settings-section-heading" id="refresh-sure">Ready to update · {counts.sure}</h3>
        <ul class="refresh-list">
          {#each rows as row (row.entry.id)}{#if row.status === 'sure'}{@render item(row)}{/if}{/each}
        </ul>
      </section>
    {/if}
    {#if counts.choose}
      <section aria-labelledby="refresh-choose">
        <h3 class="settings-section-heading" id="refresh-choose">Pick the right one · {counts.choose}</h3>
        <ul class="refresh-list">
          {#each rows as row (row.entry.id)}{#if row.status === 'choose'}{@render item(row)}{/if}{/each}
        </ul>
      </section>
    {/if}
    {#if counts.none}
      <section aria-labelledby="refresh-none">
        <h3 class="settings-section-heading" id="refresh-none">Not found · {counts.none}</h3>
        <ul class="refresh-list">
          {#each rows as row (row.entry.id)}{#if row.status === 'none'}{@render item(row)}{/if}{/each}
        </ul>
      </section>
    {/if}
    {#if counts.noTmdb}
      <div class="notice refresh-notice">
        <Icon name="settings" />
        <div class="notice-text">
          <span class="notice-title"
            >{plural(counts.noTmdb, 'film or show', 'films and shows')} need a TMDB key.</span
          >
          <span class="notice-detail">Add your free key in Settings → Search, then refresh again.</span>
        </div>
      </div>
    {/if}
  </div>

  {#if counts.sure || counts.choose}
    <div class="refresh-footer">
      <button
        type="button"
        class="btn btn-primary"
        disabled={phase !== 'review' || !ready.length}
        onclick={update}
      >
        {ready.length ? `Update ${plural(ready.length, 'entry', 'entries')}` : 'Tick the ones to update'}
      </button>
    </div>
  {/if}
{/if}
