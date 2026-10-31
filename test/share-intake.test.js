import { describe, it, expect } from 'vitest';
import { parseSharedText } from '../src/util/share-intake.js';

describe('parseSharedText', () => {
  it('splits a reader-app highlight into quote, author, source and link', () => {
    const out = parseSharedText({
      text: '“It is a truth universally acknowledged…”\n\n— Jane Austen, Pride and Prejudice\nhttps://read.example/x'
    });
    expect(out).toEqual({
      quoteText: 'It is a truth universally acknowledged…',
      author: 'Jane Austen',
      source: 'Pride and Prejudice',
      query: 'It is a truth universally acknowledged…',
      link: 'https://read.example/x'
    });
  });

  it('understands "from Book by Author" attributions', () => {
    const out = parseSharedText({ text: 'Fear is the mind-killer.\nfrom Dune by Frank Herbert' });
    expect(out.quoteText).toBe('Fear is the mind-killer.');
    expect(out.source).toBe('Dune');
    expect(out.author).toBe('Frank Herbert');
  });

  it('uses the page title as the search query for a shared link', () => {
    const out = parseSharedText({ subject: 'The Dispossessed', text: 'https://books.example/123' });
    expect(out.query).toBe('The Dispossessed');
    expect(out.quoteText).toBe('');
    expect(out.link).toBe('https://books.example/123');
  });

  it('treats a short single line as a title to search for', () => {
    expect(parseSharedText({ text: 'Blade Runner 2049' }).query).toBe('Blade Runner 2049');
  });

  it('does not use long multi-line text as a search query', () => {
    const out = parseSharedText({ text: 'Line one of a long passage\nline two of the passage' });
    expect(out.query).toBe('');
    expect(out.quoteText).toContain('line two');
  });

  it('does not mistake a lone dash-led line for an attribution', () => {
    expect(parseSharedText({ text: '- a single line' }).author).toBe('');
  });

  it('handles empty input', () => {
    expect(parseSharedText({})).toEqual({ quoteText: '', author: '', source: '', query: '', link: null });
  });
});
