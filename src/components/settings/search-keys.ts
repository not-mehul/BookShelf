// The search providers' settings: TheTVDB for films and shows, Google Books for books.

export type Def = { key: string; label: string; hint: string; type: 'password' | 'url' };
export const TVDB: Def[] = [
  {
    key: 'tvdb_api_key',
    label: 'API key',
    hint: 'Your project key from thetvdb.com.',
    type: 'password'
  },
  {
    key: 'tvdb_pin',
    label: 'Subscriber PIN',
    hint: 'Only for keys funded by subscriber PINs.',
    type: 'password'
  },
  {
    key: 'tvdb_proxy_url',
    label: 'Proxy URL (optional)',
    hint: 'A BookShelf proxy you run, instead of a key on this phone.',
    type: 'url'
  },
  {
    key: 'tvdb_proxy_token',
    label: 'Proxy access token',
    hint: 'Only if your proxy asks for one.',
    type: 'password'
  }
];
export const GOOGLE: Def = {
  key: 'google_books_api_key',
  label: 'API key (optional)',
  hint: 'Book search works without one; a key raises the daily limit.',
  type: 'password'
};
