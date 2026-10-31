<script lang="ts">
  import { untrack } from 'svelte';
  import { saveEntry } from '../../db/database';
  import { shelf } from '../../state/shelf.svelte';
  import { ui } from '../../state/ui.svelte';
  import { findEntryByTitle } from '../../util/entry-match';
  import { newEntry } from '../../util/new-entry';
  import type { SharePrefill } from '../../util/share-intake';
  import EntryPicker from '../EntryPicker.svelte';
  import Field from '../Field.svelte';
  import Icon from '../Icon.svelte';
  import ModalHead from '../ModalHead.svelte';

  interface Props {
    prefill?: SharePrefill;
    /** Pre-link the quote to this entry. */
    linkedEntryId?: string;
    onback: () => void;
  }

  let { prefill, linkedEntryId, onback }: Props = $props();

  // Link to a book / film / show on the shelf: the one asked for, or the
  // shared source if it matches exactly one title. Fills author and source.
  const initial = untrack(() => {
    const candidates = shelf.entries.filter((e) => e.type !== 'quote');
    return (
      (linkedEntryId ? candidates.find((e) => e.id === linkedEntryId) : null) ??
      (prefill?.source ? findEntryByTitle(candidates, prefill.source) : null)
    );
  });
  let text = $state(untrack(() => prefill?.quoteText || ''));
  let author = $state(untrack(() => prefill?.author || initial?.creators?.[0] || ''));
  let source = $state(untrack(() => prefill?.source || initial?.title || ''));
  let location = $state('');
  let linked = $state<string | null>(initial?.id ?? null);
  let saving = $state(false);

  async function submit(ev: SubmitEvent) {
    ev.preventDefault();
    const quoteText = text.trim();
    if (!quoteText) {
      document.getElementById('q-text')?.focus();
      return;
    }
    saving = true;
    const entry = newEntry('quote', {
      title: quoteText.slice(0, 100),
      quoteText,
      creators: author.trim() ? [author.trim()] : [],
      source: source.trim(),
      linkedEntryId: linked,
      location: location.trim()
    });
    await saveEntry(entry);
    shelf.changed();
    ui.openEntry(entry.id);
  }
</script>

<ModalHead eyebrow="Add a quote" {onback} />

<form class="add-form" onsubmit={submit}>
  <Field label="Quote text" id="q-text" placeholder="The quote…" rows={5} bind:value={text} autofocus />
  <EntryPicker
    id="q-from"
    bind:value={linked}
    onselect={(entry) => {
      if (!entry) return;
      if (!author.trim()) author = entry.creators?.[0] || '';
      if (!source.trim()) source = entry.title;
    }}
  />
  <div class="modal-two-col">
    <Field label="Author" id="q-author" placeholder="e.g. George Orwell" bind:value={author} />
    <Field
      label="Source / Work"
      id="q-source"
      placeholder="e.g. 1984, Hamlet, or a person's name"
      bind:value={source}
    />
  </div>
  <Field label="Page / time" id="q-location" placeholder="e.g. p. 112 or 1:04:20" bind:value={location} />
  <div class="modal-actions add-form-actions">
    <button type="submit" class="btn btn-primary" disabled={saving}><Icon name="plus" /> Add quote</button>
  </div>
</form>
