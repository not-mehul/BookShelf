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

// Hosts the shell's native HTTP will fetch (keep in sync with
// ALLOWED_HOST_SUFFIXES in NativeBridge.kt). Everything else — e.g. a
// self-hosted TheTVDB proxy — uses the WebView's own, CORS-checked fetch.
const NATIVE_HOST_SUFFIXES = ['thetvdb.com', 'googleapis.com', 'google.com', 'gstatic.com', 'googleusercontent.com', 'openlibrary.org'];

/** @param {string} url */
export function usesNativeHttp(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  return parsed.protocol === 'https:' && NATIVE_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
}

/** @type {NativeChannel | null} */
let channel = null;
/** @type {(() => void)[]} Back handlers, innermost last (e.g. a modal over selection mode). */
const backStack = [];
/** @type {Map<number, Pending>} */
const pending = new Map();
/** @type {Map<string, EventHandler>} */
const eventHandlers = new Map();
let nextId = 0;

export function isNativeShell() {
  return channel !== null;
}

/**
 * Wires up the channel and routes the app's API calls through native HTTP
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
  /** @type {typeof fetch} */
  win.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url || '';
    return usesNativeHttp(url) ? nativeHttp(url, init || {}) : webFetch(input, init);
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
      backStack.at(-1)?.();
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
 * Claim the Android Back gesture for `handler` (e.g. "close this modal").
 * Handlers stack: Back goes to the most recent one, and the system gets Back
 * again once all are released. Returns the release function.
 * @param {() => void} handler
 * @returns {() => void}
 */
export function pushBackHandler(handler) {
  backStack.push(handler);
  post({ type: 'backHandler', enabled: true });
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const i = backStack.lastIndexOf(handler);
    if (i >= 0) backStack.splice(i, 1);
    post({ type: 'backHandler', enabled: backStack.length > 0 });
  };
}
