<script lang="ts">
  import { untrack } from 'svelte';
  import { plural } from '../../util/labels';
  import { getSetting, setSetting } from '../../util/settings';
  import { goalPace, paceSentence } from '../../util/year-stats';

  // The year's book goal, kept per year so last year's stays as it was.
  let { year, books, now }: { year: number; books: number; now: Date } = $props();

  let goal = $state(0);
  const goalKey = (y: number) => `reading_goal_${y}`;
  $effect(() => {
    const y = year;
    untrack(() => {
      void getSetting(goalKey(y), '0').then((v) => {
        if (year === y) goal = Math.max(0, parseInt(v, 10) || 0);
      });
    });
  });
  function setGoal(next: number) {
    goal = Math.max(0, Math.min(999, next));
    void setSetting(goalKey(year), goal);
  }
  const pace = $derived(goalPace(books, goal, year, now));
  const pct = $derived(goal ? Math.min(100, Math.round((books / goal) * 100)) : 0);
</script>

<div class="stats-goal">
  <div class="stats-goal-row">
    <span class="t-field-label">Reading goal</span>
    {#if goal}
      <div class="stats-goal-stepper">
        <button
          type="button"
          class="chip"
          aria-label="Lower the goal by one"
          disabled={goal <= 1}
          onclick={() => setGoal(goal - 1)}>−</button
        >
        <button
          type="button"
          class="chip"
          aria-label="Raise the goal by one"
          onclick={() => setGoal(goal + 1)}>+</button
        >
      </div>
    {/if}
  </div>
  {#if goal}
    <p class="stats-goal-figure">
      <span class="t-stat">{books}</span>
      <span class="stats-goal-of">of {plural(goal, 'book')}</span>
    </p>
    <div
      class="meter"
      role="progressbar"
      aria-label="Books towards the goal"
      aria-valuemin={0}
      aria-valuemax={goal}
      aria-valuenow={Math.min(books, goal)}
    >
      <div class="meter-fill" class:is-complete={pct === 100} style:width="{pct}%"></div>
    </div>
    <p class="t-hint stats-goal-pace">{paceSentence(pace, now)}</p>
  {:else}
    <p class="t-hint">A number of books to read in {year}, measured as you finish them.</p>
    <button type="button" class="btn btn-muted btn-sm stats-goal-set" onclick={() => setGoal(12)}
      >Set a goal</button
    >
  {/if}
</div>

<style>
  .stats-goal {
    padding: var(--space-4);
    margin-bottom: var(--space-4);
    background: var(--panel-bg-faint);
    border: 1px solid var(--border-soft);
    border-radius: var(--corner-lg);
  }
  .stats-goal-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 32px;
  }
  .stats-goal-stepper {
    display: flex;
    gap: var(--space-2);
  }
  .stats-goal-stepper .chip {
    min-width: 44px;
    justify-content: center;
    font-family: var(--font-mono);
  }
  .stats-goal-figure {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    margin: var(--space-2) 0 var(--space-3);
  }
  .stats-goal-of {
    font-family: var(--font-serif);
    font-style: italic;
    color: var(--text-dim);
  }
  .stats-goal .meter-fill {
    transition: width var(--dur-settle) var(--ease-settle);
  }
  .stats-goal-pace,
  .stats-goal-set {
    margin-top: var(--space-3);
  }
</style>
