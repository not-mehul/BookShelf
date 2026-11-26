// Checking a pasted key: the service's answer says works, rejected, or unknown.
import { describe, it, expect } from 'vitest';
import { checkKey } from '../src/api/key-check';

const answer = (status) => () => Promise.resolve(new Response('{}', { status }));

describe('checkKey', () => {
  it('works when the service answers OK', async () => {
    expect(await checkKey(answer(200))).toEqual({ kind: 'works' });
  });
  it('is rejected when the service turns the key away', async () => {
    for (const status of [400, 401, 403])
      expect(await checkKey(answer(status))).toEqual({ kind: 'rejected' });
  });
  it('is unknown when the service is busy, down or out of reach', async () => {
    expect(await checkKey(answer(429))).toEqual({ kind: 'unknown' });
    expect(await checkKey(answer(503))).toEqual({ kind: 'unknown' });
    expect(await checkKey(() => Promise.reject(new TypeError('offline')))).toEqual({ kind: 'unknown' });
  });
});
