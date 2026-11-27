// Tiny settings layer.
//
// Ordinary preferences live in localStorage (namespaced). Secrets (the API
// keys) go to the Android Keystore through the native shell when running in
// the app. In a plain browser there is no Keystore, so they fall back to
// localStorage.

import { isNativeShell, callNative } from '../platform/native';

const PREFIX = 'bookshelf:';

/** Setting keys whose values are secrets. */
export const SECRET_KEYS = new Set(['tmdb_api_key', 'google_books_api_key']);

/** In-memory cache of Keystore reads for this session. */
const secretCache: Map<string, string | null> = new Map();

const useKeystore = (key: string) => SECRET_KEYS.has(key) && isNativeShell();

export async function getSetting(key: string, fallback: string = ''): Promise<string> {
  if (useKeystore(key)) {
    if (!secretCache.has(key)) secretCache.set(key, await callNative<string | null>('secureGet', { key }));
    return secretCache.get(key) ?? fallback;
  }
  const v = localStorage.getItem(PREFIX + key);
  return v === null ? fallback : v;
}
export async function setSetting(key: string, value: string | number | boolean) {
  if (useKeystore(key)) {
    await callNative('secureSet', { key, value: String(value) });
    secretCache.set(key, String(value));
    return;
  }
  localStorage.setItem(PREFIX + key, String(value));
}

export async function removeSetting(key: string) {
  if (useKeystore(key)) {
    await callNative('secureRemove', { key });
    secretCache.set(key, null);
    return;
  }
  localStorage.removeItem(PREFIX + key);
}
