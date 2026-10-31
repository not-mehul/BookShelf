<script lang="ts">
  import { pushEpisodeReminders } from '../../api/episode-sync';
  import { listEntries } from '../../db/database';
  import { callNative } from '../../platform/native';
  import type { CatalogEntry } from '../../types';
  import Icon from '../Icon.svelte';

  // Per-show "notify me" switch (Android app). Asks for notification
  // permission when turned on, and reverts if it's refused.
  interface Props {
    entry: CatalogEntry;
    update: (change: (draft: CatalogEntry) => void | Promise<void>) => Promise<void>;
  }

  let { entry, update }: Props = $props();
  let note = $state('');
  const id = $derived(`remind-${entry.id}`);

  async function onchange(ev: Event & { currentTarget: HTMLInputElement }) {
    const box = ev.currentTarget;
    const on = box.checked;
    if (on) {
      const granted = await callNative('requestNotificationPermission').catch(() => false);
      if (!granted) {
        box.checked = false;
        note = 'Notifications are off for BookShelf — allow them in system settings.';
        return;
      }
    }
    note = '';
    await update((d) => void (d.remindNewEpisodes = on));
    await pushEpisodeReminders(await listEntries());
  }
</script>

<div class="remind-wrap">
  <label class="remind-toggle" for={id}>
    <input type="checkbox" {id} checked={Boolean(entry.remindNewEpisodes)} {onchange} />
    <span aria-hidden="true"><Icon name="bell" /></span> New-episode alerts
  </label>
  <span class="remind-note" role="status">{note}</span>
</div>
