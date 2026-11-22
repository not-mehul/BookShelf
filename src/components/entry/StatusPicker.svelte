<script lang="ts">
  // Wishlist, under way, done or put down: four icon toggles side by side, one at a
  // time, each in its status colour (the status chip's: cream, amber, sage).
  // Tapping the lit one again clears the status.
  import { statusLabel } from '../../util/status';
  import type { EntryStatus, EntryType } from '../../types';
  import Icon from '../Icon.svelte';

  interface Props {
    value: EntryStatus | null;
    type: EntryType;
    onchange: (status: EntryStatus | null) => void;
  }

  let { value, type, onchange }: Props = $props();

  const OPTIONS = $derived(
    (
      [
        ['want', 'bookmark'],
        ['in-progress', 'progress'],
        ['finished', 'check'],
        ['abandoned', 'stop']
      ] as const
    ).map(([status, icon]) => ({ status, icon, label: statusLabel(status, type) }))
  );
</script>

<div class="status-picker" role="radiogroup" aria-label="Status">
  <div class="status-grid">
    {#each OPTIONS as opt (opt.status)}
      <button
        type="button"
        role="radio"
        class="status-option is-{opt.status}"
        aria-checked={value === opt.status}
        onclick={() => onchange(value === opt.status ? null : opt.status)}
      >
        <Icon name={opt.icon} />
        <span class="status-option-label">{opt.label}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  /* Four equal buttons across the row when every word fits whole, else two by
     two: the switch point is in rem, so it moves with the phone's text size. */
  .status-picker {
    container: status / inline-size;
  }
  .status-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--space-2);
  }
  /* Four buttons of the longest word, WATCHING or FINISHED (8 letters at
     0.45rem each, 12px of padding), and three gaps. "Did not finish" wraps. */
  @container status (max-width: calc(14.4rem + 72px)) {
    .status-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  .status-option {
    --tone-rgb: var(--cream-rgb);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    min-height: 64px;
    padding: var(--space-3) 6px;
    border: 1px solid var(--border-soft);
    border-radius: var(--corner-md);
    background: var(--panel-bg-faint);
    color: var(--text-dim);
    transition:
      background-color var(--spring-effects-fast-dur) var(--spring-effects-fast),
      border-color var(--spring-effects-fast-dur) var(--spring-effects-fast),
      color var(--spring-effects-fast-dur) var(--spring-effects-fast),
      border-radius var(--spring-spatial-fast-dur) var(--spring-spatial-fast);
  }
  .status-option.is-in-progress {
    --tone-rgb: var(--accent-amber-rgb);
  }
  .status-option.is-finished {
    --tone-rgb: var(--accent-sage-rgb);
  }
  .status-option :global(svg) {
    width: 20px;
    height: 20px;
    color: rgb(var(--tone-rgb));
    opacity: 0.7;
  }
  .status-option:hover {
    background: var(--hover-bg);
  }
  .status-option:active {
    transform: scale(var(--press-scale));
  }
  .status-option[aria-checked='true'] {
    border-color: rgba(var(--tone-rgb), 0.6);
    border-radius: var(--corner-lg);
    background: rgba(var(--tone-rgb), 0.14);
    color: var(--text-heading);
  }
  .status-option[aria-checked='true'] :global(svg) {
    opacity: 1;
  }
  .status-option-label {
    max-width: 100%;
    font-family: var(--font-mono);
    font-size: 0.625rem;
    letter-spacing: 0.12em;
    line-height: 1.35;
    text-align: center;
    text-transform: uppercase;
  }
</style>
