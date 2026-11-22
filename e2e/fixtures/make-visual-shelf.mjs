// Builds visual-shelf.json, the shelf the screenshot tests import: the e2e
// shelf plus fifteen books, films and shows and two quotes, with plain
// geometric covers (no text, so no font differences between machines).
// Run with: node e2e/fixtures/make-visual-shelf.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('.', import.meta.url);
const base = JSON.parse(readFileSync(new URL('shelf.json', dir), 'utf8'));
const palette = [
  ['#2b4c7e', '#e8d8b0'],
  ['#7a2e2e', '#f2e3c6'],
  ['#1f5e4a', '#e9f0e6'],
  ['#3d2b56', '#f0d9a8'],
  ['#c06b2c', '#1d1d1d'],
  ['#22313f', '#d8c3a5'],
  ['#5b6b2f', '#f4ecd8'],
  ['#8c1c3a', '#f7e7ce']
];
const cover = (i) => {
  const [bg, fg] = palette[i % palette.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><rect width="300" height="450" fill="${bg}"/><rect x="18" y="18" width="264" height="414" fill="none" stroke="${fg}" stroke-width="2" opacity=".5"/><rect x="48" y="150" width="204" height="10" fill="${fg}" opacity=".8"/><rect x="78" y="176" width="144" height="6" fill="${fg}" opacity=".6"/><circle cx="150" cy="320" r="28" fill="none" stroke="${fg}" stroke-width="2" opacity=".7"/></svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
};
const day = (m, d) => new Date(Date.UTC(2026, m, d, 18)).toISOString();
const stamp = '2026-11-20T18:00:00.000Z';
const items = [
  [
    'b1',
    'book',
    'Piranesi',
    'Susanna Clarke',
    2020,
    'finished',
    5,
    [day(0, 14)],
    ['fantasy', 'favourites'],
    272
  ],
  [
    'b2',
    'book',
    'The Remains of the Day',
    'Kazuo Ishiguro',
    1989,
    'finished',
    4.5,
    [day(1, 2)],
    ['literary'],
    258
  ],
  ['b3', 'book', 'Project Hail Mary', 'Andy Weir', 2021, 'finished', 4, [day(2, 20)], ['sci-fi'], 496],
  [
    'b4',
    'book',
    'Tomorrow, and Tomorrow, and Tomorrow',
    'Gabrielle Zevin',
    2022,
    'in-progress',
    null,
    [],
    ['literary'],
    416
  ],
  ['b5', 'book', 'The Overstory', 'Richard Powers', 2018, 'abandoned', 2.5, [], [], 502],
  [
    'b6',
    'book',
    'A Wizard of Earthsea',
    'Ursula K. Le Guin',
    1968,
    'finished',
    4.5,
    [day(4, 3)],
    ['fantasy', 'earthsea'],
    183
  ],
  [
    'b7',
    'book',
    'The Tombs of Atuan',
    'Ursula K. Le Guin',
    1970,
    'want',
    null,
    [],
    ['fantasy', 'earthsea'],
    180
  ],
  [
    'b8',
    'book',
    'Klara and the Sun',
    'Kazuo Ishiguro',
    2021,
    'finished',
    3.5,
    [day(6, 9)],
    ['literary', 'sci-fi'],
    303
  ],
  ['m1', 'movie', 'Past Lives', 'Celine Song', 2023, 'finished', 4.5, [day(2, 1)], [], null],
  ['m2', 'movie', 'Dune: Part Two', 'Denis Villeneuve', 2024, 'finished', 4, [day(3, 12)], ['sci-fi'], null],
  ['m3', 'movie', 'Perfect Days', 'Wim Wenders', 2023, 'finished', 5, [day(7, 22)], ['favourites'], null],
  ['m4', 'movie', 'The Zone of Interest', 'Jonathan Glazer', 2023, 'want', null, [], [], null],
  ['t1', 'tv', 'Slow Horses', 'Will Smith', 2022, 'in-progress', 4, [], ['spy'], null],
  ['t2', 'tv', 'The Bear', 'Christopher Storer', 2022, 'finished', 4.5, [day(8, 30)], [], null],
  ['t3', 'tv', 'Shōgun', 'Rachel Kondo', 2024, 'want', null, [], [], null]
];
const entries = items.map(([id, type, title, author, year, status, rating, finishes, tags, pages], i) => ({
  id,
  type,
  title,
  creators: [author],
  year,
  status,
  rating,
  finishes,
  tags,
  summary: `A stand-in synopsis for ${title}, long enough to wrap across a few lines on a phone, so the layout is judged with real-looking text in place.`,
  genres: type === 'book' ? ['Fiction'] : ['Drama'],
  notes: '',
  sourceId: null,
  thumbnailUrl: null,
  thumbnailData: i % 5 === 4 ? null : cover(i),
  dateAdded: day(finishes[0] ? new Date(finishes[0]).getUTCMonth() : 9, 1),
  dateRated: rating ? finishes[0] || day(9, 1) : null,
  ...(status === 'in-progress' ? { dateStarted: day(10, 1) } : {}),
  ...(pages
    ? { pageCount: pages, ...(status === 'in-progress' ? { progress: { current: 120, total: pages } } : {}) }
    : {}),
  updatedAt: stamp
}));
const quotes = [
  ['q2', 'The Beauty of the House is immeasurable; its Kindness infinite.', 'Susanna Clarke', 'Piranesi']
].map(([id, text, author, source]) => ({
  id,
  type: 'quote',
  title: text,
  quoteText: text,
  creators: [author],
  source,
  rating: null,
  notes: '',
  tags: [],
  genres: [],
  summary: '',
  year: null,
  sourceId: null,
  thumbnailUrl: null,
  dateAdded: day(5, 5),
  dateRated: null,
  updatedAt: stamp
}));
base.entries.push(...entries, ...quotes);
writeFileSync(new URL('visual-shelf.json', dir), JSON.stringify(base, null, 2) + '\n');
console.log(`${base.entries.length} entries`);
