// Pure merge of two catalog snapshots (this device vs. the sync file).
//
// Every entry carries `updatedAt` (and `fieldTimes`, when each group of its
// fields last changed); every deletion leaves a tombstone with `deletedAt`.
//   • two versions of an entry → merged field by field, each group from the
//     copy that changed it last (ties keep local; see fields.ts)
//   • an entry vs. a tombstone  → whichever happened later, so a delete
//     propagates, but an edit made after the delete brings the entry back.
// Tombstones older than the retention window are dropped.

import type { CatalogEntry, Tombstone } from '../types';
import { mergeEntry } from './fields';

/** An entry as it travels in the sync file (no cover blob). */
export type SyncEntry = Omit<CatalogEntry, 'thumbnailBlob'>;
export type Snapshot = { entries: SyncEntry[]; tombstones: Tombstone[] };
export interface MergeResult {
  /** What both sides should now hold. */
  merged: Snapshot;
  /** Entries this device must save. */
  toPut: SyncEntry[];
  /** Entries this device must delete. */
  toDelete: Tombstone[];
  /** Remote tombstones this device lacks (for ids it never had), to keep propagating them. */
  newTombstones: Tombstone[];
  /** Whether the sync file is out of date. */
  pushNeeded: boolean;
}

export const TOMBSTONE_RETENTION_DAYS = 365;
const EPOCH = new Date(0).toISOString();

/** When an entry last changed, as the merge compares it. */
export const entryTime = (e: Pick<SyncEntry, 'updatedAt' | 'dateAdded'>) =>
  e.updatedAt || e.dateAdded || EPOCH;

/** JSON with object keys in order, so key order never makes two copies differ. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(v ?? null);
}

/** The same content, key order aside. */
const sameEntry = (a: SyncEntry, b: SyncEntry) => canonical(a) === canonical(b);

export function mergeSnapshots(
  local: Snapshot,
  remote: Snapshot,
  { now = new Date() }: { now?: Date } = {}
): MergeResult {
  const cutoff = new Date(now.getTime() - TOMBSTONE_RETENTION_DAYS * 86_400_000).toISOString();
  const byId = (list: { id: string }[]) => new Map(list.map((x) => [x.id, x]));
  const [le, re] = [byId(local.entries), byId(remote.entries)];
  const [lt, rt] = [byId(local.tombstones), byId(remote.tombstones)];
  const ids = new Set([...le.keys(), ...re.keys(), ...lt.keys(), ...rt.keys()]);
  const result: MergeResult = {
    merged: { entries: [], tombstones: [] },
    toPut: [],
    toDelete: [],
    newTombstones: [],
    pushNeeded: false
  };

  for (const id of ids) {
    const localEntry = le.get(id) as SyncEntry | undefined;
    const remoteEntry = re.get(id) as SyncEntry | undefined;
    const localTomb = lt.get(id) as Tombstone | undefined;
    const remoteTomb = rt.get(id) as Tombstone | undefined;

    // The entry as both sides' edits make it, if either side has it.
    const entry =
      localEntry && remoteEntry ? mergeEntry(localEntry, remoteEntry) : (localEntry ?? remoteEntry);
    // Latest deletion, if either side has one.
    let tomb = localTomb;
    if (remoteTomb && (!tomb || remoteTomb.deletedAt > tomb.deletedAt)) tomb = remoteTomb;

    if (entry && (!tomb || entryTime(entry) >= tomb.deletedAt)) {
      result.merged.entries.push(entry);
      if (!localEntry || !sameEntry(entry, localEntry)) result.toPut.push(entry);
      if (!remoteEntry || !sameEntry(entry, remoteEntry)) result.pushNeeded = true;
      continue;
    }

    if (!tomb) continue; // unreachable: id came from somewhere
    if (tomb.deletedAt < cutoff) {
      if (remoteTomb) result.pushNeeded = true; // prune it from the file
      continue;
    }
    result.merged.tombstones.push(tomb);
    if (localEntry) result.toDelete.push(tomb);
    else if (!localTomb || localTomb.deletedAt < tomb.deletedAt) result.newTombstones.push(tomb);
    if (remoteEntry || !remoteTomb || remoteTomb.deletedAt < tomb.deletedAt) result.pushNeeded = true;
  }
  return result;
}
