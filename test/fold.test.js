import { describe, it, expect } from 'vitest';
import { foldText } from '../src/util/fold';
import { matchEntries } from '../src/util/entry-match';
import { newEntry } from '../src/util/new-entry';

describe('accent-blind matching', () => {
  it('folds accents and case', () => {
    expect(foldText('Amélie')).toBe('amelie');
    expect(foldText('POKÉMON')).toBe('pokemon');
    expect(foldText('Ångström')).toBe('angstrom');
  });

  it('finds an accented title from plain typing', () => {
    const shelf = [newEntry('movie', { title: 'Amélie' }), newEntry('book', { title: 'Middlemarch' })];
    expect(matchEntries(shelf, 'amel').map((e) => e.title)).toEqual(['Amélie']);
  });
});
