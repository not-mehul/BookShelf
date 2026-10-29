// End-to-end encryption for the sync file (WebCrypto; works in browsers,
// Android WebView and Node).
//
//   plaintext ──gzip──▶ AES-256-GCM ──▶ base64, inside a small JSON envelope
//   key = PBKDF2-SHA256(passphrase, random salt, 600k iterations)
//
// The envelope header (format, version, KDF params) is bound as additional
// authenticated data, so tampering with it fails decryption. Only ciphertext
// ever leaves the device; the passphrase stays in the Android Keystore.

export const FORMAT = 'bookshelf-sync';
export const FORMAT_VERSION = 1;
export const DEFAULT_ITERATIONS = 600_000;

/**
 * @typedef {object} Envelope
 * @property {typeof FORMAT} format
 * @property {number} v
 * @property {{ alg: 'PBKDF2-SHA256', iterations: number, salt: string }} kdf
 * @property {'AES-256-GCM'} cipher
 * @property {string} iv
 * @property {string} data
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

/** @type {Map<string, Promise<CryptoKey>>} Derived keys for this session, by salt + passphrase. */
const keyCache = new Map();

/**
 * @param {string} passphrase
 * @param {Uint8Array<ArrayBuffer>} salt
 * @param {number} iterations
 */
function deriveKey(passphrase, salt, iterations) {
  const cacheKey = `${iterations}:${toBase64(salt)}:${passphrase}`;
  let key = keyCache.get(cacheKey);
  if (!key) {
    key = crypto.subtle
      .importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
      .then((base) =>
        crypto.subtle.deriveKey(
          { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
          base,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        )
      );
    keyCache.set(cacheKey, key);
  }
  return key;
}

/** @param {Pick<Envelope, 'format' | 'v' | 'kdf' | 'cipher'>} h */
const headerAad = (h) => enc.encode(JSON.stringify([h.format, h.v, h.kdf.alg, h.kdf.iterations, h.kdf.salt, h.cipher]));

/**
 * Encrypt `plaintext`. Pass the salt of the file being replaced (`reuseSalt`)
 * to avoid re-deriving the key; every write still gets a fresh random IV.
 * @param {string} plaintext
 * @param {string} passphrase
 * @param {{ iterations?: number, reuseSalt?: string }} [options]
 * @returns {Promise<string>} The envelope, as JSON.
 */
export async function encryptPayload(plaintext, passphrase, { iterations = DEFAULT_ITERATIONS, reuseSalt } = {}) {
  if (!passphrase) throw new Error('A sync passphrase is required.');
  const salt = reuseSalt ? fromBase64(reuseSalt) : crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  /** @type {Omit<Envelope, 'iv' | 'data'>} */
  const header = {
    format: FORMAT,
    v: FORMAT_VERSION,
    kdf: { alg: 'PBKDF2-SHA256', iterations, salt: toBase64(salt) },
    cipher: 'AES-256-GCM'
  };
  const key = await deriveKey(passphrase, salt, iterations);
  const compressed = await gzip(enc.encode(plaintext));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: headerAad(header) }, key, compressed);
  return JSON.stringify({ ...header, iv: toBase64(iv), data: toBase64(new Uint8Array(data)) });
}

/**
 * @param {string} envelopeJson
 * @param {string} passphrase
 * @returns {Promise<{ plaintext: string, salt: string }>}
 */
export async function decryptPayload(envelopeJson, passphrase) {
  /** @type {Envelope} */
  let env;
  try {
    env = JSON.parse(envelopeJson);
  } catch {
    throw new Error('The sync file is not readable (corrupted?).');
  }
  if (env?.format !== FORMAT) throw new Error('Not a BookShelf sync file.');
  if (env.v > FORMAT_VERSION) throw new Error('The sync file was written by a newer BookShelf. Update the app.');
  const key = await deriveKey(passphrase, fromBase64(env.kdf.salt), env.kdf.iterations);
  let compressed;
  try {
    compressed = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(env.iv), additionalData: headerAad(env) },
      key,
      fromBase64(env.data)
    );
  } catch {
    throw new Error('Wrong sync passphrase, or the sync file is corrupted.');
  }
  return { plaintext: dec.decode(await gunzip(new Uint8Array(compressed))), salt: env.kdf.salt };
}

// ── helpers ────────────────────────────────────────────────────

/** @param {Uint8Array<ArrayBuffer>} bytes */
async function gzip(bytes) {
  return pipe(bytes, new CompressionStream('gzip'));
}

/** @param {Uint8Array<ArrayBuffer>} bytes */
async function gunzip(bytes) {
  return pipe(bytes, new DecompressionStream('gzip'));
}

/**
 * @param {Uint8Array<ArrayBuffer>} bytes
 * @param {CompressionStream | DecompressionStream} transform
 */
async function pipe(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** @param {Uint8Array} bytes */
function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** @param {string} b64 */
function fromBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
