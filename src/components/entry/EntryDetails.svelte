<script lang="ts">
  import { applyStatus } from '../../util/apply-status';
  import { STATUS_LABEL } from '../../util/status';
  import type { CatalogEntry, EntryStatus } from '../../types';
  import RatingControl from '../RatingControl.svelte';
  import AspectRatings from './AspectRatings.svelte';
  import EntryActions from './EntryActions.svelte';
  import EpisodesSection from './EpisodesSection.svelte';
  import Hero from './Hero.svelte';
  import LinkedQuotes from './LinkedQuotes.svelte';
  import NotesField from './NotesField.svelte';
  import ProgressEditor from './ProgressEditor.svelte';
  import SeriesSection from './SeriesSection.svelte';
  import TagsEditor from './TagsEditor.svelte';

  interface Props {
    entry: CatalogEntry;
    update: (change: (draft: CatalogEntry) => void | Promise<void>) => Promise<void>;
    onedit: () => void;
  }

  let { entry, update, onedit }: Props = $props();

  const STATUS_OPTS: { value: EntryStatus | ''; label: string }[] = [
    { value: '', label: '— none —' },
    { value: 'want', label: STATUS_LABEL.want },
    { value: 'in-progress', label: STATUS_LABEL['in-progress'] },
    { value: 'finished', label: STATUS_LABEL.finished }
  ];

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

<!-- TV with an episode guide: per-episode tracking (progress is derived).
     Books, and shows without a guide (manual entries): manual progress. -->
{#if hasGuide}
  <EpisodesSection {entry} {update} />
{:else if entry.type === 'book' || entry.type === 'tv'}
  <ProgressEditor {entry} {update} />
  {#if entry.type === 'tv' && entry.sourceId && !entry.episodeGuide}
    <p class="field-hint episodes-pending">
      Episode tracking appears here once the episode list loads (needs TheTVDB access in Settings).
    </p>
  {/if}
{/if}

<div class="modal-section">
  <div class="modal-two-col">
    <div>
      <div class="modal-section-label">Progress status</div>
      <div class="select-wrap">
        <select
          class="select"
          aria-label="Progress status"
          value={entry.status || ''}
          onchange={(ev) => {
            const status = (ev.currentTarget.value as EntryStatus) || null;
            void update((d) => applyStatus(d, status));
          }}
        >
          {#each STATUS_OPTS as opt (opt.value)}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        </select>
      </div>
    </div>
    <div>
      <div class="modal-section-label">Notes</div>
      <NotesField value={entry.notes || ''} onsave={(notes) => update((d) => void (d.notes = notes))} />
    </div>
  </div>
</div>

<LinkedQuotes {entry} />

<TagsEditor tags={entry.tags || []} onchange={(tags) => update((d) => void (d.tags = tags))} />

<EntryActions {entry} {onedit} />
