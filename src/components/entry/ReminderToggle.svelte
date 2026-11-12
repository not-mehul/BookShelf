<script lang="ts">
  import { pushEpisodeReminders } from '../../api/episode-sync';
  import { listEntries } from '../../db/database';
  import { callNative } from '../../platform/native';
  import type { CatalogEntry } from '../../types';
  import { Switch } from 'dusk-dawn';

  // Per-show "notify me" switch (Android app). Asks for notification
  // permission when turned on, and reverts if it's refused.
  interface Props {
    entry: CatalogEntry;
    update: (change: (draft: CatalogEntry) => void | Promise<void>) => Promise<void>;
  }

  let { entry, update }: Props = $props();
  let note = $state('');
  const id = $derived(`remind-${entry.id}`);

  async function onchange(on: boolean) {
    if (on) {
      const granted = await callNative('requestNotificationPermission').catch(() => false);
      if (!granted) {
        note = 'Notifications are off for BookShelf. Allow them in system settings.';
        return;
      }
    }
    note = '';
    await update((d) => void (d.remindNewEpisodes = on));
    await pushEpisodeReminders(await listEntries());
  }
</script>

<div class="remind-wrap">
  <Switch
    {id}
    checked={Boolean(entry.remindNewEpisodes)}
    label="New-episode alerts"
    hint="A notification when a new episode airs."
    {onchange}
  />
  {#if note}<p class="remind-note" role="status">{note}</p>{/if}
</div>
