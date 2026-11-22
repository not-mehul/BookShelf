<script lang="ts">
  // How far into a book: the page you're on, of how many, and a meter. The
  // page count comes from the book's details when it has one.
  import type { CatalogEntry } from '../../types';

  interface Props {
    entry: CatalogEntry;
    onchange: (progress: { current: number; total: number } | null) => void;
  }

  let { entry, onchange }: Props = $props();
  const uid = $props.id();

  const total = $derived(entry.progress?.total || entry.pageCount || 0);
  const current = $derived(entry.progress?.current ?? 0);
  const pct = $derived(total ? Math.min(100, Math.round((current / total) * 100)) : 0);

  const whole = (v: string) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  function set(nextCurrent: number, nextTotal: number) {
    if (!nextCurrent && !nextTotal) onchange(null);
    else onchange({ current: nextTotal ? Math.min(nextCurrent, nextTotal) : nextCurrent, total: nextTotal });
  }
</script>

<div class="progress-field">
  <div class="progress-row">
    <label class="t-field-label" for="{uid}-page">Page</label>
    <input
      id="{uid}-page"
      class="input progress-input"
      type="number"
      inputmode="numeric"
      enterkeyhint="done"
      min="0"
      max={total || undefined}
      value={current || ''}
      placeholder="0"
      onchange={(ev) => set(whole(ev.currentTarget.value), total)}
    />
    <label class="t-field-label" for="{uid}-total">of</label>
    <input
      id="{uid}-total"
      class="input progress-input"
      type="number"
      inputmode="numeric"
      enterkeyhint="done"
      min="1"
      value={total || ''}
      placeholder="pages"
      onchange={(ev) => set(current, whole(ev.currentTarget.value))}
    />
    {#if total}<span class="progress-pct">{pct}%</span>{/if}
  </div>
  {#if total}
    <div
      class="meter progress-meter"
      role="progressbar"
      aria-label="Read"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <div class="meter-fill" style:width="{pct}%"></div>
    </div>
  {/if}
</div>

<style>
  .progress-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .progress-row :global(.t-field-label) {
    margin: 0;
  }
  .progress-input {
    width: 5.5rem;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
  .progress-pct {
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: 0.875rem;
    color: var(--accent-amber);
    font-variant-numeric: tabular-nums;
  }
  .progress-meter {
    margin-top: var(--space-3);
  }
</style>
