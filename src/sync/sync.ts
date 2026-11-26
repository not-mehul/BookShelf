// Encrypted folder sync (Android app).
//
// The shell keeps one file, bookshelf-sync.json, in a folder the user picked
// with the system folder picker — typically one that Google Drive, Nextcloud,
// Syncthing, etc. keep in step across devices. Each sync:
//   1. reads + decrypts the file (if any) with the passphrase from the Keystore,
//   2. merges it with the local catalog (see merge.js) and applies the result,
//   3. writes the merged snapshot back — only if the file is out of date.
// Cover images are not synced; each device re-fetches them from their URL.

import { dropRetired } from '../util/retired';
import { callNative, isNativeShell } from '../platform/native';
import { getSetting, setSetting } from '../util/settings';
import { listEntries, listTombstones, db, patchEntry, withEntryLock } from '../db/database';
import { fetchThumbBlob } from '../util/thumbs';
import { encryptPayload, decryptPayload } from './crypto';
import { entryTime, mergeSnapshots } from './merge';
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

// 2: entries carry fieldTimes and are merged field by field.
export const SNAPSHOT_VERSION = 2;
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
  if (!passphrase) throw new Error('Set a backup passphrase first.');
  if (!(await getSyncStatus())) throw new Error('Choose a backup folder first.');

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
    // What each entry was when the merge read it, to spot an edit made since.
    const readAt = new Map(local.entries.map((e) => [e.id, entryTime(e)]));
    const needCovers: import('../types').CatalogEntry[] = [];
    let pulled = 0;
    for (const incoming of result.toPut) {
      const saved = await withEntryLock(incoming.id, async () => {
        const existing = await db.entries.get(incoming.id);
        // Edited (or deleted) here since the merge read the shelf: keep that; the
        // next sync merges it.
        if (existing ? entryTime(existing) !== readAt.get(incoming.id) : readAt.has(incoming.id)) return null;
        // Keep our cached cover if the cover URL is unchanged; otherwise refetch later.
        const keepBlob =
          existing && existing.thumbnailUrl === incoming.thumbnailUrl ? existing.thumbnailBlob : null;
        // An older install may still send a book's page progress: not kept.
        const entry = dropRetired({ ...incoming, thumbnailBlob: keepBlob });
        await db.transaction('rw', db.entries, db.tombstones, async () => {
          await db.entries.put(entry);
          await db.tombstones.delete(entry.id);
        });
        return entry;
      });
      if (!saved) continue;
      pulled++;
      if (!saved.thumbnailBlob && saved.thumbnailUrl) needCovers.push(saved);
    }
    let removed = 0;
    for (const t of result.toDelete) {
      const done = await withEntryLock(t.id, async () => {
        const existing = await db.entries.get(t.id);
        // Edited here after it was deleted elsewhere: the edit is newer and brings it back.
        if (existing && entryTime(existing) >= t.deletedAt) return false;
        await db.transaction('rw', db.entries, db.tombstones, async () => {
          await db.entries.delete(t.id);
          await db.tombstones.put(t);
        });
        return true;
      });
      if (done) removed++;
    }
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
    return { pulled, removed, pushed: result.pushNeeded };
  } catch (err) {
    await setSetting('sync_last_error', err instanceof Error ? err.message : String(err));
    throw err;
  }
}
function parseSnapshot(plaintext: string): Snapshot {
  const data = JSON.parse(plaintext);
  if ((data.version ?? 0) > SNAPSHOT_VERSION)
    throw new Error('The backup was written by a newer BookShelf. Update the app.');
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
    // Only fill the cover in if the cover is unchanged and still missing; don't bump updatedAt.
    await patchEntry(
      entry.id,
      (current) => {
        if (current.thumbnailUrl !== entry.thumbnailUrl || current.thumbnailBlob) return false;
        current.thumbnailBlob = blob;
      },
      { touch: false }
    );
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

// ── Automatic backup ───────────────────────────────────────────

export type BackupEvery = 'daily' | 'weekly' | 'monthly' | 'off';
export const BACKUP_EVERY_KEY = 'sync_every';
export const BACKUP_EVERY: BackupEvery[] = ['daily', 'weekly', 'monthly', 'off'];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** How long after the last backup another is due: an hour of slack, so a
 *  backup made each morning doesn't drift later day by day. */
const INTERVAL: Record<Exclude<BackupEvery, 'off'>, number> = {
  daily: DAY - HOUR,
  weekly: 7 * DAY - HOUR,
  monthly: 30 * DAY - HOUR
};

/** The chosen frequency; daily unless changed. */
export function readBackupEvery(): BackupEvery {
  try {
    const v = localStorage.getItem(`bookshelf:${BACKUP_EVERY_KEY}`);
    return BACKUP_EVERY.includes(v as BackupEvery) ? (v as BackupEvery) : 'daily';
  } catch {
    return 'daily';
  }
}

/** Whether a backup is due, `last` being the ISO time of the last one. */
export function backupDue(every: BackupEvery, last: string, now = Date.now()): boolean {
  if (every === 'off') return false;
  const at = Date.parse(last);
  return !Number.isFinite(at) || now - at >= INTERVAL[every];
}

/**
 * Back up now if set up and due, swallowing errors (they are recorded in
 * `sync_last_error` and shown in Settings).
 * @param [onApplied] Called if the backup brought in changes from another device.
 */
export async function backupIfDue(onApplied?: () => void, now = Date.now()) {
  if (!backupDue(readBackupEvery(), await getSetting('sync_last'), now)) return;
  if (!(await isSyncConfigured())) return;
  try {
    const report = await syncNow();
    if (report.pulled || report.removed) onApplied?.();
  } catch (err) {
    console.warn('Backup failed:', err);
  }
}

/**
 * Back up on the chosen schedule: checked when the app starts and whenever
 * it comes back to the front.
 * @param onApplied Refresh the UI after incoming changes.
 */
export function startAutoBackup(onApplied?: () => void): void {
  if (!syncSupported()) return;
  void backupIfDue(onApplied);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void backupIfDue(onApplied);
  });
}
