// End-to-end sync between two simulated devices sharing one folder: each has
// its own IndexedDB, Keystore and module instances; only the folder is shared.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

// A backup written before 3.1, encrypted with the passphrase "old secret".
const OLD_FILE = readFileSync(new URL('./fixtures/legacy-encrypted-backup.json', import.meta.url), 'utf8');

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k)
  };
}

// Answers plugin calls the way BookShelfPlugin.kt / FolderSync.kt do.
function fakeShell(folder, keystore) {
  const methods = {
    secureGet: ({ key }) => keystore.get(key) ?? null,
    secureSet: ({ key, value }) => keystore.set(key, value) && true,
    secureRemove: ({ key }) => keystore.delete(key),
    syncStatus: () => (folder.chosen ? { folderName: 'Drive/BookShelf' } : null),
    syncRead: () => folder.file ?? null,
    syncWrite: ({ text }) => {
      folder.file = text;
      folder.writes++;
      return true;
    }
  };
  return {
    call: async (method, params) => {
      const value = methods[method](params);
      return value == null ? {} : { value };
    },
    on: () => {},
    setBarStyle: () => {}
  };
}

const win = () => ({ fetch: vi.fn(), location: { origin: 'https://appassets.androidwebview.com' } });

async function device(folder, { oldPassphrase } = {}) {
  const keystore = new Map(oldPassphrase ? [['sync_passphrase', oldPassphrase]] : []);
  vi.resetModules();
  // resetModules doesn't re-import node_modules, so Dexie is shared between
  // devices; give each device's database its own IndexedDB (Dexie opens lazily
  // with the current dependencies, and an open db keeps its connection).
  (await import('dexie')).default.dependencies.indexedDB = new IDBFactory();
  globalThis.localStorage = memoryStorage();
  (await import('../src/platform/native.js')).installNativeBridge(win(), fakeShell(folder, keystore));
  const db = await import('../src/db/database.js');
  const sync = await import('../src/sync/sync.js');
  const add = (id, title) =>
    db.saveEntry({
      id,
      type: 'book',
      sourceId: null,
      title,
      creators: [],
      year: null,
      summary: '',
      genres: [],
      thumbnailUrl: null,
      thumbnailBlob: null,
      rating: null,
      notes: '',
      dateAdded: new Date().toISOString(),
      dateRated: null
    });
  const titles = async () => (await db.listEntries()).map((e) => e.title).sort();
  return { db, add, titles, keystore, sync: () => sync.syncNow() };
}

beforeAll(async () => {
  (await import('dexie')).default.dependencies.IDBKeyRange = IDBKeyRange;
});

describe('folder sync between two devices', () => {
  it('converges adds, edits and deletes in both directions', async () => {
    const folder = { chosen: true, file: null, writes: 0 };
    const phone = await device(folder);
    await phone.add('a', 'Dune');
    await phone.add('b', 'Emma');
    expect(await phone.sync()).toEqual({ pulled: 0, removed: 0, pushed: true });
    // A plain, readable file.
    expect(JSON.parse(folder.file)).toMatchObject({ format: 'bookshelf-backup', version: 2 });
    expect(folder.file).toContain('Dune');

    const tablet = await device(folder);
    await tablet.add('c', 'Ubik');
    expect(await tablet.sync()).toEqual({ pulled: 2, removed: 0, pushed: true });
    expect(await tablet.titles()).toEqual(['Dune', 'Emma', 'Ubik']);

    // Phone edits one entry and deletes another…
    await new Promise((r) => setTimeout(r, 5)); // distinct timestamps
    const dune = await phone.db.getEntry('a');
    await phone.db.saveEntry({ ...dune, title: 'Dune Messiah' });
    await phone.db.deleteEntry('b');
    expect(await phone.sync()).toMatchObject({ pulled: 1, pushed: true });
    expect(await phone.titles()).toEqual(['Dune Messiah', 'Ubik']);

    // …and the tablet picks both up.
    expect(await tablet.sync()).toMatchObject({ pulled: 1, removed: 1, pushed: false });
    expect(await tablet.titles()).toEqual(['Dune Messiah', 'Ubik']);
  });

  it('keeps edits to different fields of one entry made on two devices', async () => {
    const folder = { chosen: true, file: null, writes: 0 };
    const phone = await device(folder);
    await phone.add('a', 'Dune');
    await phone.sync();
    const tablet = await device(folder);
    await tablet.sync();

    // Both edit the same book before either syncs: a rating here, a tag there.
    await new Promise((r) => setTimeout(r, 5));
    await phone.db.patchEntry('a', (d) => void (d.rating = 4.5));
    await new Promise((r) => setTimeout(r, 5));
    await tablet.db.patchEntry('a', (d) => void (d.tags = ['sci-fi']));

    await phone.sync();
    await tablet.sync();
    await phone.sync();
    for (const device of [phone, tablet]) {
      expect(await device.db.getEntry('a')).toMatchObject({ rating: 4.5, tags: ['sci-fi'] });
    }
  });

  it('does not rewrite the file when nothing changed', async () => {
    const folder = { chosen: true, file: null, writes: 0 };
    const phone = await device(folder);
    await phone.add('a', 'Dune');
    await phone.sync();
    await phone.sync();
    expect(folder.writes).toBe(1);
  });

  it('reads an old encrypted backup once, then rewrites it plain and forgets the passphrase', async () => {
    const folder = { chosen: true, file: OLD_FILE, writes: 0 };
    const phone = await device(folder, { oldPassphrase: 'old secret' });
    await phone.add('a', 'Dune');
    expect(await phone.sync()).toEqual({ pulled: 1, removed: 0, pushed: true });
    expect(await phone.titles()).toEqual(['Dune', 'Piranesi — encrypted']);
    expect(JSON.parse(folder.file)).toMatchObject({ format: 'bookshelf-backup' });
    expect(phone.keystore.has('sync_passphrase')).toBe(false);
    // From then on, any device reads it without one.
    const tablet = await device(folder);
    expect(await tablet.sync()).toMatchObject({ pulled: 2 });
  });

  it('says so, and leaves the file alone, when an old encrypted backup has no passphrase here', async () => {
    const folder = { chosen: true, file: OLD_FILE, writes: 0 };
    const phone = await device(folder);
    await expect(phone.sync()).rejects.toThrow(/encrypted backup from an earlier BookShelf/);
    expect(folder.file).toBe(OLD_FILE);
  });

  it('requires a folder', async () => {
    const phone = await device({ chosen: false, file: null, writes: 0 });
    await expect(phone.sync()).rejects.toThrow(/folder/);
  });
});
