<script lang="ts">
  import { shelf } from '../state/shelf.svelte';
  import { ui } from '../state/ui.svelte';
  import { episodeCode, episodeProgress, localDate } from '../util/episodes';
  import { markEpisodes } from '../util/mark-episodes';
  import type { CatalogEntry, Episode } from '../types';
  import Icon from './Icon.svelte';

  // The next episode of each show in progress: ones ready to watch first,
  // then most recently touched.
  const items = $derived.by(() => {
    const today = localDate();
    return shelf.entries
      .filter((e) => e.type === 'tv' && e.status === 'in-progress' && e.episodeGuide?.episodes.length)
      .map((e) => ({ e, p: episodeProgress(e, today) }))
      .filter(({ p }) => p.next || p.upcoming)
      .sort(
        (a, b) =>
          Number(Boolean(b.p.next)) - Number(Boolean(a.p.next)) ||
          (b.e.updatedAt || '').localeCompare(a.e.updatedAt || '')
      )
      .map(({ e, p }) => ({ e, p, ep: (p.next || p.upcoming) as Episode }));
  });

  async function markWatched(entry: CatalogEntry, ep: Episode) {
    await markEpisodes({ ...entry }, [ep.id], true);
    shelf.changed();
  }
</script>

<section class="up-next" aria-label="Up next">
  {#if items.length}
    <h2 class="up-next-label">Up next</h2>
    <div class="up-next-row">
      {#each items as { e, p, ep } (e.id)}
        <div class="up-next-card">
          <button type="button" class="up-next-open" onclick={() => ui.openEntry(e.id)}>
            <span class="up-next-show">{e.title}</span>
            <span class="up-next-ep">{episodeCode(ep)} · {ep.name || 'Untitled'}</span>
            <span class="up-next-when">{p.next ? `${p.aired - p.watched} to watch` : `airs ${ep.aired}`}</span
            >
          </button>
          {#if p.next}
            <button
              type="button"
              class="btn-icon up-next-check"
              aria-label="Mark {episodeCode(ep)} of {e.title} watched"
              onclick={() => markWatched(e, ep)}
            >
              <Icon name="check" />
            </button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>
