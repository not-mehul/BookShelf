// Download a remote thumbnail and store as a Blob for fully-offline cards.
// Falls back gracefully — if the fetch is blocked (CORS, network), we keep the URL.

export async function fetchThumbBlob(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size === 0) return null;
    return blob;
  } catch {
    return null;
  }
}
