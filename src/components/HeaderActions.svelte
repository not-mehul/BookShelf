<script lang="ts">
  import { ui } from '../state/ui.svelte';
  import Icon from './Icon.svelte';

  // Statistics, the queue and Settings: the same three in the page header and
  // in the bar that floats in on the way back up.
  const ACTIONS = [
    { kind: 'stats', label: 'Stats', icon: 'chart' },
    { kind: 'queue', label: 'Queue', icon: 'queue' },
    { kind: 'settings', label: 'Settings', icon: 'settings' }
  ] as const;
</script>

<div class="header-controls">
  {#each ACTIONS as a (a.kind)}
    <button
      type="button"
      class="btn-icon"
      aria-label={a.label}
      title={a.label}
      onclick={() => ui.open({ kind: a.kind })}
    >
      <Icon name={a.icon} />
    </button>
  {/each}
</div>
