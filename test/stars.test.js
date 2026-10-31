import { describe, it, expect } from 'vitest';
import { normalizeRating, starString, ratingLabel, ratingDistribution } from '../src/util/stars.js';

describe('star ratings', () => {
  it('snaps to half-star steps within 0.5–5', () => {
    expect(normalizeRating(3.4)).toBe(3.5);
    expect(normalizeRating(7)).toBe(5);
    expect(normalizeRating(0.1)).toBe(0.5);
    expect(normalizeRating(0)).toBeNull();
    expect(normalizeRating(null)).toBeNull();
    expect(normalizeRating(NaN)).toBeNull();
  });

  it('formats stars and labels, including halves', () => {
    expect(starString(3.5)).toBe('★★★½☆');
    expect(starString(5)).toBe('★★★★★');
    expect(starString(0.5)).toBe('½☆☆☆☆');
    expect(starString(null)).toBe('');
    expect(ratingLabel(4)).toBe('4/5');
    expect(ratingLabel(4.5)).toBe('4.5/5');
  });

  it('bins whole ratings by star, and switches to half-star bins when needed', () => {
    expect(ratingDistribution([5, 4, 4, null])).toEqual([
      { rating: 5, count: 1 }, { rating: 4, count: 2 }, { rating: 3, count: 0 }, { rating: 2, count: 0 }, { rating: 1, count: 0 }
    ]);
    const half = ratingDistribution([4.5, 4.5, 3]);
    expect(half).toHaveLength(10);
    expect(half.find((b) => b.rating === 4.5).count).toBe(2);
    expect(half.find((b) => b.rating === 3).count).toBe(1);
  });
});
