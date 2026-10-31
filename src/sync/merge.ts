// Pure merge of two catalog snapshots (this device vs. the sync file).
//
// Every entry carries `updatedAt`; every deletion leaves a tombstone with
// `deletedAt`. For each id the most recent event wins:
//   • two versions of an entry → the later `updatedAt` (ties keep local)
//   • an entry vs. a tombstone  → whichever happened later, so a delete
//     propagates, but an edit made after the delete brings the entry back.
// Tombstones older than the retention window are dropped.

import type { CatalogEntry, Tombstone } from '../types';

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

const entryTime = (e: SyncEntry) => e.updatedAt || e.dateAdded || EPOCH;
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

    // Latest version of the entry, if either side has it.
    let entry = localEntry;
    if (remoteEntry && (!entry || entryTime(remoteEntry) > entryTime(entry))) entry = remoteEntry;
    // Latest deletion, if either side has one.
    let tomb = localTomb;
    if (remoteTomb && (!tomb || remoteTomb.deletedAt > tomb.deletedAt)) tomb = remoteTomb;

    if (entry && (!tomb || entryTime(entry) >= tomb.deletedAt)) {
      result.merged.entries.push(entry);
      if (entry !== localEntry && (!localEntry || entryTime(entry) > entryTime(localEntry)))
        result.toPut.push(entry);
      if (!remoteEntry || entryTime(remoteEntry) < entryTime(entry)) result.pushNeeded = true;
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
