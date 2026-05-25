// Tiny settings layer. Uses @capacitor/preferences on native Android,
// falls back to localStorage in the browser dev server.
// We gate on isNativePlatform() so the web context never calls the native plugin —
// Capacitor throws "not implemented on web" at runtime even if the import succeeds.

function isNative() {
  return typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.();
}

let preferencesPromise = null;

async function getPreferences() {
  if (!isNative()) return null;
  if (preferencesPromise) return preferencesPromise;
  preferencesPromise = import('@capacitor/preferences')
    .then((mod) => mod.Preferences)
    .catch(() => null);
  return preferencesPromise;
}

export async function getSetting(key, fallback = '') {
  const prefs = await getPreferences();
  if (prefs) {
    const { value } = await prefs.get({ key });
    if (value !== null && value !== undefined) return value;
    return fallback;
  }
  const v = localStorage.getItem(`bookshelf:${key}`);
  return v === null ? fallback : v;
}

export async function setSetting(key, value) {
  const prefs = await getPreferences();
  if (prefs) {
    await prefs.set({ key, value: String(value) });
    return;
  }
  localStorage.setItem(`bookshelf:${key}`, String(value));
}

export async function removeSetting(key) {
  const prefs = await getPreferences();
  if (prefs) {
    await prefs.remove({ key });
    return;
  }
  localStorage.removeItem(`bookshelf:${key}`);
}
