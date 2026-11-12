<script lang="ts">
  // A show, watched by season: one toggle per season, the next one to watch,
  // and (in the Android app) new-episode alerts. Episodes are too fine a grain
  // to keep up with; a season's toggle marks all of its aired episodes.
  import { isNativeShell } from '../../platform/native';
  import { localDate, seasonProgress, type SeasonState } from '../../util/episodes';
  import { markEpisodes } from '../../util/mark-episodes';
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
  <div class="modal-section-label">Seasons</div>

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
