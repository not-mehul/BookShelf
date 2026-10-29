// Pure merge of two catalog snapshots (this device vs. the sync file).
//
// Every entry carries `updatedAt`; every deletion leaves a tombstone with
// `deletedAt`. For each id the most recent event wins:
//   • two versions of an entry → the later `updatedAt` (ties keep local)
//   • an entry vs. a tombstone  → whichever happened later, so a delete
//     propagates, but an edit made after the delete brings the entry back.
// Tombstones older than the retention window are dropped.

/** @typedef {import('../types').Tombstone} Tombstone */
/**
 * An entry as it travels in the sync file (no cover blob).
 * @typedef {Omit<import('../types').CatalogEntry, 'thumbnailBlob'>} SyncEntry
 */
/** @typedef {{ entries: SyncEntry[], tombstones: Tombstone[] }} Snapshot */
/**
 * @typedef {object} MergeResult
 * @property {Snapshot} merged      What both sides should now hold.
 * @property {SyncEntry[]} toPut    Entries this device must save.
 * @property {Tombstone[]} toDelete Entries this device must delete.
 * @property {Tombstone[]} newTombstones Remote tombstones this device lacks
 *   (for ids it never had), to keep propagating them.
 * @property {boolean} pushNeeded   Whether the sync file is out of date.
 */

export const TOMBSTONE_RETENTION_DAYS = 365;
const EPOCH = new Date(0).toISOString();

/** @param {SyncEntry} e */
const entryTime = (e) => e.updatedAt || e.dateAdded || EPOCH;

/**
 * @param {Snapshot} local
 * @param {Snapshot} remote
 * @param {{ now?: Date }} [options]
 * @returns {MergeResult}
 */
export function mergeSnapshots(local, remote, { now = new Date() } = {}) {
  const cutoff = new Date(now.getTime() - TOMBSTONE_RETENTION_DAYS * 86_400_000).toISOString();
  const byId = (/** @type {{ id: string }[]} */ list) => new Map(list.map((x) => [x.id, x]));
  const [le, re] = [byId(local.entries), byId(remote.entries)];
  const [lt, rt] = [byId(local.tombstones), byId(remote.tombstones)];
  const ids = new Set([...le.keys(), ...re.keys(), ...lt.keys(), ...rt.keys()]);

  /** @type {MergeResult} */
  const result = {
    merged: { entries: [], tombstones: [] },
    toPut: [],
    toDelete: [],
    newTombstones: [],
    pushNeeded: false
  };

  for (const id of ids) {
    const localEntry = /** @type {SyncEntry | undefined} */ (le.get(id));
    const remoteEntry = /** @type {SyncEntry | undefined} */ (re.get(id));
    const localTomb = /** @type {Tombstone | undefined} */ (lt.get(id));
    const remoteTomb = /** @type {Tombstone | undefined} */ (rt.get(id));

    // Latest version of the entry, if either side has it.
    let entry = localEntry;
    if (remoteEntry && (!entry || entryTime(remoteEntry) > entryTime(entry))) entry = remoteEntry;
    // Latest deletion, if either side has one.
    let tomb = localTomb;
    if (remoteTomb && (!tomb || remoteTomb.deletedAt > tomb.deletedAt)) tomb = remoteTomb;

    if (entry && (!tomb || entryTime(entry) >= tomb.deletedAt)) {
      result.merged.entries.push(entry);
      if (entry !== localEntry && (!localEntry || entryTime(entry) > entryTime(localEntry))) result.toPut.push(entry);
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
