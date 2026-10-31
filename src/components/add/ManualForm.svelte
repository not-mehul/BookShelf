<script lang="ts">
  import { saveEntry } from '../../db/database';
  import { shelf } from '../../state/shelf.svelte';
  import { ui } from '../../state/ui.svelte';
  import { TYPE_LABEL } from '../../util/labels';
  import { newEntry } from '../../util/new-entry';
  import { parseSeriesFromTitle } from '../../util/series';
  import { splitList } from '../../util/text';
  import { fetchThumbBlob } from '../../util/thumbs';
  import type { EntryType } from '../../types';
  import Field from '../Field.svelte';
  import Icon from '../Icon.svelte';
  import ModalHead from '../ModalHead.svelte';

  interface Props {
    type: Exclude<EntryType, 'quote'>;
    onback: () => void;
  }

  let { type, onback }: Props = $props();
  let title = $state('');
  let creators = $state('');
  let year = $state('');
  let genres = $state('');
  let cover = $state('');
  let summary = $state('');
  let error = $state('');
  let saving = $state(false);

  async function submit(ev: SubmitEvent) {
    ev.preventDefault();
    error = '';
    const t = title.trim();
    if (!t) {
      error = 'A title is required.';
      document.getElementById('m-title')?.focus();
      return;
    }
    saving = true;
    const yearNum = parseInt(year, 10);
    const coverUrl = cover.trim() || null;
    const entry = newEntry(type, {
      title: t,
      creators: splitList(creators),
      year: Number.isFinite(yearNum) ? yearNum : null,
      summary: summary.trim(),
      genres: splitList(genres),
      pageCount: null,
      isbn: null,
      detailUrl: null,
      series: parseSeriesFromTitle(t),
      thumbnailUrl: coverUrl,
      thumbnailBlob: coverUrl ? await fetchThumbBlob(coverUrl) : null
    });
    await saveEntry(entry);
    shelf.changed();
    ui.openEntry(entry.id);
  }
</script>

<ModalHead eyebrow="Add a {TYPE_LABEL[type].toLowerCase()} manually" {onback} />

<form class="add-form" onsubmit={submit}>
  <Field label="Title" id="m-title" placeholder="Required" bind:value={title} autofocus />
  <Field
    label={type === 'book' ? 'Author(s)' : 'Director / Creator(s)'}
    id="m-creators"
    placeholder="Comma-separated"
    bind:value={creators}
  />
  <div class="modal-two-col">
    <Field
      label="Year"
      id="m-year"
      placeholder="e.g. 2021"
      type="number"
      inputmode="numeric"
      bind:value={year}
    />
    <Field label="Genres / Tags" id="m-genres" placeholder="Comma-separated" bind:value={genres} />
  </div>
  <Field
    label="Cover image URL"
    id="m-cover"
    placeholder="Optional — https://…"
    type="url"
    bind:value={cover}
  />
  <Field label="Summary" id="m-summary" placeholder="Optional" rows={3} bind:value={summary} />
  {#if error}
    <div class="msg-error">{error}</div>
  {/if}
  <div class="modal-actions add-form-actions">
    <button type="submit" class="btn btn-primary" disabled={saving}
      ><Icon name="plus" /> Add to catalog</button
    >
  </div>
</form>
