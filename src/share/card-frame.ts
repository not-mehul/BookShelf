// Share cards (style.md §8.16). Shared by Waymark, BookShelf and Ledger; keep
// the copies identical. Every card is drawn in the app's current theme from a
// probe element, on the page's gradient with its glows at twice the opacity,
// inside a hairline frame, with an eyebrow at the top and a footer line.

export type CardTheme = 'dark' | 'light';

export const CARD_FORMATS = {
  post: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 }
} as const;

/** The frame sits this far in from the edge; content starts further in. */
export const FRAME_INSET = 48;
export const CONTENT_INSET = 112;

export const SERIF =
  'Fraunces, "Iowan Old Style", "Apple Garamond", Baskerville, Georgia, "Noto Serif", serif';
export const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "Roboto Mono", "Liberation Mono", monospace';

const TOKENS = [
  'bg-grad-top',
  'bg-grad-mid',
  'bg-grad-bot',
  'text-heading',
  'text-strong',
  'text-body',
  'text-muted',
  'text-dim',
  'text-faint',
  'accent-amber',
  'accent-bright',
  'accent-sage',
  'border-faint',
  'chart-track',
  'accent-amber-rgb',
  'accent-sage-rgb',
  'cream-rgb',
  'shadow-rgb',
  'scale-1',
  'scale-2',
  'scale-3',
  'scale-4',
  'scale-5',
  'series-1'
] as const;

export type CardToken = (typeof TOKENS)[number];
export type Palette = Record<CardToken, string>;

/** Reads one theme's tokens, whatever theme the page is showing. */
export function readPalette(theme: CardTheme): Palette {
  const probe = document.createElement('div');
  probe.dataset.theme = theme;
  probe.hidden = true;
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const palette = Object.fromEntries(
    TOKENS.map((name) => [name, style.getPropertyValue(`--${name}`).trim()])
  ) as Palette;
  probe.remove();
  return palette;
}

/** The theme on screen, so the card matches the app. */
export function currentCardTheme(): CardTheme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/** Waits for Fraunces, so the first card isn't drawn in a fallback serif. */
export async function cardFontsReady(): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load(`400 40px ${SERIF}`),
      document.fonts.load(`italic 400 40px ${SERIF}`)
    ]);
  } catch {
    // Draw with whatever is available.
  }
}

export function createCard(
  width: number,
  height: number
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return { canvas, ctx };
}

function glow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  rgb: string,
  stops: [number, number][]
) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  for (const [at, alpha] of stops) g.addColorStop(at, `rgba(${rgb}, ${alpha})`);
  g.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

/** The surface, the glows, the hairline frame and its corner brackets. */
export function drawFrame(ctx: CanvasRenderingContext2D, p: Palette): void {
  const { width: W, height: H } = ctx.canvas;
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, p['bg-grad-top']);
  bg.addColorStop(0.5, p['bg-grad-mid']);
  bg.addColorStop(1, p['bg-grad-bot']);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // The page's three glows (§4), at twice their opacity.
  glow(ctx, W * 0.95, H * 0.05, W * 0.75, p['accent-amber-rgb'], [
    [0, 0.2],
    [0.3, 0.06]
  ]);
  glow(ctx, W * 0.05, H * 0.98, W * 0.85, p['accent-sage-rgb'], [
    [0, 0.16],
    [0.35, 0.04]
  ]);
  glow(ctx, W * 0.55, H * 0.55, W * 0.5, p['cream-rgb'], [[0, 0.06]]);

  ctx.strokeStyle = `rgba(${p['accent-amber-rgb']}, 0.3)`;
  ctx.lineWidth = 2;
  ctx.strokeRect(FRAME_INSET, FRAME_INSET, W - FRAME_INSET * 2, H - FRAME_INSET * 2);

  ctx.strokeStyle = `rgba(${p['accent-amber-rgb']}, 0.5)`;
  const b = FRAME_INSET + 16;
  const len = 40;
  ctx.beginPath();
  ctx.moveTo(b, b + len);
  ctx.lineTo(b, b);
  ctx.lineTo(b + len, b);
  ctx.moveTo(W - b, H - b - len);
  ctx.lineTo(W - b, H - b);
  ctx.lineTo(W - b - len, H - b);
  ctx.stroke();
}

/** Text in caps with tracking, as the mono labels are set (§5.2). */
export function drawTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  tracking: number,
  align: CanvasTextAlign = 'left'
): void {
  ctx.font = `400 ${size}px ${MONO}`;
  ctx.letterSpacing = `${size * tracking}px`;
  ctx.textAlign = align;
  // Tracking adds space after the last letter too; take it back on the right.
  ctx.fillText(text.toUpperCase(), align === 'right' ? x + size * tracking : x, y);
  ctx.letterSpacing = '0px';
  ctx.textAlign = 'left';
}

/** The eyebrow at the top: the app's name and the date. */
export function drawEyebrow(ctx: CanvasRenderingContext2D, p: Palette, text: string): number {
  const y = CONTENT_INSET + 26;
  ctx.fillStyle = p['text-dim'];
  drawTracked(ctx, text, CONTENT_INSET, y, 26, 0.25);
  return y;
}

/** The footer line: the app's name on the left, a short tagline on the right. */
export function drawFooter(ctx: CanvasRenderingContext2D, p: Palette, app: string, tagline: string): void {
  const { width: W, height: H } = ctx.canvas;
  const y = H - CONTENT_INSET;
  ctx.fillStyle = `rgba(${p['accent-amber-rgb']}, 0.3)`;
  ctx.fillRect(CONTENT_INSET, y - 52, W - CONTENT_INSET * 2, 1);
  ctx.fillStyle = p['text-dim'];
  drawTracked(ctx, app, CONTENT_INSET, y, 22, 0.2);
  drawTracked(ctx, tagline, W - CONTENT_INSET, y, 22, 0.2, 'right');
}

/** Shrinks a serif line until it fits. Returns the size used. */
export function fitSerif(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  start: number,
  min: number,
  italic = false
): number {
  let size = start;
  for (;;) {
    ctx.font = `${italic ? 'italic ' : ''}400 ${size}px ${SERIF}`;
    if (size <= min || ctx.measureText(text).width <= maxWidth) return size;
    size -= 4;
  }
}

/** Cuts a line to `maxWidth` with an ellipsis, in the current font. */
export function clipText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not render the image.'))),
      'image/png'
    )
  );
}
