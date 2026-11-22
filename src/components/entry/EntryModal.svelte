<script lang="ts">
  import { cheer } from '../../util/delight';
  import { untrack } from 'svelte';
  import { loadEpisodeGuide } from '../../api/episode-sync';
  import { enrichFromTvdbDetail } from '../../api/normalize';
  import { fetchDetail, isTvdbConfigured } from '../../api/tvdb';
  import { getEntry, patchEntry } from '../../db/database';
  import { shelf } from '../../state/shelf.svelte';
  import { ui } from '../../state/ui.svelte';
  import { guideIsStale } from '../../util/episodes';
  import { fetchThumbBlob } from '../../util/thumbs';
  import type { CatalogEntry } from '../../types';
  import { useModalFocus } from '../Modal.svelte';
  import EditEntry from './EditEntry.svelte';
  import EntryDetails from './EntryDetails.svelte';
  import QuoteDetails from './QuoteDetails.svelte';

  let { id }: { id: string } = $props();
  let entry = $state.raw<CatalogEntry | null>(null);
  let editing = $state(false);
  const settleFocus = useModalFocus();

  /**
   * Apply a change to the stored entry (not the copy on screen, which may be
   * behind: a sync, an enrichment or an earlier tap may have saved since),
   * save it, and show it. Changes to one entry run one after another.
   */
  async function update(change: (draft: CatalogEntry) => void | Promise<void>): Promise<void> {
    if (!entry) return;
    let was: CatalogEntry['status'];
    const saved = await patchEntry(entry.id, async (d) => {
      was = d.status;
      await change(d);
    });
    if (!saved) {
      // Deleted meanwhile (on another device, or by an Undo).
      ui.close();
      shelf.changed();
      return;
    }
    entry = saved;
    shelf.changed();
    // Finishing a book, a film or a show is worth a little confetti (style.md §11.3).
    if (saved.status === 'finished' && was !== 'finished') {
      cheer(null, { count: 60 });
    }
  }

  function show(next: CatalogEntry) {
    entry = next;
    shelf.changed();
  }

  // Keep the open entry in step with the shelf: a sync or a background
  // refresh that saves it while it is open shows here too. Older reloads
  // (a refresh that started before our own save) are ignored.
  $effect(() => {
    const fresh = shelf.entries.find((e) => e.id === id);
    untrack(() => {
      if (fresh && entry && fresh !== entry && (fresh.updatedAt || '') >= (entry.updatedAt || '')) {
        entry = fresh;
      }
    });
  });

  async function load(id: string) {
    const loaded = await getEntry(id);
    if (!loaded) {
      ui.close();
      return;
    }
    entry = loaded;
    settleFocus();

    // Lazily enrich movies/TV saved from a thin search hit (no director/cast
    // yet), and load or refresh a show's episode guide. Only what TheTVDB
    // supplies is written, onto the stored copy, so a rating or status given
    // while it loads is kept.
    let current = loaded;
    if ((current.type === 'movie' || current.type === 'tv') && current.sourceId && !current.enriched) {
      try {
        const detail = await fetchDetail(current);
        if (detail) {
          const preview = enrichFromTvdbDetail(current, detail);
          const cover =
            !current.thumbnailBlob && preview.thumbnailUrl && preview.thumbnailUrl !== current.thumbnailUrl
              ? { url: preview.thumbnailUrl, blob: await fetchThumbBlob(preview.thumbnailUrl) }
              : null;
          const saved = await patchEntry(current.id, (d) => {
            const hadUrl = d.thumbnailUrl;
            Object.assign(d, enrichFromTvdbDetail(d, detail));
            if (cover?.blob && !hadUrl && d.thumbnailUrl === cover.url && !d.thumbnailBlob) {
              d.thumbnailBlob = cover.blob;
            }
          });
          if (saved) {
            current = saved;
            show(saved);
          }
        }
      } catch {
        /* a database error: keep the thin entry */
      }
    }
    if (current.type === 'tv' && current.sourceId && guideIsStale(current) && (await isTvdbConfigured())) {
      try {
        show(await loadEpisodeGuide(current));
      } catch {
        /* offline: keep whatever guide we have */
      }
    }
  }

  $effect(() => {
    untrack(() => void load(id));
  });
</script>

{#if entry}
  {#if editing}
    <EditEntry
      {entry}
      onback={() => (editing = false)}
      onsave={async (change) => {
        await update(change);
        editing = false;
      }}
    />
  {:else if entry.type === 'quote'}
    <QuoteDetails {entry} {update} onedit={() => (editing = true)} />
  {:else}
    <EntryDetails {entry} {update} onedit={() => (editing = true)} />
  {/if}
{/if}
