import { describe, it, expect } from 'vitest';
import { looksLikeIsbn } from '../src/api/openlibrary';

describe('looksLikeIsbn', () => {
  it('accepts ISBN-10 and ISBN-13 with or without separators', () => {
    expect(looksLikeIsbn('0451524934')).toBe(true);
    expect(looksLikeIsbn('0-451-52493-4')).toBe(true);
    expect(looksLikeIsbn('9780451524935')).toBe(true);
    expect(looksLikeIsbn('978 0 451 52493 5')).toBe(true);
    expect(looksLikeIsbn('043942089X')).toBe(true);
  });

  it('rejects ordinary titles and short numbers', () => {
    expect(looksLikeIsbn('The Great Gatsby')).toBe(false);
    expect(looksLikeIsbn('1984')).toBe(false);
    expect(looksLikeIsbn('')).toBe(false);
  });
});
