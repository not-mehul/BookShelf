<script lang="ts">
  // A book, film or show. First what it is (Hero), then what you make of it, all
  // in one place: status, rating and dates. Then episodes, notes,
  // quotes and tags; the synopsis and series last. Edit, Share and Delete are in
  // the bar's menu.
  import { applyStatus } from '../../util/apply-status';
  import type { CatalogEntry } from '../../types';
  import { useSheetBar } from '../Modal.svelte';
  import RatingControl from '../RatingControl.svelte';
  import AspectRatings from './AspectRatings.svelte';
  import EntryMenu from './EntryMenu.svelte';
  import Hero from './Hero.svelte';
  import JournalSection from './JournalSection.svelte';
  import LinkedQuotes from './LinkedQuotes.svelte';
  import NotesField from './NotesField.svelte';
  import SeasonsSection from './SeasonsSection.svelte';
  import SeriesSection from './SeriesSection.svelte';
  import StatusPicker from './StatusPicker.svelte';
  import Synopsis from './Synopsis.svelte';
  import TagsEditor from './TagsEditor.svelte';

  interface Props {
    entry: CatalogEntry;
    update: (change: (draft: CatalogEntry) => void | Promise<void>) => Promise<void>;
    onedit: () => void;
  }

  let { entry, update, onedit }: Props = $props();

  const hasGuide = $derived(entry.type === 'tv' && Boolean(entry.episodeGuide?.episodes.length));

  const bar = useSheetBar();
  $effect(() => {
    if (!bar) return;
    bar.actions = menu;
    return () => {
      if (bar.actions === menu) bar.actions = null;
    };
  });
</script>

{#snippet menu()}<EntryMenu {entry} {onedit} />{/snippet}

<Hero {entry} />

<section class="modal-section entry-take" aria-label="Your take">
  <div class="take-group">
    <div class="modal-section-label">Status</div>
    <StatusPicker
      value={entry.status ?? null}
      type={entry.type}
      onchange={(status) => void update((d) => applyStatus(d, status))}
    />
  </div>

  <div class="take-group">
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

  <JournalSection {entry} {update} />
</section>

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
  <NotesField value={entry.notes || ''} onsave={(notes) => update((d) => void (d.notes = notes))} />
</div>

<LinkedQuotes {entry} />

<TagsEditor tags={entry.tags || []} onchange={(tags) => update((d) => void (d.tags = tags))} />

{#if entry.summary?.trim()}
  <Synopsis text={entry.summary} />
{/if}

{#if entry.series?.name}
  <SeriesSection {entry} series={entry.series} />
{/if}

<style>
  .entry-take {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }
  .take-group :global(.modal-section-label) {
    margin-bottom: var(--space-3);
  }
</style>
