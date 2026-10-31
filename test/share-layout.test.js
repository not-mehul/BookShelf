import { describe, it, expect } from 'vitest';
import { wrapLines, fitText } from '../src/share/layout';

// Monospace-ish fake: every character is half the font size wide.
const measure = (text, size) => text.length * size * 0.5;

describe('wrapLines', () => {
  it('wraps on word boundaries within the width', () => {
    // 10px font → 5px per char → 50px fits 10 chars
    expect(wrapLines('the quick brown fox jumps', 50, 10, measure)).toEqual(['the quick', 'brown fox', 'jumps']);
  });
  it('keeps explicit newlines and splits over-long words', () => {
    expect(wrapLines('ab\ncd', 100, 10, measure)).toEqual(['ab', 'cd']);
    expect(wrapLines('supercalifragilistic', 50, 10, measure)).toEqual(['supercalif', 'ragilistic']);
  });
});

describe('fitText', () => {
  it('uses the largest size that fits', () => {
    const r = fitText({ text: 'short quote', maxWidth: 600, maxHeight: 200, maxSize: 80, minSize: 20, measure });
    expect(r).toEqual({ size: 80, lines: ['short quote'], truncated: false });
  });
  it('shrinks long text to fit', () => {
    const text = 'All animals are equal, but some animals are more equal than others.';
    const r = fitText({ text, maxWidth: 600, maxHeight: 300, maxSize: 80, minSize: 20, measure });
    expect(r.size).toBeLessThan(80);
    expect(r.lines.length * r.size * 1.25).toBeLessThanOrEqual(300);
    expect(r.truncated).toBe(false);
  });
  it('truncates with an ellipsis when even the minimum size overflows', () => {
    const r = fitText({ text: 'word '.repeat(200), maxWidth: 200, maxHeight: 60, maxSize: 40, minSize: 20, measure });
    expect(r.size).toBe(20);
    expect(r.truncated).toBe(true);
    expect(r.lines.at(-1)?.endsWith('…')).toBe(true);
    expect(r.lines.length * 20 * 1.25).toBeLessThanOrEqual(60);
  });
  it('respects maxLines', () => {
    const r = fitText({ text: 'a b c d e f g h', maxWidth: 10, maxHeight: 1000, maxSize: 20, minSize: 20, maxLines: 2, measure });
    expect(r.lines).toHaveLength(2);
    expect(r.truncated).toBe(true);
  });
});
