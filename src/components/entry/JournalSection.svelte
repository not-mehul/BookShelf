<script lang="ts">
  import { applyStatus } from '../../util/apply-status';
  import {
    againLabel,
    daysToFinish,
    durationLabel,
    formatDay,
    fromDay,
    lastFinish,
    timesLabel,
    toDay
  } from '../../util/journal';
  import type { CatalogEntry } from '../../types';

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

  // Starting over keeps every earlier finish and begins the count again.
  function readAgain() {
    void update(async (d) => {
      const kept = d.finishes || [];
      await applyStatus(d, 'in-progress');
      d.finishes = kept;
      if (d.progress) d.progress = { ...d.progress, current: 0 };
      if (d.watchedEpisodes?.length) d.watchedEpisodes = [];
    });
  }

  function setStarted(day: string) {
    void update((d) => void (d.dateStarted = fromDay(day)));
  }

  function setFinished(day: string) {
    const iso = fromDay(day);
    void update((d) => {
      const list = [...(d.finishes || [])];
      if (!iso) list.pop();
      else if (list.length) list[list.length - 1] = iso;
      else list.push(iso);
      d.finishes = list.sort();
    });
  }
</script>

{#if entry.status === 'in-progress' || entry.status === 'finished' || entry.dateStarted || finishes.length}
  <div class="modal-section journal">
    <div class="modal-section-label">Journal</div>
    <div class="journal-dates">
      <label class="journal-field">
        <span class="t-field-label">Started</span>
        <input
          type="date"
          class="input input-mono"
          max={today}
          value={toDay(entry.dateStarted)}
          onchange={(ev) => setStarted(ev.currentTarget.value)}
        />
      </label>
      {#if entry.status === 'finished' || finished}
        <label class="journal-field">
          <span class="t-field-label">Finished</span>
          <input
            type="date"
            class="input input-mono"
            max={today}
            min={toDay(entry.dateStarted) || undefined}
            value={toDay(finished)}
            onchange={(ev) => setFinished(ev.currentTarget.value)}
          />
        </label>
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
      <p class="t-hint journal-line">Pick the day you finished it to count it in that year's review.</p>
    {/if}

    {#if earlier.length}
      <p class="t-data-small journal-earlier">
        Before: {earlier.map((f) => formatDay(f)).join(' · ')}
      </p>
    {/if}

    {#if entry.status === 'finished'}
      <button type="button" class="btn btn-muted btn-sm journal-again" onclick={readAgain}>
        {againLabel(entry.type)}
      </button>
    {/if}
  </div>
{/if}

<style>
  .journal-dates {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: var(--space-4);
  }
  .journal-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .journal-line {
    margin-top: var(--space-3);
  }
  .journal-earlier {
    margin-top: var(--space-2);
    font-variant-numeric: tabular-nums;
  }
  .journal-again {
    margin-top: var(--space-4);
  }
</style>
