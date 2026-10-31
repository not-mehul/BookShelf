<script lang="ts">
  import { untrack } from 'svelte';
  import { parseSeriesFromTitle } from '../../util/series';
  import { fetchThumbBlob } from '../../util/thumbs';
  import { splitList } from '../../util/text';
  import { TYPE_LABEL } from '../../util/labels';
  import type { CatalogEntry } from '../../types';
  import EntryPicker from '../EntryPicker.svelte';
  import Field from '../Field.svelte';
  import Icon from '../Icon.svelte';
  import ModalHead from '../ModalHead.svelte';

  interface Props {
    entry: CatalogEntry;
    onback: () => void;
    onsave: (change: (draft: CatalogEntry) => void | Promise<void>) => Promise<void>;
  }

  let { entry, onback, onsave }: Props = $props();
  const e = untrack(() => entry);
  let error = $state('');

  // Quote fields
  let quoteText = $state(e.quoteText || e.title);
  let author = $state(e.creators?.[0] || '');
  let source = $state(e.source || '');
  let location = $state(e.location || '');
  let linkedEntryId = $state(e.linkedEntryId ?? null);

  // Book / film / show fields. Series is suggested from the title until the
  // user sets (or clears) it.
  const series = e.series === undefined ? parseSeriesFromTitle(e.title) : e.series;
  let title = $state(e.title);
  let creators = $state((e.creators || []).join(', '));
  let year = $state(e.year != null ? String(e.year) : '');
  let genres = $state((e.genres || []).join(', '));
  let cover = $state(e.thumbnailUrl || '');
  let summary = $state(e.summary || '');
  let seriesName = $state(series?.name || '');
  let seriesPos = $state(series?.position != null ? String(series.position) : '');

  async function submit(ev: SubmitEvent) {
    ev.preventDefault();
    error = '';
    if (e.type === 'quote') {
      const text = quoteText.trim();
      if (!text) {
        error = 'Quote text is required.';
        return;
      }
      await onsave((d) => {
        d.quoteText = text;
        d.title = text.slice(0, 100);
        d.creators = author.trim() ? [author.trim()] : [];
        d.source = source.trim();
        d.location = location.trim();
        d.linkedEntryId = linkedEntryId;
      });
      return;
    }
    const t = title.trim();
    if (!t) {
      error = 'A title is required.';
      document.getElementById('e-title')?.focus();
      return;
    }
    const yearNum = parseInt(year, 10);
    const newCover = cover.trim() || null;
    const sName = seriesName.trim();
    const sPos = parseFloat(seriesPos);
    await onsave(async (d) => {
      if (newCover && newCover !== d.thumbnailUrl) {
        d.thumbnailBlob = await fetchThumbBlob(newCover);
      } else if (!newCover) {
        d.thumbnailBlob = null;
      }
      d.title = t;
      d.creators = splitList(creators);
      d.year = Number.isFinite(yearNum) ? yearNum : null;
      d.genres = splitList(genres);
      d.thumbnailUrl = newCover;
      d.summary = summary.trim();
      d.series = sName ? { name: sName, position: Number.isFinite(sPos) ? sPos : null } : null;
    });
  }
</script>

<ModalHead eyebrow="Edit" title="Edit {TYPE_LABEL[e.type].toLowerCase()}" {onback} />

<form class="add-form" onsubmit={submit}>
  {#if e.type === 'quote'}
    <Field
      label="Quote text"
      id="e-text"
      placeholder="The quote…"
      rows={5}
      bind:value={quoteText}
      autofocus
    />
    <EntryPicker
      id="e-from"
      bind:value={linkedEntryId}
      onselect={(linked) => {
        if (!linked) return;
        if (!author.trim()) author = linked.creators?.[0] || '';
        if (!source.trim()) source = linked.title;
      }}
    />
    <div class="modal-two-col">
      <Field label="Author" id="e-author" placeholder="e.g. George Orwell" bind:value={author} />
      <Field label="Source / Work" id="e-source" placeholder="e.g. 1984" bind:value={source} />
    </div>
    <Field label="Page / time" id="e-location" placeholder="e.g. p. 112 or 1:04:20" bind:value={location} />
  {:else}
    <Field label="Title" id="e-title" placeholder="Required" bind:value={title} autofocus />
    <Field
      label={e.type === 'book' ? 'Author(s)' : 'Director / Creator(s)'}
      id="e-creators"
      placeholder="Comma-separated"
      bind:value={creators}
    />
    <div class="modal-two-col">
      <Field
        label="Year"
        id="e-year"
        placeholder="e.g. 2021"
        type="number"
        inputmode="numeric"
        bind:value={year}
      />
      <Field label="Genres / Tags" id="e-genres" placeholder="Comma-separated" bind:value={genres} />
    </div>
    <div class="modal-two-col">
      <Field label="Series" id="e-series" placeholder="e.g. The Expanse" bind:value={seriesName} />
      <Field
        label="Number in series"
        id="e-series-pos"
        placeholder="e.g. 3"
        type="number"
        step="any"
        min="0"
        inputmode="decimal"
        bind:value={seriesPos}
      />
    </div>
    <Field label="Cover image URL" id="e-cover" placeholder="https://…" type="url" bind:value={cover} />
    <Field label="Summary" id="e-summary" placeholder="Optional" rows={3} bind:value={summary} />
  {/if}
  {#if error}
    <div class="msg-error">{error}</div>
  {/if}
  <div class="modal-actions add-form-actions">
    <button type="submit" class="btn btn-primary"><Icon name="check" /> Save changes</button>
  </div>
</form>
