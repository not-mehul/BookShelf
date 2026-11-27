<script lang="ts">
  // An entry's actions, in its sheet's bar: Edit, Find a match, Share and
  // Delete. Deleting can
  // be undone for a few seconds instead of being confirmed (style.md §8.12).
  import { lacksMatch } from '../../api/match';
  import { shelf } from '../../state/shelf.svelte';
  import { ui } from '../../state/ui.svelte';
  import type { CatalogEntry } from '../../types';
  import { deleteEntries, restoreEntries } from '../../util/bulk';
  import { messageOf } from '../../util/errors';
  import OverflowMenu, { type MenuItem } from '../OverflowMenu.svelte';

  interface Props {
    entry: CatalogEntry;
    onedit: () => void;
    /** Books, films and shows: link to the catalog for a cover and details. */
    onmatch?: () => void;
  }

  let { entry, onedit, onmatch }: Props = $props();

  async function remove() {
    const removed = await deleteEntries([entry.id]);
    ui.close();
    shelf.changed();
    ui.notify(entry.type === 'quote' ? 'Deleted the quote.' : `Deleted ${entry.title}.`, 'info', {
      label: 'Undo',
      run: () =>
        void restoreEntries(removed).then(
          () => shelf.changed(),
          (err: unknown) => ui.notify(`Couldn't restore it: ${messageOf(err)}`, 'error')
        )
    });
  }

  const items = $derived<MenuItem[]>([
    { label: 'Edit details', icon: 'edit', onselect: onedit },
    ...(onmatch
      ? [
          {
            label: lacksMatch(entry) ? 'Find a match' : 'Match again',
            icon: 'search' as const,
            onselect: onmatch
          }
        ]
      : []),
    { label: 'Share', icon: 'share', onselect: () => ui.open({ kind: 'share', id: entry.id }) },
    { label: 'Delete', icon: 'trash', danger: true, onselect: () => void remove() }
  ]);
</script>

<OverflowMenu label="Actions for this entry" {items} />
