<script lang="ts">
  // Above the shelf, one compact row that scrolls sideways: the next season of
  // each show under way, then a line from the shelf. Each is a small panel, so
  // the first covers show on the first screen.
  import { patchEntry } from '../db/database';
  import { shelf } from '../state/shelf.svelte';
  import { ui } from '../state/ui.svelte';
  import type { CatalogEntry } from '../types';
  import { dailyIndex } from '../util/daily';
  import { localDate, seasonProgress, type SeasonState } from '../util/episodes';
  import { formatDay, fromDay } from '../util/journal';
  import { markEpisodes } from '../util/mark-episodes';
  import Icon from './Icon.svelte';

  interface Props {
    /** The next seasons of shows under way. */
    upNext: boolean;
    /** A kept quote, the same one all day. */
    quote: boolean;
  }

  let { upNext, quote: withQuote }: Props = $props();

  // Ready to watch first, then the most recently touched.
  const seasons = $derived.by(() => {
    if (!upNext) return [];
    const today = localDate();
    return shelf.entries
      .filter((e) => e.type === 'tv' && e.status === 'in-progress' && e.episodeGuide?.episodes.length)
      .map((e) => ({ e, p: seasonProgress(e, today) }))
      .filter(({ p }) => p.next || p.upcoming)
      .sort(
        (a, b) =>
          Number(Boolean(b.p.next)) - Number(Boolean(a.p.next)) ||
          (b.e.updatedAt || '').localeCompare(a.e.updatedAt || '')
      )
      .map(({ e, p }) => ({ e, ready: Boolean(p.next), s: (p.next || p.upcoming) as SeasonState }));
  });

  async function markWatched(entry: CatalogEntry, s: SeasonState) {
    await patchEntry(entry.id, (d) =>
      markEpisodes(
        d,
        s.aired.map((ep) => ep.id),
        true
      )
    );
    shelf.changed();
  }

  const quotes = $derived(
    withQuote
      ? shelf.entries
          .filter((e) => e.type === 'quote' && (e.quoteText || e.title))
          .sort((a, b) => a.id.localeCompare(b.id))
      : []
  );
  let offset = $state(0);
  const line = $derived(
    quotes.length ? quotes[(dailyIndex(localDate(), quotes.length) + offset) % quotes.length] : undefined
  );
  const citation = $derived(line ? [line.creators?.[0], line.source].filter(Boolean).join(', ') : '');
  const count = $derived(seasons.length + (line ? 1 : 0));
</script>

{#if count}
  <section class="home-strip" class:is-single={count === 1} aria-label="Up next and a line from the shelf">
    {#each seasons as { e, ready, s } (e.id)}
      <div class="strip-card up-next-card">
        <button type="button" class="strip-open" onclick={() => ui.openEntry(e.id)}>
          <span class="t-field-label">Up next</span>
          <span class="strip-title">{e.title}</span>
          <span class="strip-meta"
            ><span class="up-next-ep">Season {s.season}</span> ·
            <span class="up-next-when"
              >{ready
                ? `${s.episodes.length} episode${s.episodes.length === 1 ? '' : 's'}`
                : `airs ${s.firstAired ? formatDay(fromDay(s.firstAired)) : 'soon'}`}</span
            ></span
          >
        </button>
        {#if ready}
          <button
            type="button"
            class="btn-icon strip-action"
            aria-label="Mark season {s.season} of {e.title} watched"
            title="Mark the season watched"
            onclick={() => markWatched(e, s)}
          >
            <Icon name="check" />
          </button>
        {/if}
      </div>
    {/each}
    {#if line}
      <div class="strip-card shelf-line">
        <button type="button" class="strip-open" onclick={() => ui.openEntry(line.id)}>
          <span class="t-field-label">A line from the shelf</span>
          <!-- A new line fades in when asked for; the first one is simply there. -->
          {#key line.id}
            <span class="shelf-line-body" class:is-fresh={offset > 0}>
              <span class="shelf-line-text">{line.quoteText || line.title}</span>
              {#if citation}<span class="strip-meta">— {citation}</span>{/if}
            </span>
          {/key}
        </button>
        {#if quotes.length > 1}
          <button
            type="button"
            class="btn-icon strip-action"
            aria-label="Show another quote"
            title="Another"
            onclick={() => offset++}
          >
            <Icon name="shuffle" />
          </button>
        {/if}
      </div>
    {/if}
  </section>
{/if}

<style>
  .home-strip {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: min(82%, 20rem);
    gap: var(--space-3);
    margin: 0 calc(-1 * var(--shell-pad-x, 1rem)) var(--space-5);
    padding: 0 var(--shell-pad-x, 1rem);
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scroll-padding: 0 var(--shell-pad-x, 1rem);
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
  }
  .home-strip::-webkit-scrollbar {
    display: none;
  }
  .home-strip.is-single {
    grid-auto-columns: 100%;
  }
  .strip-card {
    display: flex;
    align-items: flex-start;
    min-width: 0;
    border: 1px solid var(--border-soft);
    border-radius: var(--corner-lg);
    background: var(--panel-bg-faint);
    scroll-snap-align: start;
    overflow: hidden;
  }
  .strip-open {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-3) var(--space-2) var(--space-3) var(--space-4);
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition: background-color var(--spring-effects-fast-dur) var(--spring-effects-fast);
  }
  .strip-open:hover {
    background: var(--hover-bg);
  }
  .strip-open :global(.t-field-label) {
    margin: 0;
  }
  .strip-title {
    overflow: hidden;
    font-family: var(--font-serif);
    font-size: 1.125rem;
    line-height: 1.3;
    color: var(--text-heading);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .strip-meta {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    line-height: 1.35;
    color: var(--text-dim);
  }
  .shelf-line-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .shelf-line-body.is-fresh {
    animation: fade-in var(--dur-settle) var(--ease-settle);
  }
  .shelf-line-text {
    display: -webkit-box;
    overflow: hidden;
    font-family: var(--font-serif);
    font-style: italic;
    font-size: 1rem;
    line-height: 1.45;
    color: var(--text-heading);
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }
  .strip-action {
    flex: none;
    margin: var(--space-1) var(--space-1) 0 0;
    color: var(--accent-amber);
  }
</style>
