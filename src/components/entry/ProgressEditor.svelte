<script lang="ts">
  import { untrack } from 'svelte';
  import { applyStatus } from '../../util/apply-status';
  import type { CatalogEntry } from '../../types';

  interface Props {
    entry: CatalogEntry;
    update: (change: (draft: CatalogEntry) => void | Promise<void>) => Promise<void>;
  }

  let { entry, update }: Props = $props();
  const initial = untrack(() => entry.progress || { current: 0, total: 0 });
  let current = $state(initial.current ? String(initial.current) : '');
  let total = $state(initial.total ? String(initial.total) : '');
  let timer: ReturnType<typeof setTimeout> | undefined;

  const count = (v: string) => Math.max(0, parseInt(v, 10) || 0);
  const pct = $derived.by(() => {
    const t = count(total);
    return t > 0 ? Math.min(100, Math.round((count(current) / t) * 100)) : 0;
  });

  function save() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const c = count(current);
      const t = count(total);
      void update(async (d) => {
        d.progress = { current: c, total: t };
        // Derive status from progress so the two stay consistent.
        if (t > 0 && c >= t) await applyStatus(d, 'finished');
        else if (c > 0) await applyStatus(d, 'in-progress');
      });
    }, 300);
  }
</script>

<div class="modal-section">
  <div class="modal-section-label">
    {entry.type === 'book' ? 'Pages read' : entry.type === 'tv' ? 'Episodes watched' : 'Progress'}
  </div>
  <div class="progress-edit-row">
    <input
      type="number"
      min="0"
      class="input progress-input"
      aria-label="Current"
      placeholder="0"
      value={current}
      oninput={(ev) => {
        current = ev.currentTarget.value;
        save();
      }}
    />
    <span class="progress-of">of</span>
    <input
      type="number"
      min="0"
      class="input progress-input"
      aria-label="Total"
      placeholder={entry.type === 'book' ? 'pages' : 'episodes'}
      value={total}
      oninput={(ev) => {
        total = ev.currentTarget.value;
        save();
      }}
    />
  </div>
  <div class="progress-bar" title={count(total) ? `${pct}%` : ''}>
    <div class="progress-bar-fill" style:width="{pct}%"></div>
  </div>
</div>
