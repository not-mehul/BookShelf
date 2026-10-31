<script lang="ts">
  import Icon from './Icon.svelte';

  interface Props {
    stream: MediaStream;
    detector: BarcodeDetector;
    onDone: (result: string | null) => void;
  }

  let { stream, detector, onDone }: Props = $props();
  let dialog: HTMLDialogElement;
  let video: HTMLVideoElement;
  let done = false;

  const SCAN_INTERVAL_MS = 150;

  function finish(result: string | null) {
    if (done) return;
    done = true;
    dialog.close();
    onDone(result);
  }

  $effect(() => {
    video.srcObject = stream;
    dialog.showModal();
    video.play().catch(() => finish(null));
    const timer = setInterval(async () => {
      if (done || video.readyState < 2) return;
      try {
        const [hit] = await detector.detect(video);
        if (hit?.rawValue) finish(hit.rawValue);
      } catch {
        /* transient decode errors: keep scanning */
      }
    }, SCAN_INTERVAL_MS);
    return () => clearInterval(timer);
  });
</script>

<dialog
  bind:this={dialog}
  class="scanner-dialog"
  aria-label="Scan a barcode"
  oncancel={(ev) => {
    ev.preventDefault();
    finish(null);
  }}
>
  <video bind:this={video} class="scanner-video" playsinline muted></video>
  <div class="scanner-frame" aria-hidden="true"></div>
  <p class="scanner-hint">Point the camera at the barcode on the back cover</p>
  <button type="button" class="btn-icon scanner-cancel" aria-label="Cancel scan" onclick={() => finish(null)}>
    <Icon name="x" />
  </button>
</dialog>
