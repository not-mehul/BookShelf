import { describe, it, expect } from 'vitest';
import { dropRetired, dropRetiredSettings } from '../src/util/retired';

describe('retired fields', () => {
  it("drops a book's page progress and keeps a show's", () => {
    expect(dropRetired({ type: 'book', title: 'Dune', progress: { current: 40, total: 400 } })).toEqual({
      type: 'book',
      title: 'Dune'
    });
    const show = { type: 'tv', title: 'Severance', progress: { current: 9, total: 19 } };
    expect(dropRetired({ ...show })).toEqual(show);
  });

  it('removes saved reading goals and nothing else', () => {
    const data = new Map([
      ['bookshelf:reading_goal_2025', '24'],
      ['bookshelf:reading_goal_2026', '30'],
      ['bookshelf:theme', 'light']
    ]);
    const storage = {
      get length() {
        return data.size;
      },
      key: (i) => [...data.keys()][i] ?? null,
      removeItem: (k) => data.delete(k)
    };
    dropRetiredSettings(storage);
    expect([...data.keys()]).toEqual(['bookshelf:theme']);
  });
});
