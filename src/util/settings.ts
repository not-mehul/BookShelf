// Tiny settings layer.
//
// Ordinary preferences live in localStorage (namespaced). Secrets — API keys,
// and an old backup's passphrase until that backup is rewritten — go to the
// Android Keystore through
// the native shell when running in the app, and are migrated out of
// localStorage the first time. In a plain browser there is no Keystore, so
// secrets fall back to localStorage.

import { isNativeShell, callNative } from '../platform/native';

const PREFIX = 'bookshelf:';

/** Setting keys whose values are secrets. */
export const SECRET_KEYS = new Set(['tmdb_api_key', 'google_books_api_key', 'sync_passphrase']);

/** TheTVDB's settings, from before films and shows moved to TMDB: removed once. */
const RETIRED_SECRETS = ['tvdb_api_key', 'tvdb_pin', 'tvdb_token', 'tvdb_proxy_token'];
const RETIRED_PLAIN = ['tvdb_token_issued', 'tvdb_proxy_url'];

/** In-memory cache of Keystore reads for this session. */
const secretCache: Map<string, string | null> = new Map();
let migration: Promise<void> | null = null;

const useKeystore = (key: string) => SECRET_KEYS.has(key) && isNativeShell();

// One-time move of secrets saved before the Keystore existed (or by an older
// build) from localStorage into the Keystore.
function migrateSecrets() {
  migration ??= (async () => {
    for (const key of SECRET_KEYS) {
      const legacy = localStorage.getItem(PREFIX + key);
      if (legacy === null) continue;
      await callNative('secureSet', { key, value: legacy });
      localStorage.removeItem(PREFIX + key);
    }
  })();
  return migration;
}
export async function getSetting(key: string, fallback: string = ''): Promise<string> {
  if (useKeystore(key)) {
    await migrateSecrets();
    if (!secretCache.has(key)) secretCache.set(key, await callNative<string | null>('secureGet', { key }));
    return secretCache.get(key) ?? fallback;
  }
  const v = localStorage.getItem(PREFIX + key);
  return v === null ? fallback : v;
}
export async function setSetting(key: string, value: string | number | boolean) {
  if (useKeystore(key)) {
    await migrateSecrets();
    await callNative('secureSet', { key, value: String(value) });
    secretCache.set(key, String(value));
    return;
  }
  localStorage.setItem(PREFIX + key, String(value));
}

export async function removeSetting(key: string) {
  if (useKeystore(key)) {
    await migrateSecrets();
    await callNative('secureRemove', { key });
    secretCache.set(key, null);
    return;
  }
  localStorage.removeItem(PREFIX + key);
}

/**
 * Forget TheTVDB's key, PIN, token and proxy settings, from before films and
 * shows moved to TMDB. Runs once; a later start skips it.
 */
export async function dropTvdbSettings() {
  const done = PREFIX + 'tvdb_retired';
  if (localStorage.getItem(done)) return;
  for (const key of [...RETIRED_SECRETS, ...RETIRED_PLAIN]) localStorage.removeItem(PREFIX + key);
  if (isNativeShell()) {
    for (const key of RETIRED_SECRETS) {
      try {
        await callNative('secureRemove', { key });
      } catch {
        /* nothing stored */
      }
    }
  }
  localStorage.setItem(done, '1');
}
