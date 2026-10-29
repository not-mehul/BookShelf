// Client for the native Android shell's message bridge.
//
// The shell (android-app/.../NativeBridge.kt) injects `window.BookShelfNative`
// via WebViewCompat.addWebMessageListener — only into this app's own origin.
// Messages are JSON strings in both directions:
//   web → native: http, export, theme, backHandler
//   native → web: http (response, matched by id), back
//
// Everything here is a no-op in a plain browser, so the same build runs in
// both places. Call installNativeBridge() once, before the app boots.

const CHANNEL_NAME = 'BookShelfNative';

let channel = null;
let backHandler = null;
const pending = new Map();
let nextId = 0;

export function isNativeShell() {
  return channel !== null;
}

// Wires up the channel and routes cross-origin fetches through native HTTP
// (TheTVDB and friends don't send CORS headers a WebView would accept).
// Returns true when running inside the shell.
export function installNativeBridge(win = window) {
  if (channel) return true;
  const ch = win[CHANNEL_NAME];
  if (!ch || typeof ch.postMessage !== 'function') return false;
  channel = ch;
  ch.addEventListener('message', (ev) => onMessage(ev.data));

  const webFetch = win.fetch.bind(win);
  const origin = win.location.origin;
  win.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url || '';
    // Same-origin and non-http(s) requests (assets, blob:, data:) stay local.
    if (!/^https?:\/\//i.test(url) || url.startsWith(origin)) return webFetch(input, init);
    return nativeHttp(url, init || {});
  };
  return true;
}

function post(message) {
  channel?.postMessage(JSON.stringify(message));
}

function onMessage(data) {
  let msg;
  try {
    msg = JSON.parse(data);
  } catch {
    return;
  }
  if (msg.type === 'http') {
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error || !msg.status) {
      // Mirror fetch(): network-level failures reject with a TypeError.
      p.reject(new TypeError(msg.error || 'Network request failed'));
      return;
    }
    const noBody = msg.status === 204 || msg.status === 205 || msg.status === 304;
    p.resolve(new Response(noBody ? null : base64ToBytes(msg.body), { status: msg.status, headers: msg.headers || {} }));
  } else if (msg.type === 'back') {
    backHandler?.();
  }
}

function nativeHttp(url, init) {
  const headers = {};
  new Headers(init.headers || {}).forEach((value, key) => {
    headers[key] = value;
  });
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    post({
      type: 'http',
      id,
      url,
      method: (init.method || 'GET').toUpperCase(),
      headers,
      body: init.body != null ? String(init.body) : null
    });
  });
}

function base64ToBytes(b64) {
  if (!b64) return new Uint8Array(0);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Hand a generated file to the system share sheet.
export function nativeExport(filename, text) {
  post({ type: 'export', filename, text });
}

// Keep the system-bar icon colours in step with Dusk / Dawn.
export function setNativeTheme(mode) {
  post({ type: 'theme', mode });
}

// Claim the Android Back gesture while `handler` is set (e.g. a modal is
// open); pass null to give Back back to the system.
export function setNativeBackHandler(handler) {
  backHandler = handler;
  post({ type: 'backHandler', enabled: Boolean(handler) });
}
