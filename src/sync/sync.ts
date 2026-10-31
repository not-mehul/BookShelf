// Encrypted folder sync (Android app).
//
// The shell keeps one file, bookshelf-sync.json, in a folder the user picked
// with the system folder picker — typically one that Google Drive, Nextcloud,
// Syncthing, etc. keep in step across devices. Each sync:
//   1. reads + decrypts the file (if any) with the passphrase from the Keystore,
//   2. merges it with the local catalog (see merge.js) and applies the result,
//   3. writes the merged snapshot back — only if the file is out of date.
// Cover images are not synced; each device re-fetches them from their URL.

import { callNative, isNativeShell } from '../platform/native';
import { getSetting, setSetting } from '../util/settings';
import { listEntries, listTombstones, saveEntry, deleteEntry, getEntry, db } from '../db/database';
import { fetchThumbBlob } from '../util/thumbs';
import { encryptPayload, decryptPayload } from './crypto';
import { mergeSnapshots } from './merge';
import type { Snapshot, SyncEntry } from './merge';

export type SyncStatus = { folderName: string } | null;
export interface SyncReport {
  /** Entries added/updated on this device. */
  pulled: number;
  /** Entries deleted on this device. */
  removed: number;
  /** Whether the sync file was rewritten. */
  pushed: boolean;
}

export const SNAPSHOT_VERSION = 1;
let inFlight: Promise<SyncReport> | null = null;

export function syncSupported() {
  return isNativeShell();
}

/** @returns The chosen folder, or null if none / access was revoked. */
export async function getSyncStatus(): Promise<SyncStatus> {
  return syncSupported() ? callNative<SyncStatus>('syncStatus') : null;
}

/** Whether sync is fully set up (folder + passphrase). */
export async function isSyncConfigured() {
  return Boolean((await getSyncStatus()) && (await getSetting('sync_passphrase')));
}

/**
 * Merge with the sync file and write back. Concurrent calls share one run.
 * @param [options] Test hook for a cheaper KDF.
 */
export function syncNow(options: { iterations?: number } = {}): Promise<SyncReport> {
  inFlight ??= runSync(options).finally(() => {
    inFlight = null;
  });
  return inFlight;
}
async function runSync({ iterations }: { iterations?: number }): Promise<SyncReport> {
  const passphrase = await getSetting('sync_passphrase');
  if (!passphrase) throw new Error('Set a sync passphrase first.');
  if (!(await getSyncStatus())) throw new Error('Choose a sync folder first.');

  try {
    // 1. Pull.
    let remote: Snapshot = { entries: [], tombstones: [] };
    let salt: string | undefined;
    const remoteText = await callNative<string | null>('syncRead');
    if (remoteText) {
      const decrypted = await decryptPayload(remoteText, passphrase);
      salt = decrypted.salt;
      remote = parseSnapshot(decrypted.plaintext);
    }

    // 2. Merge + apply locally.
    const local = { entries: (await listEntries()).map(toSyncEntry), tombstones: await listTombstones() };
    const result = mergeSnapshots(local, remote);
    const needCovers: import('../types').CatalogEntry[] = [];
    for (const incoming of result.toPut) {
      const existing = await getEntry(incoming.id);
      // Keep our cached cover if the cover URL is unchanged; otherwise refetch later.
      const keepBlob =
        existing && existing.thumbnailUrl === incoming.thumbnailUrl ? existing.thumbnailBlob : null;
      const saved = await saveEntry({ ...incoming, thumbnailBlob: keepBlob }, { touch: false });
      if (!keepBlob && saved.thumbnailUrl) needCovers.push(saved);
    }
    for (const t of result.toDelete) await deleteEntry(t.id, t.deletedAt);
    if (result.newTombstones.length) await db.tombstones.bulkPut(result.newTombstones);

    // 3. Push, only when the file is behind.
    if (result.pushNeeded) {
      const snapshot = { version: SNAPSHOT_VERSION, writtenAt: new Date().toISOString(), ...result.merged };
      const text = await encryptPayload(JSON.stringify(snapshot), passphrase, {
        iterations,
        reuseSalt: salt
      });
      await callNative('syncWrite', { text });
    }

    await setSetting('sync_last', new Date().toISOString());
    await setSetting('sync_last_error', '');
    void refetchCovers(needCovers);
    return { pulled: result.toPut.length, removed: result.toDelete.length, pushed: result.pushNeeded };
  } catch (err) {
    await setSetting('sync_last_error', err instanceof Error ? err.message : String(err));
    throw err;
  }
}
function parseSnapshot(plaintext: string): Snapshot {
  const data = JSON.parse(plaintext);
  if ((data.version ?? 0) > SNAPSHOT_VERSION)
    throw new Error('The sync file was written by a newer BookShelf. Update the app.');
  return {
    entries: Array.isArray(data.entries) ? data.entries : [],
    tombstones: Array.isArray(data.tombstones) ? data.tombstones : []
  };
}

/**
 * Strip the cover blob: it is device-local cache, re-fetchable from thumbnailUrl.
 */
function toSyncEntry({ thumbnailBlob: _blob, ...rest }: import('../types').CatalogEntry): SyncEntry {
  return rest;
}

async function refetchCovers(entries: import('../types').CatalogEntry[]) {
  for (const entry of entries) {
    const blob = await fetchThumbBlob(entry.thumbnailUrl);
    if (!blob) continue;
    const current = await getEntry(entry.id);
    // Only fill the cover in if nothing changed meanwhile; don't bump updatedAt.
    if (current && current.updatedAt === entry.updatedAt && !current.thumbnailBlob) {
      await saveEntry({ ...current, thumbnailBlob: blob }, { touch: false });
    }
  }
}

/** Pick (or change) the sync folder via the system picker. */
export async function chooseSyncFolder() {
  return callNative<SyncStatus>('syncPickFolder');
}

/** Stop syncing: forget the folder (the file and passphrase are left as they are). */
export async function forgetSyncFolder() {
  await callNative('syncForget');
}

// ── Automatic sync ─────────────────────────────────────────────

const DEBOUNCE_MS = 15_000;
const MIN_INTERVAL_MS = 60_000;
let debounce: ReturnType<typeof setTimeout> | undefined;
let lastRun = 0;

/**
 * Run a sync in the background if configured, swallowing errors (they are
 * recorded in `sync_last_error` and shown in Settings).
 * @param [onApplied] Called if the sync changed local data.
 */
export async function backgroundSync(onApplied?: () => void) {
  if (!(await isSyncConfigured())) return;
  lastRun = Date.now();
  try {
    const report = await syncNow();
    if (report.pulled || report.removed) onApplied?.();
  } catch (err) {
    console.warn('Sync failed:', err);
  }
}

/**
 * Wire automatic sync: on start, shortly after local changes, when the app is
 * backgrounded (push before the user leaves), and when it returns (pull).
 * @param onApplied Refresh the UI after incoming changes.
 * @returns Call after every local change to schedule a sync.
 */
export function startAutoSync(onApplied?: () => void): () => void {
  if (!syncSupported()) return () => {};
  void backgroundSync(onApplied);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (debounce !== undefined) {
        clearTimeout(debounce);
        debounce = undefined;
        void backgroundSync(onApplied);
      }
    } else if (Date.now() - lastRun > MIN_INTERVAL_MS) {
      void backgroundSync(onApplied);
    }
  });
  return () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = undefined;
      void backgroundSync(onApplied);
    }, DEBOUNCE_MS);
  };
}
