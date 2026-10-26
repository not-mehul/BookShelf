import { describe, it, expect } from 'vitest';
import { entryToText } from '../src/export/share.js';

describe('entryToText', () => {
  it('formats a quote with its citation', () => {
    const txt = entryToText({
      type: 'quote',
      quoteText: 'All animals are equal.',
      creators: ['George Orwell'],
      source: 'Animal Farm'
    });
    expect(txt).toContain('“All animals are equal.”');
    expect(txt).toContain('— George Orwell, Animal Farm');
  });

  it('formats a rated book with year and stars', () => {
    const txt = entryToText({
      type: 'book',
      title: 'Dune',
      year: 1965,
      creators: ['Frank Herbert'],
      rating: 5,
      summary: 'Spice.'
    });
    expect(txt).toContain('Dune (1965)');
    expect(txt).toContain('Frank Herbert');
    expect(txt).toContain('★★★★★ 5/5');
  });
});
