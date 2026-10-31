import { describe, it, expect } from 'vitest';
import { buildWidgetSummary } from '../src/platform/widget';

const e = (over) => ({
  id: Math.random().toString(36), type: 'book', title: 'T', creators: [], status: null,
  dateAdded: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...over
});

describe('buildWidgetSummary', () => {
  it('counts entries by type', () => {
    const s = buildWidgetSummary([e({}), e({ type: 'movie' }), e({ type: 'quote', quoteText: 'q' })], 'dark');
    expect(s.total).toBe(3);
    expect(s.counts).toEqual({ book: 1, movie: 1, tv: 0, quote: 1 });
    expect(s.theme).toBe('dark');
  });

  it('lists up to three in-progress items, most recently touched first, with progress', () => {
    const items = [1, 2, 3, 4].map((n) =>
      e({ title: `B${n}`, status: 'in-progress', updatedAt: `2026-01-0${n}T00:00:00Z`, creators: ['A'], progress: { current: n, total: 4 } })
    );
    const s = buildWidgetSummary([...items, e({ title: 'done', status: 'finished' })], 'light');
    expect(s.inProgress.map((i) => i.title)).toEqual(['B4', 'B3', 'B2']);
    expect(s.inProgress[0]).toEqual({ title: 'B4', creator: 'A', type: 'book', progress: 1 });
    expect(s.inProgress[2].progress).toBe(0.5);
  });

  it('reports null progress when no total is known', () => {
    const s = buildWidgetSummary([e({ status: 'in-progress', progress: { current: 3, total: 0 } })], 'dark');
    expect(s.inProgress[0].progress).toBeNull();
  });

  it('picks the most recently added quote and truncates long ones', () => {
    const s = buildWidgetSummary(
      [
        e({ type: 'quote', quoteText: 'old', dateAdded: '2025-01-01T00:00:00Z' }),
        e({ type: 'quote', quoteText: 'x'.repeat(500), creators: ['Orwell'], dateAdded: '2026-02-01T00:00:00Z' })
      ],
      'dark'
    );
    expect(s.quote.author).toBe('Orwell');
    expect(s.quote.text.length).toBe(240);
    expect(s.quote.text.endsWith('…')).toBe(true);
  });

  it('handles an empty shelf', () => {
    expect(buildWidgetSummary([], 'dark')).toMatchObject({ total: 0, inProgress: [], quote: null });
  });
});
