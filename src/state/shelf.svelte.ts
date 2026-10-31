// The catalog as the UI sees it: every entry, reloaded after each change.

import { listEntries } from '../db/database';
import { pushWidgetSummary } from '../platform/widget';
import { pushEpisodeReminders } from '../api/episode-sync';
import { startAutoSync } from '../sync/sync';
import type { CatalogEntry } from '../types';

class Shelf {
  entries = $state.raw<CatalogEntry[]>([]);
  loaded = $state(false);
  /** Every distinct tag, sorted, for the filter chips. */
  tags = $derived([...new Set(this.entries.flatMap((e) => e.tags || []))].sort((a, b) => a.localeCompare(b)));

  private scheduleSync: () => void = () => {};

  /** Re-read the catalog, and keep the home-screen widget and episode alerts current. */
  async refresh(): Promise<void> {
    const entries = await listEntries();
    this.entries = entries;
    this.loaded = true;
    void pushWidgetSummary(entries);
    void pushEpisodeReminders(entries);
  }

  /** After a local edit: refresh, then schedule a (debounced) sync push. */
  changed(): void {
    void this.refresh();
    this.scheduleSync();
  }

  /** Encrypted folder sync (Android, once set up). Incoming changes only refresh. */
  startSync(): void {
    this.scheduleSync = startAutoSync(() => void this.refresh());
  }
}

export const shelf = new Shelf();
