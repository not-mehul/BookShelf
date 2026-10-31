<script lang="ts" module>
  import { SvelteSet } from 'svelte/reactivity';

  /** Seasons the user has expanded, per show (kept while the app runs). */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a plain lookup; the sets are reactive
  const openSeasons = new Map<string, SvelteSet<number>>();

  const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtDate = (ymd: string | null) => (ymd ? dateFmt.format(new Date(`${ymd}T12:00:00`)) : '');
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import { isNativeShell } from '../../platform/native';
  import { episodeCode, episodeProgress, hasAired, localDate, seasons } from '../../util/episodes';
  import { markEpisodes } from '../../util/mark-episodes';
  import type { CatalogEntry } from '../../types';
  import Icon from '../Icon.svelte';
  import ReminderToggle from './ReminderToggle.svelte';

  // Next up, per-episode checkboxes by season, and (in the Android app)
  // new-episode reminders.
  interface Props {
    entry: CatalogEntry;
    update: (change: (draft: CatalogEntry) => void | Promise<void>) => Promise<void>;
  }

  let { entry, update }: Props = $props();
  const today = localDate();
  const p = $derived(episodeProgress(entry, today));
  const watched = $derived(new Set(entry.watchedEpisodes || []));
  const bySeason = $derived(
    seasons(entry).map(({ season, episodes }) => {
      const aired = episodes.filter((ep) => hasAired(ep, today));
      return { season, episodes, aired, done: aired.filter((ep) => watched.has(ep.id)).length };
    })
  );

  const open = untrack(() => {
    let set = openSeasons.get(entry.id);
    if (!set) openSeasons.set(entry.id, (set = new SvelteSet()));
    return set;
  });
  // Open the season holding "next up" until the user opens one themselves.
  const initialSeason = $derived(open.size ? null : (p.next?.s ?? null));

  // Saving happens on a copy; markEpisodes saves it, update() saves again
  // (cheap) and shows the result.
  const mark = (ids: number[], on: boolean) => update((d) => markEpisodes(d, ids, on));
</script>

<div class="modal-section episodes-section">
  <div class="episodes-head">
    <div class="modal-section-label">Episodes</div>
    {#if isNativeShell()}
      <ReminderToggle {entry} {update} />
    {/if}
  </div>

  <p class="episodes-summary">
    {p.watched} of {p.aired} aired episode{p.aired === 1 ? '' : 's'} watched{p.total > p.aired
      ? ` · ${p.total - p.aired} upcoming`
      : ''}
  </p>

  {#if p.next}
    {@const next = p.next}
    <div class="episodes-next">
      <div>
        <div class="episodes-next-label">Next up</div>
        <div class="episodes-next-title">{episodeCode(next)} · {next.name || 'Untitled'}</div>
      </div>
      <button type="button" class="btn btn-primary btn-sm" onclick={() => mark([next.id], true)}>
        <Icon name="check" /> <span>Mark watched</span>
      </button>
    </div>
  {:else if p.caughtUp}
    <p class="episodes-next-note">
      {p.upcoming
        ? `Caught up — ${episodeCode(p.upcoming)} airs ${fmtDate(p.upcoming.aired)}`
        : 'Caught up on every aired episode.'}
    </p>
  {/if}

  <div
    class="progress-bar"
    role="progressbar"
    aria-label="Episodes watched"
    aria-valuemin={0}
    aria-valuemax={p.aired || 1}
    aria-valuenow={p.watched}
  >
    <div
      class="progress-bar-fill"
      style:width="{p.aired ? Math.round((p.watched / p.aired) * 100) : 0}%"
    ></div>
  </div>

  {#each bySeason as { season, episodes, aired, done } (season)}
    {@const all = done === aired.length}
    <details
      class="season"
      open={open.has(season) || season === initialSeason}
      ontoggle={(ev) => (ev.currentTarget.open ? open.add(season) : open.delete(season))}
    >
      <summary>
        <span class="season-name">{season === 0 ? 'Specials' : `Season ${season}`}</span>
        <span class="season-count">{done}/{aired.length}{all && aired.length ? ' ✓' : ''}</span>
      </summary>
      {#if aired.length}
        <button
          type="button"
          class="btn btn-muted btn-sm season-toggle"
          onclick={() =>
            mark(
              aired.map((ep) => ep.id),
              !all
            )}
        >
          {all ? 'Mark season unwatched' : 'Mark season watched'}
        </button>
      {/if}
      <ul class="episode-list">
        {#each episodes as ep (ep.id)}
          {@const isAired = hasAired(ep, today)}
          {@const id = `ep-${entry.id}-${ep.id}`}
          <li class="episode" class:is-upcoming={!isAired}>
            <input
              type="checkbox"
              {id}
              disabled={!isAired}
              checked={watched.has(ep.id)}
              onchange={(ev) => mark([ep.id], ev.currentTarget.checked)}
            />
            <label for={id}>
              <span class="episode-code">E{ep.e}</span>
              <span class="episode-name">{ep.name || 'Untitled'}</span>
              <span class="episode-date">
                {ep.aired ? (isAired ? fmtDate(ep.aired) : `airs ${fmtDate(ep.aired)}`) : 'TBA'}
              </span>
            </label>
          </li>
        {/each}
      </ul>
    </details>
  {/each}
</div>
