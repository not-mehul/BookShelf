// The catalog as the UI sees it: every entry, reloaded after each change.

import { uniqueTags } from '../util/tags';
import { listEntries } from '../db/database';
import { pushWidgetSummary } from '../platform/widget';
import { pushEpisodeReminders } from '../api/episode-sync';
import { startAutoBackup } from '../sync/sync';
import type { CatalogEntry } from '../types';

class Shelf {
  entries = $state.raw<CatalogEntry[]>([]);
  loaded = $state(false);
  /** Every distinct tag, sorted, for the filter chips. */
  // One chip per tag, however its case varies between entries.
  tags = $derived(uniqueTags(this.entries.flatMap((e) => e.tags || [])).sort((a, b) => a.localeCompare(b)));

  /** Re-read the catalog, and keep the home-screen widget and episode alerts current. */
  async refresh(): Promise<void> {
    const entries = await listEntries();
    this.entries = entries;
    this.loaded = true;
    void pushWidgetSummary(entries);
    void pushEpisodeReminders(entries);
  }

  /** After a local edit: show it. */
  changed(): void {
    void this.refresh();
  }

  /** The encrypted backup (Android, once set up), on its schedule. Incoming changes only refresh. */
  startBackup(): void {
    startAutoBackup(() => void this.refresh());
  }
}

export const shelf = new Shelf();
