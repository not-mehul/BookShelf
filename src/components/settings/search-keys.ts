// The search providers' settings: TMDB for films and shows, Google Books for books.

import { checkGoogleBooksKey } from '../../api/books';
import type { KeyCheck } from '../../api/key-check';
import { checkTmdbKey } from '../../api/tmdb';

export type Def = {
  key: string;
  label: string;
  hint: string;
  type: 'password';
  /** Tries a newly entered key. */
  check: (value: string) => Promise<KeyCheck>;
  /** Said under the box once the key works. */
  works: string;
};
export const TMDB: Def = {
  key: 'tmdb_api_key',
  label: 'API key or read access token',
  hint: 'Free with a TMDB account: themoviedb.org → Settings → API.',
  type: 'password',
  check: checkTmdbKey,
  works: 'The key works: films and shows search TMDB.'
};
export const GOOGLE: Def = {
  key: 'google_books_api_key',
  label: 'API key (optional)',
  hint: 'Book search works without one; a key raises the daily limit.',
  type: 'password',
  check: checkGoogleBooksKey,
  works: 'The key works: book search uses your own daily limit.'
};
