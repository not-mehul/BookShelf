// Send a rendered card somewhere: the Android share sheet, the Web Share API
// (with files), or a download.

import { isNativeShell, callNative } from '../platform/native';

/** Base64 without the data: prefix. */
function blobToBase64(blob: Blob): Promise<string> {
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
 * @param blob PNG
 */
export async function shareImage(
  blob: Blob,
  filename: string,
  title: string
): Promise<'shared' | 'downloaded' | 'cancelled'> {
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

export function downloadImage(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "the-left-hand-of-darkness.png" @param title */
export function cardFilename(title: string) {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 48);
  return `${slug || 'bookshelf'}-card.png`;
}
