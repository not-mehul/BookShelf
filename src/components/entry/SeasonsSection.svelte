<script lang="ts">
  // A show, watched by season: one toggle per season, the next one to watch,
  // and (in the Android app) new-episode alerts. Episodes are too fine a grain
  // to keep up with; a season's toggle marks all of its aired episodes.
  import { isNativeShell } from '../../platform/native';
  import { localDate, seasonProgress, type SeasonState } from '../../util/episodes';
  import { markEpisodes } from '../../util/mark-episodes';
  import { plural } from '../../util/labels';
  import { ui } from '../../state/ui.svelte';
  import type { CatalogEntry } from '../../types';
  import Icon from '../Icon.svelte';
  import ReminderToggle from './ReminderToggle.svelte';

  interface Props {
    entry: CatalogEntry;
    update: (change: (draft: CatalogEntry) => void | Promise<void>) => Promise<void>;
  }

  let { entry, update }: Props = $props();
  const today = localDate();
  const p = $derived(seasonProgress(entry, today));
  const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const fmt = (ymd: string | null) => (ymd ? dateFmt.format(new Date(`${ymd}T12:00:00`)) : '');

  // Saving happens on a copy; markEpisodes saves it, update() saves again
  // (cheap) and shows the result.
  const mark = (s: SeasonState, on: boolean) =>
    update((d) =>
      markEpisodes(
        d,
        s.aired.map((ep) => ep.id),
        on
      )
    );

  // Every aired season at once, for a show with more than one. Tapping it again
  // once they are all watched clears them. Either way Undo puts the entry back
  // exactly as it was, status and dates included.
  const allWatched = $derived(p.aired > 0 && p.watched === p.aired);
  async function markAll() {
    const before = $state.snapshot(entry) as CatalogEntry;
    const on = !allWatched;
    const changed = on ? p.aired - p.watched : p.watched;
    const ids = p.seasons.flatMap((s) => s.aired.map((ep) => ep.id));
    await update((d) => markEpisodes(d, ids, on));
    ui.notify(
      on ? `Marked ${plural(changed, 'season')} watched.` : `Cleared ${plural(changed, 'watched season')}.`,
      'info',
      {
        label: 'Undo',
        run: () =>
          void update((d) => {
            for (const key of Object.keys(d))
              if (!(key in before)) delete (d as unknown as Record<string, unknown>)[key];
            Object.assign(d, structuredClone(before));
          })
      }
    );
  }

  function meta(s: SeasonState) {
    if (!s.aired.length) return s.firstAired ? `Airs ${fmt(s.firstAired)}` : 'Not aired yet';
    const n = s.episodes.length;
    const year = s.firstAired?.slice(0, 4);
    const left = s.episodes.length - s.aired.length;
    return [`${n} episode${n === 1 ? '' : 's'}`, year, left ? `${left} still to air` : '']
      .filter(Boolean)
      .join(' · ');
  }
</script>

<div class="modal-section seasons-section">
  <div class="seasons-head">
    <div class="modal-section-label">Seasons</div>
    {#if p.aired > 1}
      <button
        type="button"
        class="btn-icon seasons-all"
        aria-pressed={allWatched}
        aria-label="All seasons watched"
        title={allWatched ? 'Clear every season' : 'Mark every season watched'}
        onclick={markAll}
      >
        <Icon name="checkAll" />
      </button>
    {/if}
  </div>

  <p class="seasons-summary">
    {p.watched} of {p.aired} season{p.aired === 1 ? '' : 's'} watched{p.next
      ? ` · next up: season ${p.next.season}`
      : p.upcoming && p.aired
        ? ` · season ${p.upcoming.season} is coming`
        : ''}
  </p>

  <ul class="season-list">
    {#each p.seasons as s (s.season)}
      <li>
        <button
          type="button"
          class="season-row"
          class:is-next={p.next?.season === s.season}
          aria-pressed={s.watched}
          disabled={!s.aired.length}
          onclick={() => mark(s, !s.watched)}
        >
          <span class="season-check" aria-hidden="true"><Icon name="check" /></span>
          <span class="season-text">
            <span class="season-name">Season {s.season}</span>
            <span class="season-meta">{meta(s)}</span>
          </span>
          {#if p.next?.season === s.season}<span class="season-next">Next</span>{/if}
        </button>
      </li>
    {/each}
  </ul>

  {#if isNativeShell()}
    <ReminderToggle {entry} {update} />
  {/if}
</div>

<style>
  .seasons-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: 0.875rem;
  }
  .seasons-head .modal-section-label {
    margin: 0;
  }
  /* A 44px target that overhangs the label's line instead of making it taller. */
  .seasons-all {
    margin: -12px -10px -12px 0;
    border: 1px solid var(--border);
  }
  .seasons-all :global(svg) {
    width: 20px;
    height: 20px;
  }
  .seasons-all:hover {
    color: var(--text-heading);
  }
  .seasons-all[aria-pressed='true'] {
    border-color: var(--accent-sage);
    background: var(--accent-sage);
    color: var(--on-accent);
  }
  .seasons-summary {
    margin: 0 0 var(--space-3);
    color: var(--text-body);
    font-size: 0.875rem;
  }
  .season-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .season-list li + li {
    border-top: 1px solid var(--border-faint);
  }
  .season-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    min-height: 56px;
    padding: var(--space-2) 0;
    text-align: left;
    color: var(--text-body);
  }
  .season-row:hover:not(:disabled) .season-name {
    color: var(--text-heading);
  }
  .season-row:disabled {
    cursor: default;
  }
  .season-check {
    display: grid;
    place-content: center;
    flex: none;
    width: 28px;
    height: 28px;
    border: 1px solid var(--border);
    border-radius: var(--corner-full);
    background: var(--input-bg);
    color: transparent;
    transition:
      background-color var(--spring-effects-fast-dur) var(--spring-effects-fast),
      border-color var(--spring-effects-fast-dur) var(--spring-effects-fast);
  }
  .season-check :global(svg) {
    width: 16px;
    height: 16px;
  }
  .season-row[aria-pressed='true'] .season-check {
    border-color: var(--accent-sage);
    background: var(--accent-sage);
    color: var(--on-accent);
  }
  .season-row.is-next .season-check {
    border-color: var(--accent-amber);
  }
  .season-row:disabled .season-check {
    border-style: dashed;
    background: transparent;
  }
  .season-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .season-name {
    font-family: var(--font-serif);
    font-size: 1.0625rem;
    color: var(--text-heading);
  }
  .season-row:disabled .season-name {
    color: var(--text-dim);
  }
  .season-meta {
    font-family: var(--font-mono);
    font-size: 0.6875rem;
    color: var(--text-dim);
  }
  .season-next {
    font-family: var(--font-mono);
    font-size: 0.625rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--accent-amber);
  }
</style>
