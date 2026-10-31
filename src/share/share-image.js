// Send a rendered card somewhere: the Android share sheet, the Web Share API
// (with files), or a download.

import { isNativeShell, callNative } from '../platform/native.js';

/** @param {Blob} blob @returns {Promise<string>} base64 without the data: prefix */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.readAsDataURL(blob);
  });
}

/** Whether a plain-browser "Save image" (download) makes sense here. */
export function canDownload() {
  return !isNativeShell();
}

/**
 * @param {Blob} blob PNG
 * @param {string} filename
 * @param {string} title
 * @returns {Promise<'shared' | 'downloaded' | 'cancelled'>}
 */
export async function shareImage(blob, filename, title) {
  if (isNativeShell()) {
    await callNative('shareFile', { filename, mime: 'image/png', base64: await blobToBase64(blob) });
    return 'shared';
  }
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    }
  }
  downloadImage(blob, filename);
  return 'downloaded';
}

/** @param {Blob} blob @param {string} filename */
export function downloadImage(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "the-left-hand-of-darkness.png" @param {string} title */
export function cardFilename(title) {
  const slug = title.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 48);
  return `${slug || 'bookshelf'}-card.png`;
}
