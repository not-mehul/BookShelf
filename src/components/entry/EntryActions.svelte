<script lang="ts">
  import { shelf } from '../../state/shelf.svelte';
  import { ui } from '../../state/ui.svelte';
  import type { CatalogEntry } from '../../types';
  import { deleteEntries, restoreEntries } from '../../util/bulk';
  import { messageOf } from '../../util/errors';
  import Icon from '../Icon.svelte';

  interface Props {
    entry: CatalogEntry;
    onedit: () => void;
  }

  let { entry, onedit }: Props = $props();

  // Removing can be undone for a few seconds instead of being confirmed (style.md §8.12).
  async function remove() {
    const removed = await deleteEntries([entry.id]);
    ui.close();
    shelf.changed();
    ui.notify(entry.type === 'quote' ? 'Removed the quote.' : `Removed ${entry.title}.`, 'info', {
      label: 'Undo',
      run: () =>
        void restoreEntries(removed).then(
          () => shelf.changed(),
          (err: unknown) => ui.notify(`Couldn't restore it: ${messageOf(err)}`, 'error')
        )
    });
  }
</script>

<div class="modal-actions">
  <button type="button" class="btn btn-muted" onclick={onedit}>
    <Icon name="edit" /> <span class="btn-label">Edit</span>
  </button>
  <button type="button" class="btn btn-muted" onclick={() => ui.open({ kind: 'share', id: entry.id })}>
    <Icon name="share" /> <span class="btn-label">Share</span>
  </button>
  <button type="button" class="btn btn-danger" onclick={remove}>Remove</button>
</div>
