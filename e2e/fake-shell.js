// A stand-in for the Android shell, injected with page.addInitScript() before
// the app loads. It plays the part of Capacitor's native layer: it makes the
// page look like an Android Capacitor app (window.androidBridge, plugin
// headers) and answers BookShelf plugin calls the way BookShelfPlugin.kt does.
//
// Every call is recorded in window.__sent in a simple shape tests can match:
//   { type: 'call', method, params }   BookShelf plugin methods
//   { type: 'http', url, method, … }   native HTTP
//   { type: 'backHandler', enabled }   claiming Android Back
//   { type: 'theme', mode }            SystemBars.setStyle
//   { type: 'export', filename, text } Markdown / JSON exports
//   { type: 'listen', event }          the page subscribing to an event
// Events emitted before the page subscribes are kept and delivered on
// subscribe, as Capacitor does for BookShelfPlugin's events.
//
// Runs inside the page, so it must be self-contained (no imports/closures).
export function installFakeShell({
  scanResult = '9780441172719',
  syncFolder = null,
  notificationsAllowed = true,
  // [name, data] pairs the shell emits before the page loads (a cold start).
  pendingEvents = []
} = {}) {
  const keystore = {};
  let folder = syncFolder;
  window.__sent = [];
  window.__keystore = keystore;

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
  const special = ['http', 'setBackHandler', 'export'];

  const listeners = {};
  const retained = {};
  let nextCallbackId = 0;

  const promise = (method) => ({ name: method, rtype: 'promise' });
  window.androidBridge = { postMessage() {} };
  window.Capacitor = {
    PluginHeaders: [
      {
        name: 'BookShelf',
        methods: [...Object.keys(methods), ...special, 'removeListener'].map(promise).concat({ name: 'addListener', rtype: 'callback' })
      },
      { name: 'SystemBars', methods: ['setStyle', 'show', 'hide', 'setAnimation'].map(promise) }
    ],

    nativePromise(plugin, method, options = {}) {
      return new Promise((resolve, reject) =>
        setTimeout(() => {
          if (plugin === 'SystemBars') {
            if (method === 'setStyle') window.__sent.push({ type: 'theme', mode: options.style === 'DARK' ? 'dark' : 'light' });
            return resolve(undefined);
          }
          if (method === 'removeListener') return resolve(undefined);
          if (method === 'http') {
            window.__sent.push({ type: 'http', ...options });
            // Empty search results for any API (Google Books, Open Library, TheTVDB).
            return resolve({ status: 200, headers: { 'content-type': 'application/json' }, body: btoa('{"items":[],"docs":[],"data":[]}') });
          }
          if (method === 'setBackHandler') {
            window.__sent.push({ type: 'backHandler', enabled: options.enabled });
            return resolve({});
          }
          if (method === 'export') {
            window.__sent.push({ type: 'export', ...options });
            return resolve({ value: true });
          }
          window.__sent.push({ type: 'call', method, params: options });
          const fn = methods[method];
          if (!fn) return reject(new Error(`Unknown method: ${method}`));
          const value = fn(options);
          // Like JSObject.put(key, null): an absent value, not null.
          resolve(value == null ? {} : { value });
        }, 0)
      );
    },

    nativeCallback(plugin, method, options, callback) {
      const id = String(++nextCallbackId);
      if (plugin === 'BookShelf' && method === 'addListener') {
        const event = options.eventName;
        window.__sent.push({ type: 'listen', event });
        listeners[event] = callback;
        for (const data of retained[event] || []) setTimeout(() => callback(data), 0);
        delete retained[event];
      }
      return id;
    }
  };

  // Test helpers: push a native → page event (kept until the page listens).
  window.__nativeEmit = (name, data) => {
    if (listeners[name]) listeners[name](data ?? {});
    else (retained[name] ||= []).push(data ?? {});
  };
  window.__nativeBack = () => window.__nativeEmit('back', {});
  for (const [name, data] of pendingEvents) window.__nativeEmit(name, data);
}
