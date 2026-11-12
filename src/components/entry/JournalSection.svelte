<script lang="ts">
  import { applyStatus } from '../../util/apply-status';
  import {
    daysToFinish,
    durationLabel,
    formatDay,
    fromDay,
    lastFinish,
    timesLabel,
    toDay
  } from '../../util/journal';
  import type { CatalogEntry } from '../../types';
  import DateField from '../DateField.svelte';

  // When it was started and finished, and how long it took. Stamped by status
  // changes; corrected here by picking a day.

  interface Props {
    entry: CatalogEntry;
    update: (change: (draft: CatalogEntry) => void | Promise<void>) => Promise<void>;
  }

  let { entry, update }: Props = $props();

  const today = toDay(new Date().toISOString());
  const finished = $derived(lastFinish(entry));
  const took = $derived(daysToFinish(entry));
  const finishes = $derived(entry.finishes || []);
  const times = $derived(timesLabel(entry.type, finishes.length));
  const earlier = $derived(finishes.slice(0, -1));

  function setFinishDay(d: CatalogEntry, iso: string | null) {
    const list = [...(d.finishes || [])];
    if (!iso) list.pop();
    else if (list.length) list[list.length - 1] = iso;
    else list.push(iso);
    d.finishes = list.sort();
  }

  // Books: one calendar for the span, from the day started to the day finished.
  // Picking a finish day finishes the book.
  function setSpan(startDay: string, endDay: string) {
    void update(async (d) => {
      d.dateStarted = fromDay(startDay);
      if (endDay && d.status !== 'finished') await applyStatus(d, 'finished');
      if (endDay || d.status === 'finished') setFinishDay(d, fromDay(endDay));
    });
  }

  // Films and shows: one day, the finish once finished and the start before.
  function setDay(day: string) {
    void update((d) => {
      if (d.status === 'finished') setFinishDay(d, fromDay(day));
      else d.dateStarted = fromDay(day);
    });
  }
</script>

{#if entry.status === 'in-progress' || entry.status === 'finished' || entry.dateStarted || finishes.length}
  <div class="modal-section journal">
    <div class="modal-section-label">Journal</div>
    <div class="journal-dates">
      {#if entry.type === 'book'}
        <DateField
          label="Read"
          id="journal-span"
          range
          max={today}
          value={toDay(entry.dateStarted)}
          end={entry.status === 'finished' ? toDay(finished) : ''}
          onchange={setSpan}
        />
      {:else}
        <DateField
          label={entry.status === 'finished' ? 'Finished' : 'Started'}
          id="journal-day"
          max={today}
          value={entry.status === 'finished' ? toDay(finished) : toDay(entry.dateStarted)}
          onchange={setDay}
        />
      {/if}
    </div>

    {#if took != null && entry.status === 'finished'}
      <p class="t-hint journal-line">
        {took <= 0 ? 'Started and finished on the same day.' : `Took ${durationLabel(took)}.`}
        {#if times}{times}.{/if}
      </p>
    {:else if times}
      <p class="t-hint journal-line">{times}.</p>
    {:else if entry.status === 'finished' && !finished}
      <p class="t-hint journal-line">Pick the day you finished to count it in that year's review.</p>
    {/if}

    {#if earlier.length}
      <p class="t-data-small journal-earlier">
        Before: {earlier.map((f) => formatDay(f)).join(' · ')}
      </p>
    {/if}
  </div>
{/if}

<style>
  .journal-dates {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: var(--space-4);
  }
  .journal-dates > :global(.field) {
    margin-bottom: 0;
  }
  .journal-line {
    margin-top: var(--space-3);
  }
  .journal-earlier {
    margin-top: var(--space-2);
    font-variant-numeric: tabular-nums;
  }
</style>
