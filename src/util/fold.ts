// Text compared the way people type it: without accents or case, so "amelie"
// finds "Amélie" and "pokemon" finds "Pokémon".

export function foldText(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}
