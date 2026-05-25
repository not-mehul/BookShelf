// Tiny settings layer. Uses @capacitor/preferences if available (native Android),
// otherwise falls back to localStorage so the same code runs in the browser dev server.

let preferencesPromise = null;

async function getPreferences() {
  if (preferencesPromise) return preferencesPromise;
  preferencesPromise = (async () => {
    try {
      const mod = await import('@capacitor/preferences');
      return mod.Preferences;
    } catch {
      return null;
    }
  })();
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
