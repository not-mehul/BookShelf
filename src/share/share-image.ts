// Send a rendered card to the Android share sheet.

import { callNative } from '../platform/native';

/** Base64 without the data: prefix. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.readAsDataURL(blob);
  });
}

/** Hands the card (a PNG) to the Android share sheet. */
export async function shareImage(blob: Blob, filename: string): Promise<void> {
  await callNative('shareFile', { filename, mime: 'image/png', base64: await blobToBase64(blob) });
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
