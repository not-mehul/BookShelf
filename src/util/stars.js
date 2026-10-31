// Rating formatting shared by cards, exports, share text and stats.
// Ratings run 0.5–5 in half-star steps (null = unrated).

/** Snap any number to the nearest valid half-star rating (or null). */
export function normalizeRating(/** @type {number | null | undefined} */ value) {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return Math.min(5, Math.max(0.5, Math.round(value * 2) / 2));
}

/**
 * "★★★½☆" — full stars, a "½" for a half, then empty stars.
 * @param {number | null | undefined} rating
 */
export function starString(rating) {
  const r = normalizeRating(rating);
  if (r == null) return '';
  const full = Math.floor(r);
  const half = r - full === 0.5;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(5 - full - (half ? 1 : 0));
}

/** "4.5/5" (whole numbers without ".0"). */
export function ratingLabel(/** @type {number | null | undefined} */ rating) {
  const r = normalizeRating(rating);
  return r == null ? '' : `${r}/5`;
}

/**
 * Rating histogram, highest first. Whole-star bins (5…1) unless any half-star
 * ratings exist, then half-star bins (5, 4.5, … 0.5).
 * @param {(number | null | undefined)[]} ratings
 * @returns {{ rating: number, count: number }[]}
 */
export function ratingDistribution(ratings) {
  const valid = ratings.map(normalizeRating).filter((r) => r != null);
  const halves = valid.some((r) => r % 1 !== 0);
  const step = halves ? 0.5 : 1;
  const bins = [];
  for (let r = 5; r >= step; r -= step) bins.push({ rating: r, count: 0 });
  for (const r of valid) {
    const bin = bins.find((b) => b.rating === (halves ? r : Math.round(r)));
    if (bin) bin.count++;
  }
  return bins;
}
