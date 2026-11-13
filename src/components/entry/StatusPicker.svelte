<script lang="ts">
  // Wishlist, under way, done or put down: four icon toggles side by side, one at a
  // time, each in its status colour (the status chip's: cream, amber, sage).
  // Tapping the lit one again clears the status.
  import { STATUS_LABEL } from '../../util/status';
  import type { EntryStatus, EntryType } from '../../types';
  import Icon from '../Icon.svelte';

  interface Props {
    value: EntryStatus | null;
    type: EntryType;
    onchange: (status: EntryStatus | null) => void;
  }

  let { value, type, onchange }: Props = $props();

  const verb = $derived(type === 'book' ? 'Reading' : 'Watching');
  const OPTIONS = $derived([
    { status: 'want' as const, icon: 'bookmark' as const, label: STATUS_LABEL.want },
    { status: 'in-progress' as const, icon: 'progress' as const, label: verb },
    { status: 'finished' as const, icon: 'check' as const, label: STATUS_LABEL.finished },
    { status: 'abandoned' as const, icon: 'stop' as const, label: 'Stopped' }
  ]);
</script>

<div class="status-picker" role="radiogroup" aria-label="Status">
  {#each OPTIONS as opt (opt.status)}
    <button
      type="button"
      role="radio"
      class="status-option is-{opt.status}"
      aria-checked={value === opt.status}
      aria-label={opt.status === 'abandoned' ? STATUS_LABEL.abandoned : undefined}
      onclick={() => onchange(value === opt.status ? null : opt.status)}
    >
      <Icon name={opt.icon} />
      <span class="status-option-label">{opt.label}</span>
    </button>
  {/each}
</div>

<style>
  .status-picker {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-2);
  }
  .status-option {
    --tone-rgb: var(--cream-rgb);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    min-height: 64px;
    padding: var(--space-3) var(--space-2);
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
    font-family: var(--font-mono);
    font-size: 0.625rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }
</style>
