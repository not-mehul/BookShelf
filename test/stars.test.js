import { describe, it, expect } from 'vitest';
import {
  normalizeRating,
  starString,
  ratingLabel,
  ratingDistribution,
  parseRatingLabel,
  ratingBrief
} from '../src/util/stars';

describe('star ratings', () => {
  it('snaps to quarter-star steps (half points out of 10) within 0.25–5', () => {
    expect(normalizeRating(3.4)).toBe(3.5);
    expect(normalizeRating(3.8)).toBe(3.75);
    expect(normalizeRating(7)).toBe(5);
    expect(normalizeRating(0.1)).toBe(0.25);
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
      { rating: 5, count: 1 },
      { rating: 4, count: 2 },
      { rating: 3, count: 0 },
      { rating: 2, count: 0 },
      { rating: 1, count: 0 }
    ]);
    const half = ratingDistribution([4.5, 4.5, 3]);
    expect(half).toHaveLength(10);
    expect(half.find((b) => b.rating === 4.5).count).toBe(2);
    expect(half.find((b) => b.rating === 3).count).toBe(1);
  });

  it('draws quarter ratings as the nearest half star', () => {
    expect(starString(3.75)).toBe('★★★★☆');
    expect(starString(3.25)).toBe('★★★½☆');
    expect(starString(0.25)).toBe('½☆☆☆☆');
  });

  it('reads and writes ratings out of 10', () => {
    expect(ratingLabel(3.75, 10)).toBe('7.5/10');
    expect(ratingLabel(4, 10)).toBe('8/10');
    expect(ratingLabel(3.75, 5)).toBe('3.75/5');
    expect(ratingBrief(3.75, 10)).toBe('7.5/10');
    expect(ratingBrief(3.5, 5)).toBe('★★★½☆');
    expect(parseRatingLabel('★★★½☆ **3.5/5**')).toBe(3.5);
    expect(parseRatingLabel('7.5/10')).toBe(3.75);
    expect(parseRatingLabel('3.75/5')).toBe(3.75);
    expect(parseRatingLabel('no rating')).toBeNull();
  });

  it('bins out of 10 on the ten-point scale', () => {
    const bins = ratingDistribution([3.75, 4, 4], 10);
    expect(bins[0].rating).toBe(10);
    expect(bins.find((b) => b.rating === 7.5).count).toBe(1);
    expect(bins.find((b) => b.rating === 8).count).toBe(2);
  });
});
