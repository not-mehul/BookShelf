import { describe, it, expect } from 'vitest';
import { encryptPayload, decryptPayload, DEFAULT_ITERATIONS } from '../src/sync/crypto';

const FAST = { iterations: 1_000 }; // keep tests quick; production uses DEFAULT_ITERATIONS

describe('sync encryption', () => {
  it('round-trips (including non-ASCII text) and gzips the payload', async () => {
    const text = JSON.stringify({ entries: Array.from({ length: 200 }, (_, i) => ({ title: `Книга ${i} — “quoted”` })) });
    const env = await encryptPayload(text, 'correct horse', FAST);
    expect(env.length).toBeLessThan(text.length); // compressed before encryption
    const { plaintext } = await decryptPayload(env, 'correct horse');
    expect(plaintext).toBe(text);
  });

  it('produces an envelope with no plaintext in it', async () => {
    const env = JSON.parse(await encryptPayload('secret shelf contents', 'pw', FAST));
    expect(env).toMatchObject({ format: 'bookshelf-sync', v: 1, cipher: 'AES-256-GCM' });
    expect(JSON.stringify(env)).not.toContain('secret shelf');
  });

  it('rejects a wrong passphrase', async () => {
    const env = await encryptPayload('x', 'right', FAST);
    await expect(decryptPayload(env, 'wrong')).rejects.toThrow(/passphrase/);
  });

  it('detects tampering with the ciphertext or the authenticated header', async () => {
    const env = JSON.parse(await encryptPayload('payload', 'pw', FAST));
    const flipped = { ...env, data: (env.data[0] === 'A' ? 'B' : 'A') + env.data.slice(1) };
    await expect(decryptPayload(JSON.stringify(flipped), 'pw')).rejects.toThrow();
    const relabelled = { ...env, cipher: 'AES-128-GCM' };
    await expect(decryptPayload(JSON.stringify(relabelled), 'pw')).rejects.toThrow();
  });

  it('uses a fresh IV on every write, even when reusing the salt', async () => {
    const a = JSON.parse(await encryptPayload('same', 'pw', FAST));
    const b = JSON.parse(await encryptPayload('same', 'pw', { ...FAST, reuseSalt: a.kdf.salt }));
    expect(b.kdf.salt).toBe(a.kdf.salt);
    expect(b.iv).not.toBe(a.iv);
    expect(b.data).not.toBe(a.data);
    expect((await decryptPayload(JSON.stringify(b), 'pw')).plaintext).toBe('same');
  });

  it('refuses files that are not BookShelf sync files or are from a newer version', async () => {
    await expect(decryptPayload('{"hello":1}', 'pw')).rejects.toThrow(/Not a BookShelf/);
    await expect(decryptPayload('not json', 'pw')).rejects.toThrow(/not readable/);
    const env = JSON.parse(await encryptPayload('x', 'pw', FAST));
    await expect(decryptPayload(JSON.stringify({ ...env, v: 99 }), 'pw')).rejects.toThrow(/newer/);
  });

  it('defaults to a strong key-derivation cost', () => {
    expect(DEFAULT_ITERATIONS).toBeGreaterThanOrEqual(600_000);
  });
});
