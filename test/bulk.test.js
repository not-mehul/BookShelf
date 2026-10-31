import { describe, it, expect } from 'vitest';
import { applyTagChanges } from '../src/util/bulk';

describe('applyTagChanges', () => {
  it('adds a tag once, trimming whitespace', () => {
    const e = { tags: ['a'] };
    expect(applyTagChanges(e, { addTag: '  b ' })).toBe(true);
    expect(applyTagChanges(e, { addTag: 'b' })).toBe(false);
    expect(e.tags).toEqual(['a', 'b']);
  });
  it('removes a tag, and copes with entries that have none', () => {
    const e = { tags: ['a', 'b'] };
    expect(applyTagChanges(e, { removeTag: 'a' })).toBe(true);
    expect(e.tags).toEqual(['b']);
    const bare = {};
    expect(applyTagChanges(bare, { removeTag: 'x' })).toBe(false);
    expect(bare.tags).toEqual([]);
  });
  it('treats empty inputs as no change', () => {
    expect(applyTagChanges({ tags: ['a'] }, { addTag: '', removeTag: '' })).toBe(false);
  });
});
