import { describe, it, expect, vi, beforeEach } from 'vitest';

const ORIGIN = 'https://appassets.androidwebview.com';

// A stand-in for the Capacitor shell: records plugin calls, answers them from
// `replies`, and lets the test fire plugin events.
function fakeShell(replies = {}) {
  const calls = [];
  const listeners = new Map();
  const barStyles = [];
  const native = {
    call: vi.fn(async (method, params) => {
      calls.push({ method, params });
      const reply = replies[method];
      return typeof reply === 'function' ? reply(params) : (reply ?? {});
    }),
    on: (event, handler) => listeners.set(event, handler),
    setBarStyle: (mode) => barStyles.push(mode)
  };
  const webFetch = vi.fn(async () => new Response('local'));
  const win = { fetch: webFetch, location: { origin: ORIGIN } };
  const emit = (event, data) => listeners.get(event)?.(data);
  return { win, native, calls, barStyles, webFetch, emit };
}

let native;
beforeEach(async () => {
  vi.resetModules(); // the module keeps shell state; start each test fresh
  native = await import('../src/platform/native.js');
});

describe('installNativeBridge', () => {
  it('is a no-op in a plain browser', () => {
    const webFetch = vi.fn();
    const win = { fetch: webFetch, location: { origin: 'http://localhost' } };
    expect(native.installNativeBridge(win)).toBe(false);
    expect(native.isNativeShell()).toBe(false);
    expect(win.fetch).toBe(webFetch);
  });

  it('routes cross-origin fetches through native HTTP and decodes the response', async () => {
    const shell = fakeShell({
      http: { status: 200, headers: { 'content-type': 'application/json' }, body: btoa('{"data":[1]}') }
    });
    expect(native.installNativeBridge(shell.win, shell.native)).toBe(true);
    expect(native.isNativeShell()).toBe(true);

    const res = await shell.win.fetch('https://api4.thetvdb.com/v4/search?query=x', {
      headers: { Authorization: 'Bearer t' }
    });
    expect(shell.calls[0]).toEqual({
      method: 'http',
      params: {
        method: 'GET',
        url: 'https://api4.thetvdb.com/v4/search?query=x',
        headers: { authorization: 'Bearer t' },
        body: null
      }
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.json()).toEqual({ data: [1] });
    expect(shell.webFetch).not.toHaveBeenCalled();
  });

  it('keeps same-origin, non-http and non-allowlisted requests on the WebView fetch', async () => {
    const shell = fakeShell();
    native.installNativeBridge(shell.win, shell.native);
    await shell.win.fetch(`${ORIGIN}/index.html`);
    await shell.win.fetch('blob:abc');
    await shell.win.fetch('https://bookshelf-tvdb-proxy.example.workers.dev/search?query=x'); // self-hosted proxy
    await shell.win.fetch('http://api4.thetvdb.com/v4/search'); // plain http is never sent natively
    expect(shell.webFetch).toHaveBeenCalledTimes(4);
    expect(shell.calls).toHaveLength(0);
  });

  it('matches allowlisted hosts exactly, not by look-alike suffix', () => {
    expect(native.usesNativeHttp('https://www.googleapis.com/books/v1/volumes')).toBe(true);
    expect(native.usesNativeHttp('https://evilthetvdb.com/')).toBe(false);
    expect(native.usesNativeHttp('https://thetvdb.com.evil.net/')).toBe(false);
    expect(native.usesNativeHttp('not a url')).toBe(false);
  });

  it('rejects with a TypeError on a native network failure, like fetch()', async () => {
    const shell = fakeShell({ http: { status: 0, error: 'Blocked request' } });
    native.installNativeBridge(shell.win, shell.native);
    await expect(shell.win.fetch('https://covers.openlibrary.org/b/id/1-L.jpg')).rejects.toThrow(TypeError);
  });
});

describe('plugin calls and events', () => {
  it('unwraps { value } from native methods, with null for an absent value', async () => {
    const shell = fakeShell({ secureGet: ({ key }) => (key === 'k' ? { value: 'v' } : {}) });
    native.installNativeBridge(shell.win, shell.native);
    expect(await native.callNative('secureGet', { key: 'k' })).toBe('v');
    expect(await native.callNative('secureGet', { key: 'other' })).toBeNull();
  });

  it('rejects native calls outside the shell', async () => {
    await expect(native.callNative('syncStatus')).rejects.toThrow('Not running in the Android app');
  });

  it('delivers plugin events to onNativeEvent handlers', () => {
    const shell = fakeShell();
    native.installNativeBridge(shell.win, shell.native);
    const handler = vi.fn();
    native.onNativeEvent('shared', handler);
    shell.emit('shared', { text: 'A quote', subject: '' });
    expect(handler).toHaveBeenCalledWith({ text: 'A quote', subject: '' });
  });

  it('claims and releases Android Back, and invokes the handler on "back"', () => {
    const shell = fakeShell();
    native.installNativeBridge(shell.win, shell.native);
    const handler = vi.fn();

    const release = native.pushBackHandler(handler);
    expect(shell.calls.at(-1)).toEqual({ method: 'setBackHandler', params: { enabled: true } });
    shell.emit('back');
    expect(handler).toHaveBeenCalledOnce();

    release();
    expect(shell.calls.at(-1)).toEqual({ method: 'setBackHandler', params: { enabled: false } });
  });

  it('stacks back handlers: the innermost wins, and releasing restores the outer one', () => {
    const shell = fakeShell();
    native.installNativeBridge(shell.win, shell.native);
    const outer = vi.fn();
    const inner = vi.fn();
    const releaseOuter = native.pushBackHandler(outer);
    const releaseInner = native.pushBackHandler(inner);
    shell.emit('back');
    expect(inner).toHaveBeenCalledOnce();
    expect(outer).not.toHaveBeenCalled();

    releaseInner();
    expect(shell.calls.at(-1)).toEqual({ method: 'setBackHandler', params: { enabled: true } }); // outer still claims Back
    shell.emit('back');
    expect(outer).toHaveBeenCalledOnce();

    releaseOuter();
    releaseOuter(); // idempotent
    expect(shell.calls.at(-1)).toEqual({ method: 'setBackHandler', params: { enabled: false } });
  });

  it('sets the system bar style and sends exports', () => {
    const shell = fakeShell();
    native.installNativeBridge(shell.win, shell.native);
    native.setNativeTheme('light');
    native.nativeExport('a.md', '# hi');
    expect(shell.barStyles).toEqual(['light']);
    expect(shell.calls).toEqual([{ method: 'export', params: { filename: 'a.md', text: '# hi' } }]);
  });

  it('sends nothing when not inside the shell', () => {
    // No install → no shell; these must be safe no-ops in a browser.
    expect(() => {
      native.setNativeTheme('dark');
      native.pushBackHandler(() => {})();
      native.nativeExport('x.txt', 'x');
    }).not.toThrow();
  });
});
