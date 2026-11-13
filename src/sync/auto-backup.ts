// The weekly backup: on the phone, a dated copy of the whole shelf (the same
// lossless JSON as Settings → Back up) is written to Documents/BookShelf/Backups
// once a week, keeping the newest five. It runs on launch and whenever the app
// comes back, with nothing to set up. Sync is separate and optional.

import { listEntries } from '../db/database';
import { exportJson } from '../export/json';
import { callNative, isNativeShell } from '../platform/native';

const KEY = 'bookshelf:last_backup_at';
const HOUR = 3_600_000;
/** A week, less an hour of slack so it doesn't drift later each week. */
export const BACKUP_EVERY = 7 * 24 * HOUR - HOUR;
export const BACKUPS_KEPT = 5;

export function lastBackupAt(): number | null {
  try {
    const n = Number(localStorage.getItem(KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function markBackedUp(at: number): void {
  try {
    localStorage.setItem(KEY, String(at));
  } catch {
    /* private storage unavailable: it runs again next launch */
  }
}

export function backupDue(last: number | null, now: number): boolean {
  return last === null || now - last >= BACKUP_EVERY;
}

/** "bookshelf-backup-2026-11-13-0935.json": sorts by time, and never collides within a day. */
export function datedBackupName(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `bookshelf-backup-${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}.json`;
}

/** Writes the backup now. Resolves with where it went. Android only. */
export async function backupToDocuments(at = Date.now()): Promise<string> {
  const where = await callNative<string>('writeBackup', {
    name: datedBackupName(new Date(at)),
    text: await exportJson(),
    keep: BACKUPS_KEPT
  });
  markBackedUp(at);
  return where;
}

let running = false;

export async function autoBackupIfDue(): Promise<void> {
  if (!isNativeShell() || running || !backupDue(lastBackupAt(), Date.now())) return;
  running = true;
  try {
    if ((await listEntries()).length > 0) await backupToDocuments();
  } catch (err) {
    console.warn('The weekly backup could not be written', err);
  } finally {
    running = false;
  }
}

export function startAutoBackup(): void {
  if (!isNativeShell()) return;
  void autoBackupIfDue();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void autoBackupIfDue();
  });
}
