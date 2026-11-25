// The search providers' settings: TMDB for films and shows, Google Books for books.

export type Def = { key: string; label: string; hint: string; type: 'password' | 'url' };
export const TMDB: Def = {
  key: 'tmdb_api_key',
  label: 'API key or read access token',
  hint: 'Free with a TMDB account: themoviedb.org → Settings → API.',
  type: 'password'
};
export const GOOGLE: Def = {
  key: 'google_books_api_key',
  label: 'API key (optional)',
  hint: 'Book search works without one; a key raises the daily limit.',
  type: 'password'
};
