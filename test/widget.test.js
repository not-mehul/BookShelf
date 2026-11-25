import { describe, it, expect } from 'vitest';
import { buildWidgetSummary } from '../src/platform/widget';

const e = (over) => ({
  id: Math.random().toString(36),
  type: 'book',
  title: 'T',
  creators: [],
  status: null,
  dateAdded: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over
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
      e({
        type: 'tv',
        title: `B${n}`,
        status: 'in-progress',
        updatedAt: `2026-01-0${n}T00:00:00Z`,
        creators: ['A'],
        progress: { current: n, total: 4 }
      })
    );
    const s = buildWidgetSummary([...items, e({ title: 'done', status: 'finished' })], 'light');
    expect(s.inProgress.map((i) => i.title)).toEqual(['B4', 'B3', 'B2']);
    expect(s.inProgress[0]).toMatchObject({ title: 'B4', creator: 'A', type: 'tv', progress: 1, next: [] });
    expect(s.inProgress[2].progress).toBe(0.5);
  });

  it('reports no progress for books, which no longer track pages', () => {
    const s = buildWidgetSummary([e({ status: 'in-progress', progress: { current: 3, total: 9 } })], 'dark');
    expect(s.inProgress[0].progress).toBeNull();
  });

  it('reports null progress when no total is known', () => {
    const s = buildWidgetSummary([e({ status: 'in-progress', progress: { current: 3, total: 0 } })], 'dark');
    expect(s.inProgress[0].progress).toBeNull();
  });

  it('picks the most recently added quote and truncates long ones', () => {
    const s = buildWidgetSummary(
      [
        e({ type: 'quote', quoteText: 'old', dateAdded: '2025-01-01T00:00:00Z' }),
        e({
          type: 'quote',
          quoteText: 'x'.repeat(500),
          creators: ['Orwell'],
          dateAdded: '2026-02-01T00:00:00Z'
        })
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

describe('the widget’s next episodes', () => {
  it('lists the next aired, unwatched episodes of a show in order', async () => {
    const { nextEpisodes } = await import('../src/platform/widget');
    const show = e({
      type: 'tv',
      status: 'in-progress',
      watchedEpisodes: [1],
      episodeGuide: {
        fetchedAt: '2026-01-01T00:00:00Z',
        episodes: [
          { id: 3, s: 2, e: 1, name: '', aired: '2026-01-10' },
          { id: 1, s: 1, e: 1, name: '', aired: '2025-01-01' },
          { id: 2, s: 1, e: 2, name: '', aired: '2025-01-08' },
          { id: 9, s: 0, e: 1, name: 'Special', aired: '2025-02-01' },
          { id: 4, s: 2, e: 2, name: '', aired: '2099-01-01' }
        ]
      }
    });
    expect(nextEpisodes(show, '2026-02-01')).toEqual([
      { id: 2, label: 'S1 E2' },
      { id: 3, label: 'S2 E1' }
    ]);
    const summary = buildWidgetSummary([show], 'dark');
    expect(summary.inProgress[0].id).toBe(show.id);
    expect(summary.inProgress[0].next.length).toBeGreaterThan(0);
  });
});
