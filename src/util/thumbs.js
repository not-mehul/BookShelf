// Download a remote thumbnail and store as a Blob for fully-offline cards.
// Falls back gracefully — if the fetch is blocked (CORS, network), we keep the URL.

import { getSetting } from './settings.js';

export async function fetchThumbBlob(url) {
  if (!url) return null;
  try {
    const proxy = !window.AndroidHttp ? await getSetting('cors_proxy', '') : '';
    const finalUrl = proxy ? `${proxy}${url}` : url;
    const res = await fetch(finalUrl, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size === 0) return null;
    return blob;
  } catch {
    return null;
  }
}
