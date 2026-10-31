import { describe, it, expect, vi, beforeEach } from 'vitest';

const ORIGIN = 'https://appassets.androidwebview.com';

// A stand-in for the object the Android shell injects as window.BookShelfNative.
function fakeShell() {
  const sent = [];
  let listener = null;
  const channel = {
    postMessage: (json) => sent.push(JSON.parse(json)),
    addEventListener: (type, cb) => {
      if (type === 'message') listener = cb;
    }
  };
  const webFetch = vi.fn(async () => new Response('local'));
  const win = { BookShelfNative: channel, fetch: webFetch, location: { origin: ORIGIN } };
  const reply = (msg) => listener({ data: JSON.stringify(msg) });
  return { win, sent, webFetch, reply };
}

let native;
beforeEach(async () => {
  vi.resetModules(); // the module keeps channel state; start each test fresh
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
    const shell = fakeShell();
    expect(native.installNativeBridge(shell.win)).toBe(true);
    expect(native.isNativeShell()).toBe(true);

    const pending = shell.win.fetch('https://api4.thetvdb.com/v4/search?query=x', {
      headers: { Authorization: 'Bearer t' }
    });
    const req = shell.sent[0];
    expect(req).toMatchObject({
      type: 'http',
      method: 'GET',
      url: 'https://api4.thetvdb.com/v4/search?query=x',
      headers: { authorization: 'Bearer t' },
      body: null
    });

    shell.reply({
      type: 'http',
      id: req.id,
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: btoa('{"data":[1]}')
    });
    const res = await pending;
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.json()).toEqual({ data: [1] });
    expect(shell.webFetch).not.toHaveBeenCalled();
  });

  it('keeps same-origin, non-http and non-allowlisted requests on the WebView fetch', async () => {
    const shell = fakeShell();
    native.installNativeBridge(shell.win);
    await shell.win.fetch(`${ORIGIN}/index.html`);
    await shell.win.fetch('blob:abc');
    await shell.win.fetch('https://bookshelf-tvdb-proxy.example.workers.dev/search?query=x'); // self-hosted proxy
    await shell.win.fetch('http://api4.thetvdb.com/v4/search'); // plain http is never sent natively
    expect(shell.webFetch).toHaveBeenCalledTimes(4);
    expect(shell.sent).toHaveLength(0);
  });

  it('matches allowlisted hosts exactly, not by look-alike suffix', () => {
    expect(native.usesNativeHttp('https://www.googleapis.com/books/v1/volumes')).toBe(true);
    expect(native.usesNativeHttp('https://evilthetvdb.com/')).toBe(false);
    expect(native.usesNativeHttp('https://thetvdb.com.evil.net/')).toBe(false);
    expect(native.usesNativeHttp('not a url')).toBe(false);
  });

  it('rejects with a TypeError on a native network failure, like fetch()', async () => {
    const shell = fakeShell();
    native.installNativeBridge(shell.win);
    const pending = shell.win.fetch('https://covers.openlibrary.org/b/id/1-L.jpg');
    shell.reply({ type: 'http', id: shell.sent[0].id, status: 0, error: 'Blocked request' });
    await expect(pending).rejects.toThrow(TypeError);
  });
});

describe('shell messages', () => {
  it('claims and releases Android Back, and invokes the handler on "back"', () => {
    const shell = fakeShell();
    native.installNativeBridge(shell.win);
    const handler = vi.fn();

    const release = native.pushBackHandler(handler);
    expect(shell.sent.at(-1)).toEqual({ type: 'backHandler', enabled: true });
    shell.reply({ type: 'back' });
    expect(handler).toHaveBeenCalledOnce();

    release();
    expect(shell.sent.at(-1)).toEqual({ type: 'backHandler', enabled: false });
  });

  it('stacks back handlers: the innermost wins, and releasing restores the outer one', () => {
    const shell = fakeShell();
    native.installNativeBridge(shell.win);
    const outer = vi.fn();
    const inner = vi.fn();
    const releaseOuter = native.pushBackHandler(outer);
    const releaseInner = native.pushBackHandler(inner);
    shell.reply({ type: 'back' });
    expect(inner).toHaveBeenCalledOnce();
    expect(outer).not.toHaveBeenCalled();

    releaseInner();
    expect(shell.sent.at(-1)).toEqual({ type: 'backHandler', enabled: true }); // outer still claims Back
    shell.reply({ type: 'back' });
    expect(outer).toHaveBeenCalledOnce();

    releaseOuter();
    releaseOuter(); // idempotent
    expect(shell.sent.at(-1)).toEqual({ type: 'backHandler', enabled: false });
  });

  it('posts theme and export messages', () => {
    const shell = fakeShell();
    native.installNativeBridge(shell.win);
    native.setNativeTheme('light');
    native.nativeExport('a.md', '# hi');
    expect(shell.sent).toEqual([
      { type: 'theme', mode: 'light' },
      { type: 'export', filename: 'a.md', text: '# hi' }
    ]);
  });

  it('sends nothing when not inside the shell', () => {
    // No install → no channel; these must be safe no-ops in a browser.
    expect(() => {
      native.setNativeTheme('dark');
      native.pushBackHandler(() => {})();
      native.nativeExport('x.txt', 'x');
    }).not.toThrow();
  });
});
