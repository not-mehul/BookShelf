// Scan a book's ISBN barcode.
//
// In the Android app this uses Google's Code Scanner via the native bridge
// (full camera UI from Play services; no camera permission). In a browser it
// falls back to the Shape Detection API (BarcodeDetector) on a live camera
// feed. canScanBarcodes() is false when neither is available.

import { isNativeShell, callNative } from '../platform/native.js';
import { el } from '../ui/components.js';
import { icons } from './icons.js';

// The formats printed on books (EAN-13 carries the ISBN; UPC on some US mass-market).
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
const SCAN_INTERVAL_MS = 150;

export function canScanBarcodes() {
  return isNativeShell() || ('BarcodeDetector' in globalThis && !!navigator.mediaDevices?.getUserMedia);
}

/**
 * Resolves with the scanned code, or null if the user cancelled.
 * @returns {Promise<string | null>}
 */
export async function scanBarcode() {
  const code = isNativeShell() ? await callNative('scanBarcode') : await scanWithCamera();
  return code ? String(code).trim() : null;
}

/** @returns {Promise<string | null>} */
async function scanWithCamera() {
  const supported = await BarcodeDetector.getSupportedFormats();
  const formats = FORMATS.filter((f) => supported.includes(f));
  if (!formats.length) throw new Error('This browser cannot read book barcodes.');
  const detector = new BarcodeDetector({ formats });

  /** @type {MediaStream} */
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  } catch {
    throw new Error('Camera access was denied or no camera is available.');
  }

  // A second modal <dialog> stacks above the add flow in the top layer.
  const video = el('video', { class: 'scanner-video', playsinline: true, muted: true });
  video.srcObject = stream;
  const cancel = el('button', { type: 'button', class: 'btn-icon scanner-cancel', 'aria-label': 'Cancel scan' });
  cancel.innerHTML = icons.x();
  const dialog = el('dialog', { class: 'scanner-dialog', 'aria-label': 'Scan a barcode' },
    video,
    el('div', { class: 'scanner-frame', 'aria-hidden': 'true' }),
    el('p', { class: 'scanner-hint' }, 'Point the camera at the barcode on the back cover'),
    cancel
  );
  document.body.appendChild(dialog);
  dialog.showModal();

  return new Promise((resolve) => {
    let done = false;
    /** @param {string | null} result */
    const finish = (result) => {
      if (done) return;
      done = true;
      clearInterval(timer);
      stream.getTracks().forEach((t) => t.stop());
      dialog.close();
      dialog.remove();
      resolve(result);
    };
    cancel.addEventListener('click', () => finish(null));
    dialog.addEventListener('cancel', (ev) => {
      ev.preventDefault();
      finish(null);
    });

    const timer = setInterval(async () => {
      if (done || video.readyState < 2) return;
      try {
        const [hit] = await detector.detect(video);
        if (hit?.rawValue) finish(hit.rawValue);
      } catch {
        /* transient decode errors: keep scanning */
      }
    }, SCAN_INTERVAL_MS);
    video.play().catch(() => finish(null));
  });
}
