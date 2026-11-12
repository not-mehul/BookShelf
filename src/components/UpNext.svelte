<script lang="ts">
  import { shelf } from '../state/shelf.svelte';
  import { ui } from '../state/ui.svelte';
  import { localDate, seasonProgress, type SeasonState } from '../util/episodes';
  import { markEpisodes } from '../util/mark-episodes';
  import type { CatalogEntry } from '../types';
  import Icon from './Icon.svelte';

  // The next season of each show in progress: ones ready to watch first,
  // then most recently touched.
  const items = $derived.by(() => {
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
      .map(({ e, p }) => ({ e, p, s: (p.next || p.upcoming) as SeasonState }));
  });

  async function markWatched(entry: CatalogEntry, s: SeasonState) {
    await markEpisodes(
      { ...entry },
      s.aired.map((ep) => ep.id),
      true
    );
    shelf.changed();
  }
</script>

<section class="up-next" aria-label="Up next">
  {#if items.length}
    <h2 class="up-next-label">Up next</h2>
    <div class="up-next-row">
      {#each items as { e, p, s } (e.id)}
        <div class="up-next-card">
          <button type="button" class="up-next-open" onclick={() => ui.openEntry(e.id)}>
            <span class="up-next-show">{e.title}</span>
            <span class="up-next-ep">Season {s.season}</span>
            <span class="up-next-when"
              >{p.next
                ? `${s.episodes.length} episode${s.episodes.length === 1 ? '' : 's'}`
                : `airs ${s.firstAired ?? 'soon'}`}</span
            >
          </button>
          {#if p.next}
            <button
              type="button"
              class="btn-icon up-next-check"
              aria-label="Mark season {s.season} of {e.title} watched"
              onclick={() => markWatched(e, s)}
            >
              <Icon name="check" />
            </button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>
