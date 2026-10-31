// Download a remote thumbnail and store as a Blob for fully-offline cards.
// Covers are downscaled to keep IndexedDB small. Falls back gracefully — if the
// fetch is blocked (CORS, network) or downscaling is unavailable, we return
// the original blob (or null), and callers keep the remote URL.

import { getSetting } from './settings';
import { isNativeShell } from '../platform/native';

const MAX_WIDTH = 400; // cover cards never render wider than this

export async function fetchThumbBlob(url: string | null | undefined): Promise<Blob | null> {
  if (!url) return null;
  try {
    const finalUrl = isNativeShell() ? url : await browserUrl(url);
    const res = await fetch(finalUrl, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size === 0) return null;
    return (await downscale(blob)) || blob;
  } catch {
    return null;
  }
}

// In a plain browser, cover hosts may not send CORS headers. TheTVDB artwork
// goes through the BookShelf proxy when one is set; otherwise a generic CORS
// proxy (if configured) is prefixed.
async function browserUrl(url: string) {
  const tvdbProxy = (await getSetting('tvdb_proxy_url', '')).trim().replace(/\/+$/, '');
  if (tvdbProxy && /^https:\/\/artworks\.thetvdb\.com\//.test(url)) {
    return `${tvdbProxy}/artwork?url=${encodeURIComponent(url)}`;
  }
  const corsProxy = await getSetting('cors_proxy', '');
  return corsProxy ? `${corsProxy}${url}` : url;
}

// Returns a smaller JPEG blob, or null if downscaling isn't possible/needed.
async function downscale(blob: Blob): Promise<Blob | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  if (!/^image\//.test(blob.type)) return null;
  try {
    const bitmap = await createImageBitmap(blob);
    if (bitmap.width <= MAX_WIDTH) {
      bitmap.close?.();
      return null; // already small enough — keep the original
    }
    const scale = MAX_WIDTH / bitmap.width;
    const canvas = document.createElement('canvas');
    canvas.width = MAX_WIDTH;
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  } catch {
    return null;
  }
}
