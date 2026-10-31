<script lang="ts">
  import { tick } from 'svelte';
  import { listEntries, saveEntry, thumbnailUrl } from '../db/database';
  import { shelf } from '../state/shelf.svelte';
  import { ui } from '../state/ui.svelte';
  import { applyStatus } from '../util/apply-status';
  import { TYPE_SHORT } from '../util/labels';
  import { normalizeRanks, pickFromQueue, queueOrder, rankForMove } from '../util/queue';
  import type { CatalogEntry } from '../types';
  import CoverImage from './CoverImage.svelte';
  import Icon from './Icon.svelte';
  import ModalHead from './ModalHead.svelte';
  import Segmented from './Segmented.svelte';

  // The ranked "want to" queue: reorder by drag (or keyboard / buttons), and
  // let the app pick something.
  type TypeFilter = 'all' | 'book' | 'movie' | 'tv';
  const TYPE_OPTS: { value: TypeFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'book', label: 'Books' },
    { value: 'movie', label: 'Movies' },
    { value: 'tv', label: 'TV' }
  ];

  let all = $state.raw<CatalogEntry[]>([]);
  let loaded = $state(false);
  let type = $state<TypeFilter>('all');
  let short = $state(false);
  let genre = $state('');
  let pick = $state.raw<CatalogEntry | null | undefined>(undefined);
  let lastPickId: string | undefined;
  let announcement = $state('');
  let list: HTMLOListElement;

  const items = $derived(queueOrder(all).filter((e) => type === 'all' || e.type === type));
  const genres = $derived([...new Set(items.flatMap((e) => e.genres || []))].sort());

  // Dragging: the row follows the pointer; the drop commits the move.
  let drag = $state<{ id: string; from: number; to: number } | null>(null);
  const shown = $derived.by(() => {
    if (!drag) return items;
    const order = [...items];
    const [moved] = order.splice(drag.from, 1);
    order.splice(drag.to, 0, moved!);
    return order;
  });

  async function load() {
    all = await listEntries();
    // First visit (or crowded ranks): give everything queued a stable rank.
    for (const e of normalizeRanks(queueOrder(all))) await saveEntry(e);
    all = [...all];
    loaded = true;
  }
  $effect(() => void load());

  // Keep a still-offered genre selected when the list changes.
  $effect(() => {
    if (genre && !genres.includes(genre)) genre = '';
  });

  /** Persist a move, then put focus back on the moved row's `focusClass` control. */
  async function move(from: number, to: number, focusClass?: string) {
    const list_ = items;
    if (from === to || to < 0 || to >= list_.length) return;
    const entry = list_[from]!;
    entry.queueRank = rankForMove(list_, from, to);
    await saveEntry(entry);
    for (const e of normalizeRanks(queueOrder(all))) await saveEntry(e);
    all = [...all];
    announcement = `${entry.title} moved to position ${to + 1} of ${list_.length}.`;
    shelf.changed();
    if (focusClass) {
      await tick();
      const row = list.querySelector(`[data-id="${CSS.escape(entry.id)}"]`);
      row?.querySelector<HTMLElement>(focusClass)?.focus();
    }
  }

  function startDrag(ev: PointerEvent, entry: CatalogEntry, index: number) {
    if (ev.button !== 0) return;
    ev.preventDefault();
    const handle = ev.currentTarget as HTMLElement;
    handle.setPointerCapture(ev.pointerId);
    drag = { id: entry.id, from: index, to: index };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      // The new slot: how many other rows sit above the pointer.
      const others = [...list.children].filter((c) => (c as HTMLElement).dataset.id !== drag!.id);
      const to = others.filter((c) => {
        const r = c.getBoundingClientRect();
        return e.clientY >= r.top + r.height / 2;
      }).length;
      if (to !== drag.to) drag = { ...drag, to };
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      const d = drag;
      drag = null;
      if (d && d.to !== d.from) void move(d.from, d.to, '.queue-handle');
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp, { once: true });
    handle.addEventListener('pointercancel', onUp, { once: true });
  }

  function showPick() {
    const p = pickFromQueue(items, { type, short, genre }, Math.random, lastPickId);
    pick = p;
    if (p) lastPickId = p.id;
  }

  async function startNow(entry: CatalogEntry) {
    await applyStatus(entry, 'in-progress', all);
    await saveEntry(entry);
    shelf.changed();
    ui.openEntry(entry.id);
  }

  const sub = (e: CatalogEntry, pages = true) =>
    [TYPE_SHORT[e.type], e.creators?.[0], pages && e.pageCount ? `${e.pageCount} pp.` : '']
      .filter(Boolean)
      .join(' · ');
</script>

<ModalHead eyebrow="Wishlist" title="Your queue" />

<div class="queue-body">
  <div class="visually-hidden" role="status" aria-live="polite">{announcement}</div>
  <div class="queue-filters">
    <Segmented options={TYPE_OPTS} bind:value={type} />
  </div>

  <div class="queue-pick">
    <div class="queue-pick-controls">
      <button type="button" class="btn btn-primary" disabled={loaded && !items.length} onclick={showPick}>
        <Icon name="shuffle" /> <span>Pick something for me</span>
      </button>
      <label class="queue-short" for="pick-short"
        ><input type="checkbox" id="pick-short" bind:checked={short} /> Short books</label
      >
      <div class="select-wrap select-wrap-sm">
        <select class="select select-sm" aria-label="Genre" bind:value={genre}>
          <option value="">Any genre</option>
          {#each genres as g (g)}
            <option value={g}>{g}</option>
          {/each}
        </select>
      </div>
    </div>
    <div class="queue-pick-result" aria-live="polite">
      {#if pick === null}
        <p class="field-hint">Nothing in your queue matches those filters.</p>
      {:else if pick}
        {@const p = pick}
        <div class="queue-pick-card">
          <div class="queue-pick-label">How about…</div>
          <div class="queue-pick-title">{p.title}</div>
          <div class="queue-sub">{sub(p, false)}</div>
          <div class="queue-pick-actions">
            <button type="button" class="btn btn-primary btn-sm" onclick={() => startNow(p)}>Start now</button
            >
            <button type="button" class="btn btn-muted btn-sm" onclick={showPick}>Pick again</button>
          </div>
        </div>
      {/if}
    </div>
  </div>

  <ol class="queue-list" aria-label="Queue, in order" bind:this={list}>
    {#each shown as entry, index (entry.id)}
      {@const src = thumbnailUrl(entry) || entry.thumbnailUrl}
      <li class="queue-item" class:dragging={drag?.id === entry.id} data-id={entry.id}>
        <button
          type="button"
          class="queue-handle"
          aria-label="Reorder {entry.title}, position {index +
            1} of {items.length}. Use the up and down arrow keys to move it."
          onpointerdown={(ev) => startDrag(ev, entry, index)}
          onkeydown={(ev) => {
            if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return;
            ev.preventDefault();
            void move(index, index + (ev.key === 'ArrowUp' ? -1 : 1), '.queue-handle');
          }}
        >
          <Icon name="grip" />
        </button>
        <span class="queue-pos" aria-hidden="true">{index + 1}</span>
        <div class="queue-thumb"><CoverImage {src} /></div>
        <button type="button" class="queue-main" onclick={() => ui.openEntry(entry.id)}>
          <span class="queue-title">{entry.title}</span>
          <span class="queue-sub">{sub(entry)}</span>
        </button>
        <div class="queue-moves">
          <button
            type="button"
            class="btn-icon queue-move queue-up"
            aria-label="Move {entry.title} up"
            disabled={index === 0}
            onclick={() => move(index, index - 1, '.queue-up')}
          >
            <Icon name="arrowUp" />
          </button>
          <button
            type="button"
            class="btn-icon queue-move queue-down"
            aria-label="Move {entry.title} down"
            disabled={index === items.length - 1}
            onclick={() => move(index, index + 1, '.queue-down')}
          >
            <Icon name="arrowDown" />
          </button>
        </div>
      </li>
    {:else}
      {#if loaded}
        <li class="queue-empty">
          {type === 'all'
            ? 'Your queue is empty. Set something to “Wishlist” and it lines up here.'
            : 'Nothing of this type in your queue.'}
        </li>
      {/if}
    {/each}
  </ol>
</div>
