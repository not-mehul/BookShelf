// Native bridge for the Android WebView wrapper (no Capacitor).
//
// This module self-initializes on import. It does nothing in a normal browser:
// every hook is gated on the presence of a native JavascriptInterface, which
// only exists inside the Android app. There it patches window.fetch to route
// cross-origin API calls through native HTTP — the same CORS bypass Capacitor
// provided — so TheTVDB works on-device.

(function initAndroidHttpBridge() {
  if (typeof window === 'undefined') return;
  if (!window.AndroidHttp || typeof window.AndroidHttp.request !== 'function') return;
  if (window.__androidHttpPatched) return;
  window.__androidHttpPatched = true;

  const pending = new Map();
  let counter = 0;

  function b64ToBytes(b64) {
    if (!b64) return new Uint8Array(0);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // Called from native (UI thread) once a request completes.
  window.__nativeHttpResolve = function (id, status, headersJson, b64Body, errMsg) {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (errMsg) {
      p.reject(new Error(errMsg));
      return;
    }
    let headers = {};
    try { headers = JSON.parse(headersJson || '{}'); } catch { /* ignore */ }
    const bytes = b64ToBytes(b64Body);
    // 204/205/304 must not carry a body in a Response.
    const noBody = status === 204 || status === 205 || status === 304;
    p.resolve(new Response(noBody ? null : bytes, { status: status || 200, headers }));
  };

  const nativeFetch = window.fetch ? window.fetch.bind(window) : null;

  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    // Same-origin and non-http(s) requests (app assets, blobs, data URIs) use
    // the WebView's own fetch — they aren't subject to cross-origin CORS.
    const isHttp = /^https?:\/\//i.test(url);
    if (!isHttp || url.startsWith(location.origin)) {
      return nativeFetch ? nativeFetch(input, init) : Promise.reject(new Error('fetch unavailable'));
    }

    const opts = init || {};
    const method = (opts.method || 'GET').toUpperCase();

    const headers = {};
    if (opts.headers) {
      if (typeof opts.headers.forEach === 'function') {
        opts.headers.forEach((v, k) => { headers[k] = v; });
      } else {
        Object.assign(headers, opts.headers);
      }
    }
    const body = opts.body != null ? String(opts.body) : null;

    return new Promise((resolve, reject) => {
      const id = ++counter;
      pending.set(id, { resolve, reject });
      try {
        window.AndroidHttp.request(id, method, url, JSON.stringify(headers), body);
      } catch (err) {
        pending.delete(id);
        reject(err);
      }
    });
  };
})();

// Whether a native export bridge is present (used by the Markdown exporter).
export function hasNativeExport() {
  return (
    typeof window !== 'undefined' &&
    window.AndroidExport &&
    typeof window.AndroidExport.save === 'function'
  );
}

export function nativeExport(filename, text) {
  window.AndroidExport.save(filename, text);
}
