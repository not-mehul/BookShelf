<script lang="ts">
  import { shelf } from '../../state/shelf.svelte';
  import { ui } from '../../state/ui.svelte';
  import { nextInSeries, seriesEntries } from '../../util/series';
  import { statusLabel } from '../../util/status';
  import type { CatalogEntry } from '../../types';

  interface Props {
    entry: CatalogEntry;
    series: { name: string; position: number | null };
  }

  // The series in order, what comes next, and a way to look for the next or
  // newer installments (the add flow's search).
  let { entry, series }: Props = $props();
  const members = $derived(seriesEntries(shelf.entries, series.name));
  const upcoming = $derived(nextInSeries(shelf.entries, entry));

  function find(query: string) {
    if (entry.type === 'quote') return;
    ui.openAdd({
      startWith: 'search',
      searchType: entry.type,
      prefill: { quoteText: '', author: '', source: '', query, link: null }
    });
  }
</script>

<div class="modal-section series-section">
  <div class="modal-section-label">Series</div>
  <div>
    <p class="series-heading">
      <span class="series-name">{series.name}</span>{series.position != null
        ? ` · #${series.position}`
        : ''}<span class="series-count">{` · ${members.length} on your shelf`}</span>
    </p>
    <ol class="series-list">
      {#each members as m (m.id)}
        {@const isThis = m.id === entry.id}
        <li>
          <button
            type="button"
            class="series-item"
            class:is-current={isThis}
            disabled={isThis}
            onclick={() => ui.openEntry(m.id)}
          >
            <span class="series-pos">{m.series?.position != null ? `#${m.series.position}` : '—'}</span>
            <span class="series-title">{m.title}</span>
            <span class="series-status">{isThis ? 'this one' : statusLabel(m.status)}</span>
          </button>
        </li>
      {/each}
    </ol>
    <div class="series-actions">
      {#if upcoming.next}
        <p class="series-next">Next: #{upcoming.next.series?.position} {upcoming.next.title}</p>
      {:else if upcoming.nextPosition != null && !upcoming.onShelf}
        <button
          type="button"
          class="btn btn-muted btn-sm"
          onclick={() => find(`${series.name} ${upcoming.nextPosition}`)}
        >
          Find #{upcoming.nextPosition}
        </button>
      {/if}
      <!-- Results already on the shelf show a ✓. -->
      <button type="button" class="btn btn-muted btn-sm" onclick={() => find(series.name)}
        >Check for new installments</button
      >
    </div>
  </div>
</div>
