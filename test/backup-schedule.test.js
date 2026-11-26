// The backup's schedule: daily, weekly, monthly or off, daily unless chosen.
import { describe, it, expect, beforeEach } from 'vitest';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};

const { backupDue, readBackupEvery } = await import('../src/sync/sync.ts');

const HOUR = 3_600_000;
const NOW = Date.parse('2026-11-25T12:00:00Z');
const ago = (hours) => new Date(NOW - hours * HOUR).toISOString();

beforeEach(() => store.clear());

describe('readBackupEvery', () => {
  it('is daily unless another choice was saved', () => {
    expect(readBackupEvery()).toBe('daily');
    store.set('bookshelf:sync_every', 'monthly');
    expect(readBackupEvery()).toBe('monthly');
    store.set('bookshelf:sync_every', 'hourly');
    expect(readBackupEvery()).toBe('daily');
  });
});

describe('backupDue', () => {
  it('is due with no backup yet, unless off', () => {
    expect(backupDue('daily', '', NOW)).toBe(true);
    expect(backupDue('off', '', NOW)).toBe(false);
  });
  it('allows an hour of slack, so a daily backup does not drift', () => {
    expect(backupDue('daily', ago(22), NOW)).toBe(false);
    expect(backupDue('daily', ago(23), NOW)).toBe(true);
  });
  it('waits a week or a month', () => {
    expect(backupDue('weekly', ago(6 * 24), NOW)).toBe(false);
    expect(backupDue('weekly', ago(7 * 24), NOW)).toBe(true);
    expect(backupDue('monthly', ago(20 * 24), NOW)).toBe(false);
    expect(backupDue('monthly', ago(30 * 24), NOW)).toBe(true);
  });
});
