<script lang="ts">
  import { shelf } from '../../state/shelf.svelte';
  import { ui } from '../../state/ui.svelte';
  import type { CatalogEntry } from '../../types';
  import RatingControl from '../RatingControl.svelte';
  import EntryActions from './EntryActions.svelte';
  import NotesField from './NotesField.svelte';
  import TagsEditor from './TagsEditor.svelte';

  interface Props {
    entry: CatalogEntry;
    update: (change: (draft: CatalogEntry) => void | Promise<void>) => Promise<void>;
    onedit: () => void;
  }

  let { entry, update, onedit }: Props = $props();
  const citation = $derived([entry.creators?.[0], entry.source, entry.location].filter(Boolean).join(', '));
  // The book / film / show it is from, if that is still on the shelf.
  const linked = $derived(
    entry.linkedEntryId ? shelf.entries.find((e) => e.id === entry.linkedEntryId) : undefined
  );
</script>

<div class="modal-quote-block">
  <span class="modal-quote-glyph" aria-hidden="true">“</span>
  <blockquote class="modal-quote-text" id="modal-title" tabindex="-1">
    {entry.quoteText || entry.title}
  </blockquote>
  {#if citation}
    <div class="modal-quote-citation">— {citation}</div>
  {/if}
  {#if linked}
    <button type="button" class="quote-from-link" onclick={() => ui.openEntry(linked.id)}>
      <span class="quote-from-label">From</span><span>{linked.title}</span>
    </button>
  {/if}
</div>

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
</div>

<div class="modal-section">
  <div class="modal-section-label">Notes</div>
  <NotesField value={entry.notes || ''} onsave={(notes) => update((d) => void (d.notes = notes))} />
</div>

<TagsEditor tags={entry.tags || []} onchange={(tags) => update((d) => void (d.tags = tags))} />

<EntryActions {entry} {onedit} />
