import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../src/export/import.js';

const SAMPLE = `# My Catalog

_Exported 2026-01-01 — 3 entries_

## Books (1)

### Dune (1965) — ★★★★★ **5/5**

*Frank Herbert*

**Genres:** Science Fiction, Adventure

**Status:** finished

A desert planet and its spice.

> Loved the worldbuilding.

_Added 2025-12-30 · rated 2025-12-31_

---

## Movies (1)

### Blade Runner (1982) — ★★★★☆ **4/5**

*Ridley Scott*

Replicants in the rain.

_Added 2025-11-15_

---

## Quotes (1)

> All animals are equal.
>
> — George Orwell, Animal Farm

★★★★★ **5/5**

_Added 2025-10-01_

---
`;

describe('parseMarkdown', () => {
  it('parses books, movies, and quotes from an export', async () => {
    const entries = await parseMarkdown(SAMPLE);
    const byType = Object.fromEntries(entries.map((e) => [e.type, e]));

    expect(entries).toHaveLength(3);

    expect(byType.book).toMatchObject({
      title: 'Dune',
      year: 1965,
      rating: 5,
      creators: ['Frank Herbert'],
      status: 'finished'
    });
    expect(byType.book.genres).toEqual(['Science Fiction', 'Adventure']);
    expect(byType.book.notes).toContain('Loved the worldbuilding');

    expect(byType.movie).toMatchObject({ title: 'Blade Runner', year: 1982, rating: 4 });

    expect(byType.quote).toMatchObject({ type: 'quote', rating: 5 });
    expect(byType.quote.quoteText).toContain('All animals are equal');
    expect(byType.quote.creators).toEqual(['George Orwell']);
    expect(byType.quote.source).toBe('Animal Farm');
  });

  it('assigns a distinct id to every parsed entry', async () => {
    const entries = await parseMarkdown(SAMPLE);
    const ids = new Set(entries.map((e) => e.id));
    expect(ids.size).toBe(entries.length);
  });
});
