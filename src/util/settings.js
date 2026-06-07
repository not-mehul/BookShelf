// Tiny settings layer, backed by localStorage.
//
// The app runs in a browser or inside the native Android WebView shell, which
// serves the app over an https origin — so localStorage persists in both. Keys
// are namespaced to avoid collisions.

const PREFIX = 'bookshelf:';

export async function getSetting(key, fallback = '') {
  const v = localStorage.getItem(PREFIX + key);
  return v === null ? fallback : v;
}

export async function setSetting(key, value) {
  localStorage.setItem(PREFIX + key, String(value));
}

export async function removeSetting(key) {
  localStorage.removeItem(PREFIX + key);
}
