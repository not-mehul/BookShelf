<script lang="ts">
  import { untrack } from 'svelte';
  import { applyStatus } from '../../util/apply-status';
  import { pace } from '../../util/journal';
  import type { CatalogEntry } from '../../types';

  interface Props {
    entry: CatalogEntry;
    update: (change: (draft: CatalogEntry) => void | Promise<void>) => Promise<void>;
  }

  let { entry, update }: Props = $props();
  const isBook = untrack(() => entry.type === 'book');
  // A book's edition usually knows its page count: start from that.
  const initial = untrack(() => entry.progress || { current: 0, total: entry.pageCount || 0 });
  let current = $state(initial.current ? String(initial.current) : '');
  let total = $state(initial.total ? String(initial.total) : '');
  let timer: ReturnType<typeof setTimeout> | undefined;

  const count = (v: string) => Math.max(0, parseInt(v, 10) || 0);
  const pct = $derived.by(() => {
    const t = count(total);
    return t > 0 ? Math.min(100, Math.round((count(current) / t) * 100)) : 0;
  });
  const left = $derived(Math.max(0, count(total) - count(current)));
  const unit = isBook ? 'page' : 'episode';
  const units = (n: number) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  /** Quick steps: a sitting's worth of pages, or one episode. */
  const STEPS = isBook ? [10, 25, 50] : [1];

  // Pace from the saved entry, so it moves when the number does.
  const forecast = $derived(pace(entry));
  const forecastLine = $derived.by(() => {
    if (!forecast) return '';
    const rate = forecast.perDay >= 10 ? Math.round(forecast.perDay) : Math.round(forecast.perDay * 10) / 10;
    const when =
      forecast.daysLeft <= 1
        ? 'done by tomorrow'
        : `done around ${forecast.eta.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
    return `About ${rate} ${unit}s a day; at this pace, ${when}.`;
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

  function bump(by: number) {
    const t = count(total);
    const next = count(current) + by;
    current = String(t > 0 ? Math.min(t, next) : next);
    save();
  }
</script>

<div class="modal-section">
  <div class="modal-section-label">
    {isBook ? 'Pages read' : entry.type === 'tv' ? 'Episodes watched' : 'Progress'}
  </div>
  <div class="progress-edit-row">
    <input
      type="number"
      min="0"
      inputmode="numeric"
      enterkeyhint="done"
      class="input input-mono progress-input"
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
      inputmode="numeric"
      enterkeyhint="done"
      class="input input-mono progress-input"
      aria-label="Total"
      placeholder={isBook ? 'pages' : 'episodes'}
      value={total}
      oninput={(ev) => {
        total = ev.currentTarget.value;
        save();
      }}
    />
    <div class="progress-steps">
      {#each STEPS as step (step)}
        <button
          type="button"
          class="chip progress-step"
          aria-label="Add {units(step)}"
          disabled={count(total) > 0 && left === 0}
          onclick={() => bump(step)}>+{step}</button
        >
      {/each}
    </div>
  </div>
  <div class="meter progress-meter" aria-hidden="true">
    <div class="meter-fill" class:is-complete={pct === 100} style:width="{pct}%"></div>
  </div>
  {#if count(total) > 0}
    <p class="t-data-small progress-left">
      {left ? `${units(left)} left` : 'All done'} · {pct}%
    </p>
  {/if}
  {#if forecastLine}
    <p class="t-hint progress-forecast">{forecastLine}</p>
  {/if}
</div>
