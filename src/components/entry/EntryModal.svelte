<script lang="ts">
  import { untrack } from 'svelte';
  import { loadEpisodeGuide } from '../../api/episode-sync';
  import { enrichEntry, isTvdbConfigured } from '../../api/tvdb';
  import { getEntry, saveEntry } from '../../db/database';
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
   * Apply a change to a copy of the entry, save it, and show it. Copies keep
   * the shelf's own objects untouched until it reloads.
   */
  async function update(change: (draft: CatalogEntry) => void | Promise<void>): Promise<void> {
    if (!entry) return;
    const draft = { ...entry };
    await change(draft);
    await saveEntry(draft);
    entry = draft;
    shelf.changed();
  }

  function show(next: CatalogEntry) {
    entry = next;
    shelf.changed();
  }

  async function load(id: string) {
    const loaded = await getEntry(id);
    if (!loaded) {
      ui.close();
      return;
    }
    entry = loaded;
    settleFocus();

    // Lazily enrich movies/TV saved from a thin search hit (no director/cast
    // yet), and load or refresh a show's episode guide.
    let current = loaded;
    if ((current.type === 'movie' || current.type === 'tv') && current.sourceId && !current.enriched) {
      try {
        const enriched = await enrichEntry(current);
        if (enriched.enriched) {
          if (
            !enriched.thumbnailBlob &&
            enriched.thumbnailUrl &&
            enriched.thumbnailUrl !== current.thumbnailUrl
          ) {
            enriched.thumbnailBlob = await fetchThumbBlob(enriched.thumbnailUrl);
          }
          await saveEntry(enriched);
          current = enriched;
          show(enriched);
        }
      } catch {
        /* offline or no key: keep the thin entry */
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
