<script lang="ts">
  // A day, or a span of days (style.md §8.6): a field shaped like a text input
  // that opens a month calendar in its own modal, over the entry. Monday first,
  // today ringed, the chosen days lit. Nothing changes until Choose.
  //
  // With `range`, the first tap picks the start and a second, optional tap the
  // end; a tap before the start begins again from there.
  import { tick } from 'svelte';
  import { pushBackHandler } from '../platform/native';
  import Icon from './Icon.svelte';

  interface Props {
    label: string;
    id: string;
    /** "YYYY-MM-DD", or empty for none. The start of a range. */
    value: string;
    /** The end of a range, "YYYY-MM-DD" or empty. */
    end?: string;
    range?: boolean;
    /** Days after this are shown but cannot be chosen. */
    max?: string;
    /** Called with the chosen day, and the end of a range ('' when open-ended). */
    onchange: (day: string, end: string) => void;
  }

  let { label, id, value, end = '', range = false, max, onchange }: Props = $props();

  const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  const pad = (n: number) => String(n).padStart(2, '0');
  const key = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
  const now = new Date();
  const today = key(now.getFullYear(), now.getMonth(), now.getDate());
  const asDate = (day: string) => new Date(`${day}T12:00:00`);
  const long = (day: string) =>
    asDate(day).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  /** Short enough for a field on a phone: "2 Mar 2026". */
  const short = (day: string) =>
    asDate(day).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  /** "10 Feb – 2 Mar 2026", dropping the first year when both share it. */
  function span(a: string, b: string) {
    if (!b) return `${short(a)} –`;
    if (a === b) return short(a);
    const first =
      a.slice(0, 4) === b.slice(0, 4)
        ? asDate(a).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
        : short(a);
    return `${first} – ${short(b)}`;
  }

  let open = $state(false);
  let draft = $state('');
  let draftEnd = $state('');
  let year = $state(now.getFullYear());
  let month = $state(now.getMonth());
  let dialog = $state<HTMLDialogElement>();

  const cells = $derived.by(() => {
    const lead = (new Date(year, month, 1).getDay() + 6) % 7;
    const count = new Date(year, month + 1, 0).getDate();
    const days: (string | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= count; d++) days.push(key(year, month, d));
    return days;
  });
  const shownMonth = $derived(
    new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  );
  const title = $derived(
    !draft ? (range ? 'Tap the day you started' : 'No day') : range ? span(draft, draftEnd) : long(draft)
  );
  const hint = $derived(
    range ? (draft && !draftEnd ? 'Tap the day you finished, or Choose to leave it open.' : '') : ''
  );

  function start() {
    // A new entry's calendar opens on today, chosen.
    draft = value || (range ? '' : today);
    draftEnd = end;
    const from = asDate(value || today);
    year = from.getFullYear();
    month = from.getMonth();
    open = true;
  }

  function pick(day: string) {
    if (!range) {
      draft = day;
      return;
    }
    // First tap (or a tap before the start, or after a full span): a new start.
    if (!draft || draftEnd || day < draft) {
      draft = day;
      draftEnd = '';
    } else {
      draftEnd = day;
    }
  }

  function step(by: number) {
    const d = new Date(year, month + by, 1);
    year = d.getFullYear();
    month = d.getMonth();
  }

  function finish(next: string | null, nextEnd = '') {
    open = false;
    if (next !== null && (next !== value || nextEnd !== end)) onchange(next, nextEnd);
  }

  $effect(() => {
    if (!open || !dialog) return;
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const d = dialog;
    d.showModal();
    void tick().then(() => d.querySelector<HTMLElement>('[aria-pressed="true"], .day-cell.today')?.focus());
    const release = pushBackHandler(() => finish(null));
    return () => {
      release();
      if (d.open) d.close();
      if (returnTo?.isConnected) returnTo.focus();
    };
  });
</script>

<div class="field">
  <span class="t-field-label" id="{id}-label">{label}</span>
  <button
    type="button"
    class="picker-field"
    {id}
    data-value={value}
    data-end={end}
    aria-labelledby="{id}-label {id}-value"
    aria-haspopup="dialog"
    aria-expanded={open}
    onclick={start}
  >
    <Icon name="calendar" />
    {#if value}
      <span class="picker-value" id="{id}-value">{range ? span(value, end) : short(value)}</span>
    {:else}
      <span class="picker-placeholder" id="{id}-value">Pick a day</span>
    {/if}
  </button>
</div>

{#if open}
  <dialog
    bind:this={dialog}
    class="modal-dialog picker-dialog"
    aria-labelledby="{id}-picker-title"
    onclick={(ev) => {
      if (ev.target === dialog) finish(null);
    }}
    oncancel={(ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      finish(null);
    }}
    onkeydown={(ev) => ev.key === 'Escape' && ev.stopPropagation()}
  >
    <div class="modal-card picker-card">
      <div class="picker-head">
        <div>
          <div class="modal-eyebrow">{label}</div>
          <h2 class="add-title" id="{id}-picker-title" aria-live="polite">{title}</h2>
          {#if hint}<p class="t-hint picker-hint">{hint}</p>{/if}
        </div>
        <button type="button" class="btn-icon" aria-label="Close" onclick={() => finish(null)}
          ><Icon name="x" /></button
        >
      </div>
      <div class="calendar">
        <div class="calendar-head">
          <button type="button" class="btn-icon" aria-label="Previous month" onclick={() => step(-1)}
            ><Icon name="chevronLeft" /></button
          >
          <span class="calendar-month" aria-live="polite">{shownMonth}</span>
          <button type="button" class="btn-icon" aria-label="Next month" onclick={() => step(1)}
            ><Icon name="chevronRight" /></button
          >
        </div>
        <div class="calendar-grid">
          {#each WEEKDAYS as weekday (weekday)}
            <span class="t-field-label" aria-hidden="true">{weekday}</span>
          {/each}
          {#each cells as day, i (day ?? `blank-${i}`)}
            {#if day}
              <button
                type="button"
                class="day-cell"
                class:today={day === today}
                class:in-span={range && draft && draftEnd && day > draft && day < draftEnd}
                aria-pressed={day === draft || (range && day === draftEnd)}
                aria-label={long(day)}
                disabled={max !== undefined && day > max}
                onclick={() => pick(day)}>{Number(day.slice(8))}</button
              >
            {:else}
              <span></span>
            {/if}
          {/each}
        </div>
      </div>
      <div class="picker-actions">
        <button type="button" class="btn btn-muted" disabled={!value} onclick={() => finish('', '')}
          >Clear</button
        >
        <button
          type="button"
          class="btn btn-primary"
          disabled={!draft}
          onclick={() => finish(draft, draftEnd)}>Choose</button
        >
      </div>
    </div>
  </dialog>
{/if}
