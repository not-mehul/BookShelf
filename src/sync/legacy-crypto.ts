// Reading a backup from before 3.1, when the file was encrypted with a
// passphrase (WebCrypto; works in Android WebView and Node):
//
//   base64 inside a small JSON envelope ──▶ AES-256-GCM ──▶ gunzip ──▶ snapshot
//   key = PBKDF2-SHA256(passphrase, the file's salt, its iterations)
//
// Backups are plain JSON now. This reads an old one once, with the passphrase
// still in the Keystore; the next backup replaces it with a plain file.

export const LEGACY_FORMAT = 'bookshelf-sync';
const LEGACY_VERSION = 1;
/** The most key-derivation work an old file may ask for (~15 s on a phone). */
export const MAX_ITERATIONS = 10_000_000;

interface Envelope {
  format: typeof LEGACY_FORMAT;
  v: number;
  kdf: { alg: 'PBKDF2-SHA256'; iterations: number; salt: string };
  cipher: 'AES-256-GCM';
  iv: string;
  data: string;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Whether `data` (the parsed file) is an old, encrypted backup. */
export function isEncryptedBackup(data: unknown): boolean {
  return Boolean(data && typeof data === 'object' && (data as Envelope).format === LEGACY_FORMAT);
}

function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  return crypto.subtle
    .importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
    .then((base) =>
      crypto.subtle.deriveKey(
        { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
        base,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      )
    );
}

const headerAad = (h: Pick<Envelope, 'format' | 'v' | 'kdf' | 'cipher'>) =>
  enc.encode(JSON.stringify([h.format, h.v, h.kdf.alg, h.kdf.iterations, h.kdf.salt, h.cipher]));

/** Decrypt an old backup (its parsed envelope) with its passphrase. @returns The snapshot, as JSON. */
export async function decryptLegacyBackup(file: unknown, passphrase: string): Promise<string> {
  const env = file as Envelope;
  if (env.v > LEGACY_VERSION) throw new Error('The backup was written by a newer BookShelf. Update the app.');
  const unreadable = () => new Error('The backup file can’t be read (is it damaged?).');
  const iterations = env.kdf?.iterations;
  if (
    env.kdf?.alg !== 'PBKDF2-SHA256' ||
    env.cipher !== 'AES-256-GCM' ||
    typeof env.kdf.salt !== 'string' ||
    typeof env.iv !== 'string' ||
    typeof env.data !== 'string' ||
    !Number.isInteger(iterations) ||
    // The header is authenticated, but only once the key is derived: bound the
    // work a damaged file can ask for, so it fails instead of hanging the app.
    iterations < 1 ||
    iterations > MAX_ITERATIONS
  )
    throw unreadable();
  let salt, iv, data;
  try {
    [salt, iv, data] = [fromBase64(env.kdf.salt), fromBase64(env.iv), fromBase64(env.data)];
  } catch {
    throw unreadable();
  }
  const key = await deriveKey(passphrase, salt, iterations);
  let compressed;
  try {
    compressed = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: headerAad(env) },
      key,
      data
    );
  } catch {
    throw new Error(
      'This backup was encrypted with a passphrase, and the one on this phone doesn’t open it.'
    );
  }
  try {
    const stream = new Blob([new Uint8Array(compressed)])
      .stream()
      .pipeThrough(new DecompressionStream('gzip'));
    return dec.decode(await new Response(stream).arrayBuffer());
  } catch {
    throw unreadable();
  }
}

function fromBase64(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
