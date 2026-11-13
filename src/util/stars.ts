// Rating formatting shared by cards, exports, share text and stats.
//
// A rating is stored as 0.25–5 (null = unrated), in quarter-star steps: a
// half point on a ten-point scale. People who think in stars see stars and
// "4.5/5"; with "Rate out of 10" on, the same rating reads "9/10" and the
// control takes half points, so 7.5/10 is a rating of its own. Stars on cards
// round to the nearest half, since a quarter of a star can't be drawn in text.

export type RatingScale = 5 | 10;

const SCALE_KEY = 'bookshelf:rating_scale';
let scale: RatingScale = readScale();

function readScale(): RatingScale {
  try {
    return globalThis.localStorage?.getItem(SCALE_KEY) === '10' ? 10 : 5;
  } catch {
    return 5;
  }
}

/** How ratings are shown and entered: out of 5 stars, or out of 10. */
export function ratingScale(): RatingScale {
  return scale;
}

export function setRatingScale(next: RatingScale) {
  scale = next;
  try {
    globalThis.localStorage?.setItem(SCALE_KEY, String(next));
  } catch {
    // Kept for this session only.
  }
}

/** Snap any number to the nearest valid rating (quarter-star steps), or null. */
export function normalizeRating(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return Math.min(5, Math.max(0.25, Math.round(value * 4) / 4));
}

/** The nearest half star, for drawing. */
const toHalf = (r: number) => Math.max(0.5, Math.round(r * 2) / 2);

/**
 * "★★★½☆" — full stars, a "½" for a half, then empty stars.
 */
export function starString(rating: number | null | undefined) {
  const n = normalizeRating(rating);
  if (n == null) return '';
  const r = toHalf(n);
  const full = Math.floor(r);
  const half = r - full === 0.5;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(5 - full - (half ? 1 : 0));
}

/** A rating as a number on a scale: 3.75 → "7.5" out of 10, "3.75" out of 5. */
export function ratingValue(rating: number, on: RatingScale = scale) {
  return String(Math.round(rating * (on / 5) * 100) / 100);
}

/** "4.5/5" or "9/10" (whole numbers without ".0"). */
export function ratingLabel(rating: number | null | undefined, on: RatingScale = scale) {
  const r = normalizeRating(rating);
  return r == null ? '' : `${ratingValue(r, on)}/${on}`;
}

/** "4.5/5" or "7.5/10" read back from text (Markdown, a pasted label) into a stored rating. */
export function parseRatingLabel(text: string): number | null {
  const m = /(\d+(?:\.\d+)?)\s*\/\s*(5|10)\b/.exec(text);
  if (!m) return null;
  return normalizeRating(Number(m[1]) / (Number(m[2]) / 5));
}

/**
 * Rating histogram, highest first. Whole-point bins unless any rating falls
 * between them, then half-point bins. Out of 5 that is 5…1 or 5, 4.5…0.5;
 * out of 10 it is 10…1 or 10, 9.5…0.5. `rating` is the bin on the shown scale.
 */
export function ratingDistribution(
  ratings: (number | null | undefined)[],
  on: RatingScale = scale
): { rating: number; count: number }[] {
  const shown = ratings
    .map(normalizeRating)
    .filter((r) => r != null)
    .map((r) => Math.max(0.5, Math.round(r * (on / 5) * 2) / 2));
  const halves = shown.some((r) => r % 1 !== 0);
  const step = halves ? 0.5 : 1;
  const bins = [];
  for (let r = on; r >= step; r -= step) bins.push({ rating: r, count: 0 });
  for (const r of shown) {
    const bin = bins.find((b) => b.rating === (halves ? r : Math.round(r)));
    if (bin) bin.count++;
  }
  return bins;
}

/** A rating as cards show it: stars out of 5, the number out of 10. */
export function ratingBrief(rating: number | null | undefined, on: RatingScale = scale) {
  return on === 10 ? ratingLabel(rating, 10) : starString(rating);
}
