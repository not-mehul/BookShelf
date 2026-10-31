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

export interface NativeChannel {
  postMessage: (message: string) => void;
  addEventListener: (type: 'message', listener: (ev: { data: string }) => void) => void;
}
export type Pending = { resolve: (value: unknown) => void; reject: (reason: Error) => void };
/** Event payloads are JSON from the shell; handlers check what they use. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventHandler = (data: any) => void;
/** The window, plus the channel the shell injects. */
type ShellWindow = Window & typeof globalThis & { [CHANNEL_NAME]?: NativeChannel };

const CHANNEL_NAME = 'BookShelfNative' as const;

// Hosts the shell's native HTTP will fetch (keep in sync with
// ALLOWED_HOST_SUFFIXES in NativeBridge.kt). Everything else — e.g. a
// self-hosted TheTVDB proxy — uses the WebView's own, CORS-checked fetch.
const NATIVE_HOST_SUFFIXES = [
  'thetvdb.com',
  'googleapis.com',
  'google.com',
  'gstatic.com',
  'googleusercontent.com',
  'openlibrary.org'
];

export function usesNativeHttp(url: string) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  return (
    parsed.protocol === 'https:' && NATIVE_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`))
  );
}
let channel: NativeChannel | null = null;
/** Back handlers, innermost last (e.g. a modal over selection mode). */
const backStack: (() => void)[] = [];
const pending: Map<number, Pending> = new Map();
const eventHandlers: Map<string, EventHandler> = new Map();
let nextId = 0;

export function isNativeShell() {
  return channel !== null;
}

/**
 * Wires up the channel and routes the app's API calls through native HTTP
 * (TheTVDB and friends don't send CORS headers a WebView would accept).
 * Returns true when running inside the shell.
 * @param [win] The window to install into (injectable for tests).
 */
export function installNativeBridge(win: ShellWindow = window) {
  if (channel) return true;
  const ch = win[CHANNEL_NAME];
  if (!ch || typeof ch.postMessage !== 'function') return false;
  channel = ch;
  ch.addEventListener('message', (ev) => onMessage(ev.data));
  const webFetch: typeof fetch = win.fetch.bind(win);
  win.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url || '';
    return usesNativeHttp(url) ? nativeHttp(url, init || {}) : webFetch(input, init);
  };
  return true;
}

function post(message: Record<string, unknown>) {
  channel?.postMessage(JSON.stringify(message));
}

function onMessage(data: string) {
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
        new Response(noBody ? null : base64ToBytes(msg.body), {
          status: msg.status,
          headers: msg.headers || {}
        })
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

function takePending(id: number) {
  const p = pending.get(id);
  pending.delete(id);
  return p;
}
function nativeHttp(url: string, init: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {};
  new Headers(init.headers || {}).forEach((value, key) => {
    headers[key] = value;
  });
  return new Promise<Response>((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
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

function base64ToBytes(b64: string | null | undefined) {
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
 */
export function callNative<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  if (!channel) return Promise.reject(new Error('Not running in the Android app'));
  return new Promise<T>((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    post({ type: 'call', id, method, params });
  });
}

/**
 * Handle an event pushed by the shell (e.g. 'shared' text, 'openAdd' from
 * the widget). The shell queues events until notifyNativeReady().
 */
export function onNativeEvent(name: string, handler: EventHandler) {
  eventHandlers.set(name, handler);
}

/** Tell the shell the page has booted and can receive queued events. */
export function notifyNativeReady() {
  post({ type: 'ready' });
}

/**
 * Hand a generated file to the system share sheet.
 */
export function nativeExport(filename: string, text: string) {
  post({ type: 'export', filename, text });
}

/**
 * Keep the system-bar icon colours in step with Dusk / Dawn.
 */
export function setNativeTheme(mode: 'light' | 'dark') {
  post({ type: 'theme', mode });
}

/**
 * Claim the Android Back gesture for `handler` (e.g. "close this modal").
 * Handlers stack: Back goes to the most recent one, and the system gets Back
 * again once all are released. Returns the release function.
 */
export function pushBackHandler(handler: () => void): () => void {
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
