// Render share cards (quote / book / film / show) to a canvas, in the app's
// Dusk or Dawn palette. Colours are read from tokens.css via a probe element,
// so the cards always match the app. The frame, eyebrow and footer are the
// shared ones (style.md §8.16, card-frame.ts).

import {
  cardFontsReady,
  drawEyebrow,
  drawFooter,
  drawFrame,
  readPalette as readFramePalette
} from './card-frame';
import { fitText, wrapLines, FORMATS, type Measure } from './layout';
import { fetchThumbBlob } from '../util/thumbs';
import { normalizeRating, ratingLabel } from '../util/stars';
import { statusLabel } from '../util/status';
import type { CatalogEntry } from '../types';

export interface CardOptions {
  theme: 'dark' | 'light';
  format: keyof typeof FORMATS;
  includeRating?: boolean;
  includeNotes?: boolean;
}

const SERIF = 'Fraunces, "Iowan Old Style", "Apple Garamond", Baskerville, Georgia, "Noto Serif", serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, "Roboto Mono", monospace';
const TYPE_LABEL = { book: 'Book', movie: 'Film', tv: 'TV Show', quote: 'Quote' };
const TAGLINE = {
  book: 'On my shelf',
  movie: 'On my shelf',
  tv: 'On my shelf',
  quote: 'Worth keeping'
};

export function readPalette(theme: 'dark' | 'light') {
  const probe = document.createElement('div');
  probe.dataset.theme = theme;
  probe.hidden = true;
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  const palette = {
    top: v('--bg-grad-top'),
    mid: v('--bg-grad-mid') || v('--bg-grad-top'),
    bottom: v('--bg-grad-bot'),
    heading: v('--text-heading'),
    body: v('--text-body'),
    dim: v('--text-dim'),
    muted: v('--text-muted'),
    accent: v('--accent-amber'),
    accentRgb: v('--accent-amber-rgb'),
    shadowRgb: v('--shadow-rgb') || '0, 0, 0'
  };
  probe.remove();
  return palette;
}
export async function renderCard(entry: CatalogEntry, options: CardOptions): Promise<HTMLCanvasElement> {
  const { width: W, height: H } = FORMATS[options.format] || FORMATS.post;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const p = readPalette(options.theme);
  const frame = readFramePalette(options.theme);
  await cardFontsReady();

  drawFrame(ctx, frame);
  const added = entry.dateAdded ? new Date(entry.dateAdded) : new Date();
  const when = added.toLocaleDateString('en', { month: 'long', year: 'numeric' });
  drawEyebrow(ctx, frame, `BookShelf · ${when}`);
  if (entry.type === 'quote') drawQuote(ctx, entry, W, H, p);
  else await drawEntry(ctx, entry, W, H, p, options);
  drawFooter(ctx, frame, 'BookShelf', TAGLINE[entry.type]);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not render the image.'))),
      'image/png'
    )
  );
}

// ── Pieces ─────────────────────────────────────────────────────

export type Palette = ReturnType<typeof readPalette>;

function drawQuote(ctx: CanvasRenderingContext2D, entry: CatalogEntry, W: number, H: number, p: Palette) {
  const pad = 130;
  ctx.fillStyle = `rgba(${p.accentRgb}, 0.9)`;
  ctx.font = `260px ${SERIF}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('“', pad - 20, pad + 210);

  const top = pad + 250;
  const bottom = H - 360;
  const measure = measurer(ctx, (s) => `italic ${s}px ${SERIF}`);
  const fit = fitText({
    text: entry.quoteText || entry.title,
    maxWidth: W - pad * 2,
    maxHeight: bottom - top,
    maxSize: 78,
    minSize: 34,
    lineHeight: 1.35,
    measure
  });
  const lineH = fit.size * 1.35;
  let y = top + (bottom - top - fit.lines.length * lineH) / 2 + fit.size;
  ctx.font = `italic ${fit.size}px ${SERIF}`;
  ctx.fillStyle = p.heading;
  for (const line of fit.lines) {
    ctx.fillText(line, pad, y);
    y += lineH;
  }

  const author = entry.creators?.[0];
  const where = [entry.source, entry.location].filter(Boolean).join(', ');
  let ay = bottom + 70;
  if (author) {
    ctx.font = `40px ${SERIF}`;
    ctx.fillStyle = p.body;
    ctx.fillText(clip(ctx, `— ${author}`, W - pad * 2), pad, ay);
    ay += 52;
  }
  if (where) {
    ctx.font = `italic 34px ${SERIF}`;
    ctx.fillStyle = p.dim;
    ctx.fillText(clip(ctx, author ? where : `— ${where}`, W - pad * 2), pad, ay);
  }
}

async function drawEntry(
  ctx: CanvasRenderingContext2D,
  entry: CatalogEntry,
  W: number,
  H: number,
  p: Palette,
  options: CardOptions
) {
  const pad = 120;
  const contentW = W - pad * 2;
  const footerTop = H - 200;
  let y = pad + 90;

  // Cover (or a placeholder in the palette).
  const maxCoverH = H * (options.format === 'story' ? 0.4 : options.format === 'square' ? 0.36 : 0.4);
  const maxCoverW = W * 0.46;
  const cover = await loadCover(entry);
  let cw;
  let ch;
  if (cover) {
    const scale = Math.min(maxCoverW / cover.width, maxCoverH / cover.height);
    cw = cover.width * scale;
    ch = cover.height * scale;
  } else {
    ch = Math.min(maxCoverW * 1.5, maxCoverH); // 2:3 placeholder
    cw = ch / 1.5;
  }
  const cx = (W - cw) / 2;
  ctx.save();
  ctx.shadowColor = `rgba(${p.shadowRgb}, 0.55)`;
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 24;
  if (cover) {
    ctx.drawImage(cover, cx, y, cw, ch);
  } else {
    ctx.fillStyle = `rgba(${p.accentRgb}, 0.14)`;
    ctx.fillRect(cx, y, cw, ch);
  }
  ctx.restore();
  ctx.strokeStyle = `rgba(${p.accentRgb}, 0.45)`;
  ctx.lineWidth = 2;
  ctx.strokeRect(cx, y, cw, ch);
  if (!cover) {
    ctx.fillStyle = p.accent;
    ctx.font = `italic ${Math.round(ch * 0.4)}px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((entry.title[0] || '?').toUpperCase(), W / 2, y + ch / 2);
  }
  y += ch + 80;

  // Eyebrow: TYPE · YEAR · SERIES
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `26px ${MONO}`;
  ctx.fillStyle = p.accent;
  const eyebrow = [
    TYPE_LABEL[entry.type],
    entry.year,
    entry.series?.name &&
      `${entry.series.name}${entry.series.position != null ? ` #${entry.series.position}` : ''}`
  ]
    .filter(Boolean)
    .join('  ·  ')
    .toUpperCase();
  setSpacing(ctx, '6px');
  ctx.fillText(clip(ctx, eyebrow, contentW), W / 2, y);
  setSpacing(ctx, '0px');
  y += 40;

  // Title (auto-fit, up to 3 lines)
  const titleFit = fitText({
    text: entry.title,
    maxWidth: contentW,
    maxHeight: Math.max(120, (footerTop - y) * 0.42),
    maxSize: 86,
    minSize: 46,
    lineHeight: 1.12,
    maxLines: 3,
    measure: measurer(ctx, (s) => `${s}px ${SERIF}`)
  });
  ctx.font = `${titleFit.size}px ${SERIF}`;
  ctx.fillStyle = p.heading;
  for (const line of titleFit.lines) {
    y += titleFit.size * 1.12;
    ctx.fillText(line, W / 2, y);
  }

  if (entry.creators?.length) {
    y += 58;
    ctx.font = `italic 40px ${SERIF}`;
    ctx.fillStyle = p.dim;
    ctx.fillText(clip(ctx, entry.creators.slice(0, 2).join(', '), contentW), W / 2, y);
  }

  const rating = normalizeRating(entry.rating);
  if (options.includeRating !== false && rating != null) {
    y += 76;
    drawStars(ctx, W / 2, y - 18, rating, 26, p);
    y += 50;
    ctx.font = `26px ${MONO}`;
    ctx.fillStyle = p.muted;
    const status = statusLabel(entry.status);
    setSpacing(ctx, '4px');
    ctx.fillText([ratingLabel(rating), status].filter(Boolean).join('  ·  ').toUpperCase(), W / 2, y);
    setSpacing(ctx, '0px');
  }

  const notes = entry.notes?.trim();
  if (options.includeNotes && notes) {
    y += 70;
    const room = footerTop - y - 30;
    if (room > 60) {
      const fit = fitText({
        text: notes,
        maxWidth: contentW - 60,
        maxHeight: room,
        maxSize: 36,
        minSize: 28,
        lineHeight: 1.4,
        maxLines: 6,
        measure: measurer(ctx, (s) => `italic ${s}px ${SERIF}`)
      });
      ctx.fillStyle = p.accent;
      ctx.fillRect(pad, y - fit.size, 3, fit.lines.length * fit.size * 1.4);
      ctx.textAlign = 'left';
      ctx.font = `italic ${fit.size}px ${SERIF}`;
      ctx.fillStyle = p.body;
      let ny = y;
      for (const line of fit.lines) {
        ctx.fillText(line, pad + 36, ny);
        ny += fit.size * 1.4;
      }
    }
  }
}

/**
 * Five stars centred on (cx, cy); the last one partially filled for halves.
 * `r` is the outer radius.
 */
function drawStars(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rating: number,
  r: number,
  p: Palette
) {
  const gap = r * 2.5;
  const x0 = cx - gap * 2;
  for (let i = 0; i < 5; i++) {
    const x = x0 + i * gap;
    starPath(ctx, x, cy, r);
    ctx.strokeStyle = `rgba(${p.accentRgb}, 0.7)`;
    ctx.lineWidth = 2;
    ctx.stroke();
    const fill = Math.min(1, Math.max(0, rating - i));
    if (fill > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - r, cy - r, r * 2 * fill, r * 2);
      ctx.clip();
      starPath(ctx, x, cy, r);
      ctx.fillStyle = p.accent;
      ctx.fill();
      ctx.restore();
    }
  }
}

function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

async function loadCover(entry: CatalogEntry) {
  let blob = entry.thumbnailBlob instanceof Blob ? entry.thumbnailBlob : null;
  if (!blob && entry.thumbnailUrl) blob = await fetchThumbBlob(entry.thumbnailUrl);
  if (!blob) return null;
  try {
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}
function measurer(ctx: CanvasRenderingContext2D, font: (size: number) => string): Measure {
  return (text, size) => {
    ctx.font = font(size);
    return ctx.measureText(text).width;
  };
}

/** Single-line text trimmed with an ellipsis to fit `maxWidth` (current font). */
function clip(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const words = wrapLines(text, maxWidth, 1, (t) => ctx.measureText(`${t}…`).width);
  return `${words[0]}…`;
}

/** Canvas letter-spacing where supported (Chromium 99+). */
function setSpacing(ctx: CanvasRenderingContext2D, value: string) {
  if ('letterSpacing' in ctx)
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = value;
}
