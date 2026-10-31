// Scan a book's ISBN barcode.
//
// In the Android app this uses Google's Code Scanner via the native bridge
// (full camera UI from Play services; no camera permission). In a browser it
// falls back to the Shape Detection API (BarcodeDetector) on a live camera
// feed. canScanBarcodes() is false when neither is available.

import { isNativeShell, callNative } from '../platform/native';
import { mount, unmount } from 'svelte';
import CameraScanner from '../components/CameraScanner.svelte';

// The formats printed on books (EAN-13 carries the ISBN; UPC on some US mass-market).
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

export function canScanBarcodes() {
  return isNativeShell() || ('BarcodeDetector' in globalThis && !!navigator.mediaDevices?.getUserMedia);
}

/**
 * Resolves with the scanned code, or null if the user cancelled.
 */
export async function scanBarcode(): Promise<string | null> {
  const code = isNativeShell() ? await callNative<string | null>('scanBarcode') : await scanWithCamera();
  return code ? String(code).trim() : null;
}

async function scanWithCamera(): Promise<string | null> {
  const supported = await BarcodeDetector.getSupportedFormats();
  const formats = FORMATS.filter((f) => supported.includes(f));
  if (!formats.length) throw new Error('This browser cannot read book barcodes.');
  const detector = new BarcodeDetector({ formats });
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });
  } catch {
    throw new Error('Camera access was denied or no camera is available.');
  }

  // A second modal <dialog> stacks above the add flow in the top layer.
  return new Promise((resolve) => {
    const scanner = mount(CameraScanner, {
      target: document.body,
      props: {
        stream,
        detector,
        onDone: (result: string | null) => {
          stream.getTracks().forEach((t) => t.stop());
          void unmount(scanner);
          resolve(result);
        }
      }
    });
  });
}
