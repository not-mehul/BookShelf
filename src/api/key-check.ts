// Checking a key the user pasted, against the service it is for.

export type KeyCheck =
  /** The service answered and took the key. */
  | { kind: 'works' }
  /** The service answered and turned the key away. */
  | { kind: 'rejected' }
  /** No answer (offline, or the service is down): the key may still be fine. */
  | { kind: 'unknown' };

/** Ask the service with `request`, and read its answer as a verdict on the key. */
export async function checkKey(request: () => Promise<Response>): Promise<KeyCheck> {
  try {
    const res = await request();
    if (res.ok) return { kind: 'works' };
    if (res.status === 400 || res.status === 401 || res.status === 403) return { kind: 'rejected' };
    return { kind: 'unknown' };
  } catch {
    return { kind: 'unknown' };
  }
}
