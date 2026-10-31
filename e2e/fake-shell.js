// A stand-in for the Android shell, injected with page.addInitScript() before
// the app loads. It mimics NativeBridge.kt: records every message in
// window.__sent, answers `call` RPCs (Keystore, scanner, sync, widget) and
// `http` requests, and lets tests push native events.
//
// Runs inside the page, so it must be self-contained (no imports/closures).
export function installFakeShell({ scanResult = '9780441172719', syncFolder = null, notificationsAllowed = true } = {}) {
  const keystore = {};
  let folder = syncFolder;
  window.__sent = [];
  window.__keystore = keystore;
  let listener = null;
  const reply = (msg) => setTimeout(() => listener?.({ data: JSON.stringify(msg) }), 0);

  const methods = {
    secureGet: ({ key }) => (key in keystore ? keystore[key] : null),
    secureSet: ({ key, value }) => ((keystore[key] = value), true),
    secureRemove: ({ key }) => (delete keystore[key], true),
    scanBarcode: () => scanResult,
    syncStatus: () => (folder ? { folderName: folder } : null),
    syncPickFolder: () => ((folder = 'Drive/BookShelf'), { folderName: folder }),
    syncForget: () => ((folder = null), true),
    syncRead: () => window.__syncFile ?? null,
    syncWrite: ({ text }) => ((window.__syncFile = text), true),
    widgetUpdate: () => true,
    shareFile: () => true,
    episodeReminders: () => true,
    requestNotificationPermission: () => notificationsAllowed
  };

  window.BookShelfNative = {
    addEventListener: (type, cb) => {
      if (type === 'message') listener = cb;
    },
    postMessage(json) {
      const msg = JSON.parse(json);
      window.__sent.push(msg);
      if (msg.type === 'call') {
        const fn = methods[msg.method];
        reply(fn
          ? { type: 'result', id: msg.id, ok: true, value: fn(msg.params || {}) }
          : { type: 'result', id: msg.id, ok: false, error: `Unknown method: ${msg.method}` });
      } else if (msg.type === 'http') {
        // Empty search results for any API (Google Books, Open Library, TheTVDB).
        reply({ type: 'http', id: msg.id, status: 200, headers: { 'content-type': 'application/json' },
          body: btoa('{"items":[],"docs":[],"data":[]}') });
      }
    }
  };

  // Test helpers: push a native → page message.
  window.__nativeEmit = (name, data) => listener?.({ data: JSON.stringify({ type: 'event', name, data }) });
  window.__nativeBack = () => listener?.({ data: JSON.stringify({ type: 'back' }) });
}
