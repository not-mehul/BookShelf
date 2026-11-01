<script lang="ts">
  import { untrack } from 'svelte';
  import { getEntry } from '../db/database';
  import { shareEntry } from '../export/share';
  import { currentTheme, type ThemeMode } from '../platform/theme.svelte';
  import { canvasToBlob, renderCard } from '../share/card';
  import { FORMATS } from '../share/layout';
  import { canDownload, cardFilename, downloadImage, shareImage } from '../share/share-image';
  import { ui } from '../state/ui.svelte';
  import { messageOf } from '../util/errors';
  import type { CatalogEntry } from '../types';
  import Icon from './Icon.svelte';
  import { useModalFocus } from './Modal.svelte';
  import ModalHead from './ModalHead.svelte';
  import Segmented from './Segmented.svelte';

  // Preview a Dusk/Dawn image card of an entry, then share or save it.
  let { id }: { id: string } = $props();
  type Format = keyof typeof FORMATS;

  let entry = $state.raw<CatalogEntry | null>(null);
  let theme = $state<ThemeMode>(currentTheme());
  let format = $state<Format>('post');
  let includeRating = $state(true);
  let includeNotes = $state(false);
  let blob = $state.raw<Blob | null>(null);
  let url = $state('');
  let status = $state('');
  const settleFocus = useModalFocus();

  const THEME_OPTS: { value: ThemeMode; label: string }[] = [
    { value: 'dark', label: 'Dusk' },
    { value: 'light', label: 'Dawn' }
  ];
  const FORMAT_OPTS = (Object.entries(FORMATS) as [Format, { label: string }][]).map(([value, f]) => ({
    value,
    label: f.label
  }));

  $effect(() => {
    void untrack(async () => {
      entry = (await getEntry(id)) ?? null;
      if (!entry) ui.close();
      settleFocus();
    });
  });

  // Re-render whenever an option changes; a newer render supersedes an older one.
  let seq = 0;
  $effect(() => {
    const e = entry;
    const options = { theme, format, includeRating, includeNotes };
    if (!e) return;
    const mine = ++seq;
    blob = null;
    void (async () => {
      try {
        const next = await canvasToBlob(await renderCard(e, options));
        if (mine !== seq) return;
        blob = next;
      } catch (err) {
        status = messageOf(err);
      }
    })();
  });

  $effect(() => {
    if (!blob) return;
    const next = URL.createObjectURL(blob);
    url = next;
    return () => URL.revokeObjectURL(next);
  });

  const filename = $derived(
    entry ? cardFilename(entry.type === 'quote' ? `quote ${entry.creators?.[0] || ''}` : entry.title) : ''
  );

  async function share() {
    if (!blob || !entry) return;
    try {
      const result = await shareImage(blob, filename, entry.title);
      status = result === 'downloaded' ? `Saved ${filename}.` : '';
    } catch (err) {
      status = messageOf(err);
    }
  }
</script>

<ModalHead eyebrow="Share" title="Share card" onback={() => ui.openEntry(id)} />

{#if entry}
  {@const e = entry}
  <div class="share-card-body">
    <div class="share-card-frame">
      <img class="share-card-preview" alt="Preview of the share card" src={url || undefined} />
    </div>
    <div class="share-card-controls">
      <Segmented options={THEME_OPTS} bind:value={theme} label="Card theme" />
      <Segmented options={FORMAT_OPTS} bind:value={format} label="Card format" />
      {#if e.type !== 'quote'}
        {#if e.rating != null}
          <label class="share-card-toggle" for="card-rating">
            <input type="checkbox" id="card-rating" bind:checked={includeRating} /> Rating
          </label>
        {/if}
        {#if e.notes?.trim()}
          <label class="share-card-toggle" for="card-notes">
            <input type="checkbox" id="card-notes" bind:checked={includeNotes} /> My notes
          </label>
        {/if}
      {/if}
    </div>
    <div class="modal-actions share-card-actions">
      <button type="button" class="btn btn-primary" disabled={!blob} onclick={share}>
        <Icon name="share" /> <span>Share image</span>
      </button>
      {#if canDownload()}
        <button
          type="button"
          class="btn btn-muted"
          disabled={!blob}
          onclick={() => {
            if (!blob) return;
            downloadImage(blob, filename);
            status = `Saved ${filename}.`;
          }}
        >
          <Icon name="download" /> <span>Save image</span>
        </button>
      {/if}
      <button
        type="button"
        class="btn btn-muted"
        onclick={async () => {
          if ((await shareEntry(e)) === 'copied') status = 'Copied to the clipboard.';
        }}>Share as text</button
      >
    </div>
    <p class="field-hint share-card-status" role="status" aria-live="polite">{status}</p>
  </div>
{/if}
