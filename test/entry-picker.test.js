import { describe, it, expect } from 'vitest';
import { matchEntries, findEntryByTitle } from '../src/util/entry-match';

const shelf = [
  { id: '1', type: 'book', title: 'Dune', creators: ['Frank Herbert'] },
  { id: '2', type: 'book', title: 'Dune Messiah', creators: ['Frank Herbert'] },
  { id: '3', type: 'movie', title: 'Dune: Part Two', creators: ['Denis Villeneuve'] },
  { id: '4', type: 'book', title: 'The Left Hand of Darkness', creators: ['Ursula K. Le Guin'] },
  { id: '5', type: 'quote', title: 'Dune quote', creators: [] }
];

describe('matchEntries', () => {
  it('matches titles (prefix first) and creators, never quotes', () => {
    expect(matchEntries(shelf, 'dune').map((e) => e.id)).toEqual(['1', '2', '3']); // prefix ties: alphabetical
    expect(matchEntries(shelf, 'messiah').map((e) => e.id)).toEqual(['2']); // substring
    expect(matchEntries(shelf, 'le guin').map((e) => e.id)).toEqual(['4']);
    expect(matchEntries(shelf, 'quote')).toEqual([]);
    expect(matchEntries(shelf, '  ')).toEqual([]);
  });
  it('respects the limit', () => {
    expect(matchEntries(shelf, 'd', 2)).toHaveLength(2);
  });
});

describe('findEntryByTitle', () => {
  it('matches ignoring case, punctuation and a leading article', () => {
    expect(findEntryByTitle(shelf, 'left hand of darkness')?.id).toBe('4');
    expect(findEntryByTitle(shelf, 'DUNE')?.id).toBe('1');
  });
  it('returns null when nothing or more than one entry matches', () => {
    expect(findEntryByTitle(shelf, 'Neuromancer')).toBeNull();
    expect(findEntryByTitle([...shelf, { id: '9', type: 'movie', title: 'Dune', creators: [] }], 'Dune')).toBeNull();
    expect(findEntryByTitle(shelf, '')).toBeNull();
  });
});
