// Reading a backup from before 3.1, when the file was encrypted with a
// passphrase. The fixture was written by that version (passphrase "old secret").
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { decryptLegacyBackup, isEncryptedBackup } from '../src/sync/legacy-crypto';

const OLD = JSON.parse(
  readFileSync(new URL('./fixtures/legacy-encrypted-backup.json', import.meta.url), 'utf8')
);

describe('old encrypted backups', () => {
  it('are told apart from plain ones', () => {
    expect(isEncryptedBackup(OLD)).toBe(true);
    expect(isEncryptedBackup({ format: 'bookshelf-backup', version: 2, entries: [] })).toBe(false);
    expect(isEncryptedBackup(null)).toBe(false);
  });

  it('open with their passphrase', async () => {
    const snapshot = JSON.parse(await decryptLegacyBackup(OLD, 'old secret'));
    expect(snapshot.entries.map((e) => e.title)).toEqual(['Piranesi — encrypted']);
  });

  it('say so when the passphrase is not theirs', async () => {
    await expect(decryptLegacyBackup(OLD, 'wrong')).rejects.toThrow(/passphrase/);
  });

  it('refuse tampering, newer versions and unbounded work, plainly', async () => {
    const flipped = { ...OLD, data: (OLD.data[0] === 'A' ? 'B' : 'A') + OLD.data.slice(1) };
    await expect(decryptLegacyBackup(flipped, 'old secret')).rejects.toThrow();
    await expect(decryptLegacyBackup({ ...OLD, v: 99 }, 'old secret')).rejects.toThrow(/newer/);
    const head = { format: 'bookshelf-sync', v: 1, cipher: 'AES-256-GCM', iv: 'AAAA', data: 'AAAA' };
    for (const env of [
      { format: 'bookshelf-sync', v: 1 },
      { ...head, kdf: { alg: 'PBKDF2-SHA256', salt: 'AAAA', iterations: 0 } },
      { ...head, kdf: { alg: 'PBKDF2-SHA256', salt: 'AAAA', iterations: 1e12 } },
      { ...head, kdf: { alg: 'PBKDF2-SHA256', salt: '!!', iterations: 1000 } }
    ]) {
      await expect(decryptLegacyBackup(env, 'pw')).rejects.toThrow(
        'The backup file can’t be read (is it damaged?).'
      );
    }
  });
});
