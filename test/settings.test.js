import { describe, it, expect, vi, beforeEach } from 'vitest';

// Map-backed localStorage stand-in (Node has none by default).
function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _map: m
  };
}

// Fake shell whose Keystore is a Map, answering plugin calls like BookShelfPlugin.kt.
function fakeShellWithKeystore() {
  const keystore = new Map();
  const calls = [];
  const shell = {
    call: async (method, { key, value }) => {
      calls.push(method);
      if (method === 'secureGet') return keystore.has(key) ? { value: keystore.get(key) } : {};
      if (method === 'secureSet') keystore.set(key, value);
      if (method === 'secureRemove') keystore.delete(key);
      return { value: true };
    },
    on: () => {},
    setBarStyle: () => {}
  };
  const win = { fetch: vi.fn(), location: { origin: 'https://appassets.androidwebview.com' } };
  return { win, shell, keystore, calls };
}

let settings, native;
beforeEach(async () => {
  vi.resetModules();
  globalThis.localStorage = memoryStorage();
  native = await import('../src/platform/native.js');
  settings = await import('../src/util/settings.js');
});

describe('settings in a plain browser', () => {
  it('stores everything, secrets included, in localStorage', async () => {
    await settings.setSetting('tvdb_api_key', 'k1');
    await settings.setSetting('theme', 'light');
    expect(localStorage.getItem('bookshelf:tvdb_api_key')).toBe('k1');
    expect(await settings.getSetting('theme')).toBe('light');
    expect(await settings.getSetting('missing', 'fb')).toBe('fb');
  });
});

describe('settings inside the Android shell', () => {
  it('keeps secrets in the Keystore and ordinary settings in localStorage', async () => {
    const shell = fakeShellWithKeystore();
    native.installNativeBridge(shell.win, shell.shell);

    await settings.setSetting('tvdb_api_key', 'secret');
    await settings.setSetting('theme', 'dark');
    expect(shell.keystore.get('tvdb_api_key')).toBe('secret');
    expect(localStorage.getItem('bookshelf:tvdb_api_key')).toBeNull();
    expect(localStorage.getItem('bookshelf:theme')).toBe('dark');
    expect(await settings.getSetting('tvdb_api_key')).toBe('secret');

    await settings.removeSetting('tvdb_api_key');
    expect(shell.keystore.has('tvdb_api_key')).toBe(false);
    expect(await settings.getSetting('tvdb_api_key', 'none')).toBe('none');
  });

  it('migrates plaintext secrets out of localStorage exactly once', async () => {
    localStorage.setItem('bookshelf:google_books_api_key', 'legacy');
    localStorage.setItem('bookshelf:theme', 'light');
    const shell = fakeShellWithKeystore();
    native.installNativeBridge(shell.win, shell.shell);

    expect(await settings.getSetting('google_books_api_key')).toBe('legacy');
    expect(shell.keystore.get('google_books_api_key')).toBe('legacy');
    expect(localStorage.getItem('bookshelf:google_books_api_key')).toBeNull();
    expect(localStorage.getItem('bookshelf:theme')).toBe('light'); // not a secret

    const setsBefore = shell.calls.filter((c) => c === 'secureSet').length;
    await settings.getSetting('tvdb_pin');
    expect(shell.calls.filter((c) => c === 'secureSet').length).toBe(setsBefore);
  });

  it('caches Keystore reads for the session', async () => {
    const shell = fakeShellWithKeystore();
    native.installNativeBridge(shell.win, shell.shell);
    shell.keystore.set('tvdb_token', 't');
    await settings.getSetting('tvdb_token');
    await settings.getSetting('tvdb_token');
    expect(shell.calls.filter((c) => c === 'secureGet')).toHaveLength(1);
  });
});
