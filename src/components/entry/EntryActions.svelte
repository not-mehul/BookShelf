<script lang="ts">
  import { deleteEntry } from '../../db/database';
  import { shelf } from '../../state/shelf.svelte';
  import { ui } from '../../state/ui.svelte';
  import type { CatalogEntry } from '../../types';
  import Icon from '../Icon.svelte';

  interface Props {
    entry: CatalogEntry;
    onedit: () => void;
  }

  let { entry, onedit }: Props = $props();
  let armed = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function remove() {
    if (!armed) {
      armed = true;
      timer = setTimeout(() => (armed = false), 3000);
      return;
    }
    clearTimeout(timer);
    await deleteEntry(entry.id);
    ui.close();
    shelf.changed();
  }
</script>

<div class="modal-actions">
  <button type="button" class="btn btn-muted" onclick={onedit}>
    <Icon name="edit" /> <span class="btn-label">Edit</span>
  </button>
  <button type="button" class="btn btn-muted" onclick={() => ui.open({ kind: 'share', id: entry.id })}>
    <Icon name="share" /> <span class="btn-label">Share</span>
  </button>
  <button type="button" class="btn btn-danger" onclick={remove}
    >{armed ? 'Tap again to confirm' : 'Remove'}</button
  >
</div>
