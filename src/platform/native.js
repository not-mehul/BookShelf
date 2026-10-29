// Client for the native Android shell's message bridge.
//
// The shell (android-app/.../NativeBridge.kt) injects `window.BookShelfNative`
// via WebViewCompat.addWebMessageListener — only into this app's own origin.
// Messages are JSON strings in both directions:
//   web → native: http, call (generic RPC), export, theme, backHandler, ready
//   native → web: http / result (replies, matched by id), back, event
//
// Everything here is a no-op in a plain browser, so the same build runs in
// both places. Call installNativeBridge() once, before the app boots.

/**
 * @typedef {object} NativeChannel
 * @property {(message: string) => void} postMessage
 * @property {(type: 'message', listener: (ev: { data: string }) => void) => void} addEventListener
 */
/** @typedef {{ resolve: (value: any) => void, reject: (reason: Error) => void }} Pending */
/** @typedef {(data: any) => void} EventHandler */

const CHANNEL_NAME = 'BookShelfNative';

/** @type {NativeChannel | null} */
let channel = null;
/** @type {(() => void) | null} */
let backHandler = null;
/** @type {Map<number, Pending>} */
const pending = new Map();
/** @type {Map<string, EventHandler>} */
const eventHandlers = new Map();
let nextId = 0;

export function isNativeShell() {
  return channel !== null;
}

/**
 * Wires up the channel and routes cross-origin fetches through native HTTP
 * (TheTVDB and friends don't send CORS headers a WebView would accept).
 * Returns true when running inside the shell.
 * @param {any} [win] The window to install into (injectable for tests).
 */
export function installNativeBridge(win = window) {
  if (channel) return true;
  /** @type {NativeChannel | undefined} */
  const ch = win[CHANNEL_NAME];
  if (!ch || typeof ch.postMessage !== 'function') return false;
  channel = ch;
  ch.addEventListener('message', (ev) => onMessage(ev.data));

  /** @type {typeof fetch} */
  const webFetch = win.fetch.bind(win);
  const origin = win.location.origin;
  /** @type {typeof fetch} */
  win.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url || '';
    // Same-origin and non-http(s) requests (assets, blob:, data:) stay local.
    if (!/^https?:\/\//i.test(url) || url.startsWith(origin)) return webFetch(input, init);
    return nativeHttp(url, init || {});
  };
  return true;
}

/** @param {Record<string, unknown>} message */
function post(message) {
  channel?.postMessage(JSON.stringify(message));
}

/** @param {string} data */
function onMessage(data) {
  let msg;
  try {
    msg = JSON.parse(data);
  } catch {
    return;
  }
  switch (msg.type) {
    case 'http': {
      const p = takePending(msg.id);
      if (!p) return;
      if (msg.error || !msg.status) {
        // Mirror fetch(): network-level failures reject with a TypeError.
        p.reject(new TypeError(msg.error || 'Network request failed'));
        return;
      }
      const noBody = msg.status === 204 || msg.status === 205 || msg.status === 304;
      p.resolve(
        new Response(noBody ? null : base64ToBytes(msg.body), { status: msg.status, headers: msg.headers || {} })
      );
      break;
    }
    case 'result': {
      const p = takePending(msg.id);
      if (!p) return;
      if (msg.ok) p.resolve(msg.value ?? null);
      else p.reject(new Error(msg.error || 'Native call failed'));
      break;
    }
    case 'back':
      backHandler?.();
      break;
    case 'event':
      eventHandlers.get(msg.name)?.(msg.data);
      break;
  }
}

/** @param {number} id */
function takePending(id) {
  const p = pending.get(id);
  pending.delete(id);
  return p;
}

/**
 * @param {string} url
 * @param {RequestInit} init
 * @returns {Promise<Response>}
 */
function nativeHttp(url, init) {
  /** @type {Record<string, string>} */
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

/** @param {string | null | undefined} b64 */
function base64ToBytes(b64) {
  if (!b64) return new Uint8Array(0);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Call a native method and await its result. Rejects outside the shell.
 * Methods: secureGet/secureSet/secureRemove, scanBarcode, syncStatus,
 * syncPickFolder, syncForget, syncRead, syncWrite, widgetUpdate.
 * @param {string} method
 * @param {Record<string, unknown>} [params]
 * @returns {Promise<any>}
 */
export function callNative(method, params = {}) {
  if (!channel) return Promise.reject(new Error('Not running in the Android app'));
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    post({ type: 'call', id, method, params });
  });
}

/**
 * Handle an event pushed by the shell (e.g. 'shared' text, 'openAdd' from
 * the widget). The shell queues events until notifyNativeReady().
 * @param {string} name
 * @param {EventHandler} handler
 */
export function onNativeEvent(name, handler) {
  eventHandlers.set(name, handler);
}

/** Tell the shell the page has booted and can receive queued events. */
export function notifyNativeReady() {
  post({ type: 'ready' });
}

/**
 * Hand a generated file to the system share sheet.
 * @param {string} filename
 * @param {string} text
 */
export function nativeExport(filename, text) {
  post({ type: 'export', filename, text });
}

/**
 * Keep the system-bar icon colours in step with Dusk / Dawn.
 * @param {'light' | 'dark'} mode
 */
export function setNativeTheme(mode) {
  post({ type: 'theme', mode });
}

/**
 * Claim the Android Back gesture while `handler` is set (e.g. a modal is
 * open); pass null to give Back back to the system.
 * @param {(() => void) | null} handler
 */
export function setNativeBackHandler(handler) {
  backHandler = handler;
  post({ type: 'backHandler', enabled: Boolean(handler) });
}
