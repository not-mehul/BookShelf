// Scan a book's ISBN barcode with Google's Code Scanner, through the Android
// app (full camera UI from Play services; no camera permission).

import { isNativeShell, callNative } from '../platform/native';

/** False only when the page runs outside the app (development in a browser). */
export function canScanBarcodes() {
  return isNativeShell();
}

/**
 * Resolves with the scanned code, or null if the user cancelled.
 */
export async function scanBarcode(): Promise<string | null> {
  const code = await callNative<string | null>('scanBarcode');
  return code ? String(code).trim() : null;
}
