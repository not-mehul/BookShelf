// Render share cards (quote / book / film / show) to a canvas, in the app's
// Dusk or Dawn palette. Colours are read from tokens.css via a probe element,
// so the cards always match the app.

import { fitText, wrapLines, FORMATS } from './layout.js';
import { fetchThumbBlob } from '../util/thumbs.js';
import { normalizeRating, ratingLabel } from '../util/stars.js';
import { statusLabel } from '../util/status.js';

/** @typedef {import('../types').CatalogEntry} CatalogEntry */
/**
 * @typedef {object} CardOptions
 * @property {'dark' | 'light'} theme
 * @property {keyof typeof FORMATS} format
 * @property {boolean} [includeRating]
 * @property {boolean} [includeNotes]
 */

const SERIF = '"Iowan Old Style", "Apple Garamond", Baskerville, Georgia, "Noto Serif", serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, "Roboto Mono", monospace';
const TYPE_LABEL = { book: 'Book', movie: 'Film', tv: 'TV Show', quote: 'Quote' };

/** @param {'dark' | 'light'} theme */
export function readPalette(theme) {
  const probe = document.createElement('div');
  probe.dataset.theme = theme;
  probe.hidden = true;
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const v = (/** @type {string} */ name) => cs.getPropertyValue(name).trim();
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

/**
 * @param {CatalogEntry} entry
 * @param {CardOptions} options
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderCard(entry, options) {
  const { width: W, height: H } = FORMATS[options.format] || FORMATS.post;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const p = readPalette(options.theme);
  await document.fonts?.ready;

  drawBackground(ctx, W, H, p);
  if (entry.type === 'quote') drawQuote(ctx, entry, W, H, p);
  else await drawEntry(ctx, entry, W, H, p, options);
  drawWordmark(ctx, W, H, p);
  return canvas;
}

/** @param {HTMLCanvasElement} canvas @returns {Promise<Blob>} */
export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not render the image.'))), 'image/png')
  );
}

// ── Pieces ─────────────────────────────────────────────────────

/** @typedef {ReturnType<typeof readPalette>} Palette */

/** @param {CanvasRenderingContext2D} ctx @param {number} W @param {number} H @param {Palette} p */
function drawBackground(ctx, W, H, p) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, p.top);
  bg.addColorStop(0.5, p.mid);
  bg.addColorStop(1, p.bottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.2, H * 0.12, 0, W * 0.2, H * 0.12, W * 0.9);
  glow.addColorStop(0, `rgba(${p.accentRgb}, 0.16)`);
  glow.addColorStop(1, `rgba(${p.accentRgb}, 0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Frame + corner brackets, echoing the app's modal cards.
  ctx.strokeStyle = `rgba(${p.accentRgb}, 0.32)`;
  ctx.lineWidth = 2;
  ctx.strokeRect(44, 44, W - 88, H - 88);
  ctx.strokeStyle = `rgba(${p.accentRgb}, 0.8)`;
  ctx.lineWidth = 3;
  const b = 64;
  const len = 54;
  ctx.beginPath();
  ctx.moveTo(b, b + len); ctx.lineTo(b, b); ctx.lineTo(b + len, b);
  ctx.moveTo(W - b, H - b - len); ctx.lineTo(W - b, H - b); ctx.lineTo(W - b - len, H - b);
  ctx.stroke();
}

/** @param {CanvasRenderingContext2D} ctx @param {number} W @param {number} H @param {Palette} p */
function drawWordmark(ctx, W, H, p) {
  ctx.textBaseline = 'alphabetic';
  ctx.font = `44px ${SERIF}`;
  const book = 'Book';
  ctx.font = `italic 44px ${SERIF}`;
  const shelfW = ctx.measureText('Shelf').width;
  ctx.font = `44px ${SERIF}`;
  const bookW = ctx.measureText(book).width;
  const x = (W - bookW - shelfW) / 2;
  const y = H - 104;
  ctx.textAlign = 'left';
  ctx.fillStyle = p.heading;
  ctx.fillText(book, x, y);
  ctx.font = `italic 44px ${SERIF}`;
  ctx.fillStyle = p.accent;
  ctx.fillText('Shelf', x + bookW, y);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {CatalogEntry} entry
 * @param {number} W @param {number} H @param {Palette} p
 */
function drawQuote(ctx, entry, W, H, p) {
  const pad = 130;
  ctx.fillStyle = `rgba(${p.accentRgb}, 0.9)`;
  ctx.font = `260px ${SERIF}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('“', pad - 20, pad + 210);

  const top = pad + 250;
  const bottom = H - 330;
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

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {CatalogEntry} entry
 * @param {number} W @param {number} H @param {Palette} p
 * @param {CardOptions} options
 */
async function drawEntry(ctx, entry, W, H, p, options) {
  const pad = 120;
  const contentW = W - pad * 2;
  const footerTop = H - 170;
  let y = pad + 40;

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
  const eyebrow = [TYPE_LABEL[entry.type], entry.year, entry.series?.name && `${entry.series.name}${entry.series.position != null ? ` #${entry.series.position}` : ''}`]
    .filter(Boolean).join('  ·  ').toUpperCase();
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
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx @param {number} cy @param {number} rating
 * @param {number} r Outer radius. @param {Palette} p
 */
function drawStars(ctx, cx, cy, rating, r, p) {
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

/** @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} cy @param {number} r */
function starPath(ctx, cx, cy, r) {
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

/** @param {CatalogEntry} entry */
async function loadCover(entry) {
  let blob = entry.thumbnailBlob instanceof Blob ? entry.thumbnailBlob : null;
  if (!blob && entry.thumbnailUrl) blob = await fetchThumbBlob(entry.thumbnailUrl);
  if (!blob) return null;
  try {
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {(size: number) => string} font
 * @returns {import('./layout.js').Measure}
 */
function measurer(ctx, font) {
  return (text, size) => {
    ctx.font = font(size);
    return ctx.measureText(text).width;
  };
}

/** Single-line text trimmed with an ellipsis to fit `maxWidth` (current font). */
function clip(/** @type {CanvasRenderingContext2D} */ ctx, /** @type {string} */ text, /** @type {number} */ maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const words = wrapLines(text, maxWidth, 1, (t) => ctx.measureText(`${t}…`).width);
  return `${words[0]}…`;
}

/** Canvas letter-spacing where supported (Chromium 99+). */
function setSpacing(/** @type {CanvasRenderingContext2D} */ ctx, /** @type {string} */ value) {
  if ('letterSpacing' in ctx) /** @type {any} */ (ctx).letterSpacing = value;
}
