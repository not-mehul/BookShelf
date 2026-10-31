// Client for the native Android shell: a Capacitor app whose BookShelf
// plugin (android/.../BookShelfPlugin.kt) carries the app's native features.
//
//   web → native: plugin methods (http, secure*, sync*, scanBarcode, …), each
//                 resolving { value }
//   native → web: plugin events: shared, openAdd, openEntry, back. Capacitor
//                 keeps them until a listener is added, so nothing that
//                 arrives during a cold start is lost.
//
// Everything here is a no-op in a plain browser, so the same build runs in
// both places. Call installNativeBridge() once, before the app boots.

import { Capacitor, registerPlugin, SystemBars, SystemBarsStyle } from '@capacitor/core';

/** The calls this module makes on the shell (injectable for tests). */
export interface NativeShell {
  /** Invoke a BookShelf plugin method. */
  call: (method: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;
  /** Subscribe to a BookShelf plugin event. */
  on: (event: string, handler: EventHandler) => void;
  /** Status / navigation bar icon colours for the current theme. */
  setBarStyle: (mode: 'light' | 'dark') => void;
}
/** Event payloads are JSON from the shell; handlers check what they use. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventHandler = (data: any) => void;

/** What the plugin's `http` method resolves with (see NativeHttp.kt). */
interface HttpReply {
  status?: number;
  headers?: Record<string, string>;
  body?: string;
  error?: string;
}

type PluginMethods = Record<string, (params: Record<string, unknown>) => Promise<Record<string, unknown>>>;
interface BookShelfPlugin {
  addListener: (event: string, handler: EventHandler) => Promise<unknown>;
}

/** The real shell, or null outside the Android app. */
function capacitorShell(): NativeShell | null {
  if (!Capacitor.isNativePlatform()) return null;
  const plugin = registerPlugin<BookShelfPlugin>('BookShelf');
  const methods = plugin as unknown as PluginMethods;
  return {
    call: (method, params) => methods[method]!(params),
    on: (event, handler) => void plugin.addListener(event, handler),
    setBarStyle: (mode) =>
      void SystemBars.setStyle({
        style: mode === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light
      }).catch((err: unknown) => console.warn('Could not set the system bar style', err))
  };
}

// Hosts the shell's native HTTP will fetch (keep in sync with
// ALLOWED_HOST_SUFFIXES in NativeHttp.kt). Everything else — e.g. a
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

let shell: NativeShell | null = null;
/** Back handlers, innermost last (e.g. a modal over selection mode). */
const backStack: (() => void)[] = [];

export function isNativeShell() {
  return shell !== null;
}

/**
 * Wires up the shell and routes the app's API calls through native HTTP
 * (TheTVDB and friends don't send CORS headers a WebView would accept).
 * Returns true when running inside the shell.
 * @param [win] The window to install into (injectable for tests).
 * @param [native] The shell (injectable for tests); defaults to Capacitor's.
 */
export function installNativeBridge(
  win: Pick<Window, 'fetch'> = window,
  native: NativeShell | null = capacitorShell()
) {
  if (shell) return true;
  if (!native) return false;
  shell = native;
  native.on('back', () => backStack.at(-1)?.());
  const webFetch: typeof fetch = win.fetch.bind(win);
  win.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url || '';
    return usesNativeHttp(url) ? nativeHttp(native, url, init || {}) : webFetch(input, init);
  };
  return true;
}

async function nativeHttp(native: NativeShell, url: string, init: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {};
  new Headers(init.headers || {}).forEach((value, key) => {
    headers[key] = value;
  });
  const reply = (await native.call('http', {
    url,
    method: (init.method || 'GET').toUpperCase(),
    headers,
    body: init.body != null ? String(init.body) : null
  })) as HttpReply;
  if (reply.error || !reply.status) {
    // Mirror fetch(): network-level failures reject with a TypeError.
    throw new TypeError(reply.error || 'Network request failed');
  }
  const noBody = reply.status === 204 || reply.status === 205 || reply.status === 304;
  return new Response(noBody ? null : base64ToBytes(reply.body), {
    status: reply.status,
    headers: reply.headers || {}
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
 * syncPickFolder, syncForget, syncRead, syncWrite, episodeReminders,
 * requestNotificationPermission, shareFile, widgetUpdate.
 */
export async function callNative<T = unknown>(
  method: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  if (!shell) throw new Error('Not running in the Android app');
  const result = await shell.call(method, params);
  return (result.value ?? null) as T;
}

/**
 * Handle an event pushed by the shell (e.g. 'shared' text, 'openAdd' from
 * the widget). Events that arrived before this call are delivered now.
 */
export function onNativeEvent(name: string, handler: EventHandler) {
  shell?.on(name, handler);
}

/**
 * Hand a generated file to the system share sheet. The shell shows a toast
 * if that fails.
 */
export function nativeExport(filename: string, text: string) {
  shell?.call('export', { filename, text }).catch((err: unknown) => console.warn('Export failed', err));
}

/**
 * Keep the system-bar icon colours in step with Dusk / Dawn.
 */
export function setNativeTheme(mode: 'light' | 'dark') {
  shell?.setBarStyle(mode);
}

function setBackHandler(enabled: boolean) {
  shell?.call('setBackHandler', { enabled }).catch((err: unknown) => console.warn('Back handler', err));
}

/**
 * Claim the Android Back gesture for `handler` (e.g. "close this modal").
 * Handlers stack: Back goes to the most recent one, and the system gets Back
 * again once all are released. Returns the release function.
 */
export function pushBackHandler(handler: () => void): () => void {
  backStack.push(handler);
  setBackHandler(true);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const i = backStack.lastIndexOf(handler);
    if (i >= 0) backStack.splice(i, 1);
    setBackHandler(backStack.length > 0);
  };
}
