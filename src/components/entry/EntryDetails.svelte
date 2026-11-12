<script lang="ts">
  import { applyStatus } from '../../util/apply-status';
  import type { CatalogEntry } from '../../types';
  import RatingControl from '../RatingControl.svelte';
  import AspectRatings from './AspectRatings.svelte';
  import EntryActions from './EntryActions.svelte';
  import Hero from './Hero.svelte';
  import JournalSection from './JournalSection.svelte';
  import LinkedQuotes from './LinkedQuotes.svelte';
  import NotesField from './NotesField.svelte';
  import SeasonsSection from './SeasonsSection.svelte';
  import SeriesSection from './SeriesSection.svelte';
  import StatusPicker from './StatusPicker.svelte';
  import TagsEditor from './TagsEditor.svelte';

  interface Props {
    entry: CatalogEntry;
    update: (change: (draft: CatalogEntry) => void | Promise<void>) => Promise<void>;
    onedit: () => void;
  }

  let { entry, update, onedit }: Props = $props();

  const hasGuide = $derived(entry.type === 'tv' && Boolean(entry.episodeGuide?.episodes.length));
</script>

<Hero {entry} />

{#if entry.summary?.trim()}
  <div class="modal-section">
    <div class="modal-section-label">Synopsis</div>
    <p class="modal-summary">{entry.summary}</p>
  </div>
{/if}

{#if entry.series?.name}
  <SeriesSection {entry} series={entry.series} />
{/if}

<div class="modal-section">
  <div class="modal-section-label">Rating</div>
  <RatingControl
    value={entry.rating}
    onchange={(next) =>
      update((d) => {
        d.rating = next;
        d.dateRated = next != null ? new Date().toISOString() : null;
      })}
  />
  <AspectRatings {entry} onchange={(aspects) => update((d) => void (d.aspectRatings = aspects))} />
</div>

<div class="modal-section">
  <div class="modal-section-label">Status</div>
  <StatusPicker
    value={entry.status ?? null}
    type={entry.type}
    onchange={(status) => void update((d) => applyStatus(d, status))}
  />
</div>

<!-- TV with an episode guide: watched by season (status follows). -->
{#if hasGuide}
  <SeasonsSection {entry} {update} />
{:else if entry.type === 'tv' && entry.sourceId && !entry.episodeGuide}
  <p class="field-hint episodes-pending">
    Seasons appear here once the episode list loads (needs TheTVDB access in Settings).
  </p>
{/if}

<div class="modal-section">
  <div class="modal-section-label">Notes</div>
  <NotesField
    value={entry.notes || ''}
    type={entry.type}
    onsave={(notes) => update((d) => void (d.notes = notes))}
  />
</div>

<JournalSection {entry} {update} />

<LinkedQuotes {entry} />

<TagsEditor tags={entry.tags || []} onchange={(tags) => update((d) => void (d.tags = tags))} />

<EntryActions {entry} {onedit} />
