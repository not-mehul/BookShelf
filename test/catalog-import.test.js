import { describe, it, expect } from 'vitest';
import {
  parseCsv,
  detectSource,
  fromGoodreads,
  fromStoryGraph,
  fromLetterboxd,
  matchKeys,
  mergeInto
} from '../src/export/catalog-import';

const rows = (text) => {
  const [head, ...body] = parseCsv(text);
  return body.map((cells) => Object.fromEntries(head.map((h, i) => [h, cells[i] ?? ''])));
};

describe('CSV parsing', () => {
  it('handles quotes, doubled quotes, commas and newlines inside fields, CRLF and a BOM', () => {
    const csv = '﻿a,b,c\r\n"x, y","say ""hi""","line\nbreak"\r\n\r\n1,2,3';
    expect(parseCsv(csv)).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'say "hi"', 'line\nbreak'],
      ['1', '2', '3']
    ]);
  });

  it('tells the services apart by their headers', () => {
    expect(detectSource(['Book Id', 'Title', 'My Rating', 'Exclusive Shelf'])).toBe('goodreads');
    expect(detectSource(['Title', 'Authors', 'ISBN/UID', 'Read Status', 'Star Rating'])).toBe('storygraph');
    expect(detectSource(['Date', 'Name', 'Year', 'Letterboxd URI', 'Rating'])).toBe('letterboxd');
    expect(detectSource(['foo', 'bar'])).toBeNull();
  });
});

describe('Goodreads', () => {
  const csv = `Book Id,Title,Author,Additional Authors,ISBN,ISBN13,My Rating,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Exclusive Shelf,My Review
1,"Leviathan Wakes (The Expanse, #1)",James S.A. Corey,,"=""0316129089""","=""9780316129084""",4,561,2011,2011,2024/03/09,2023/12/01,"sci-fi, read",read,"Great.<br/>Really."
2,Dune,Frank Herbert,,"=""""","=""""",0,,1990,1965,,2024/01/05,to-read,to-read,
3,The Silmarillion,J.R.R. Tolkien,,,,0,,,1977,,2024/02/01,"did-not-finish",read,`;
  const entries = fromGoodreads(rows(csv));

  it('maps titles, series, ISBNs, ratings, status and dates', () => {
    const [lw, dune, silm] = entries;
    expect(lw.title).toBe('Leviathan Wakes');
    expect(lw.series).toEqual({ name: 'The Expanse', position: 1 });
    expect(lw.isbn).toBe('9780316129084');
    expect(lw.rating).toBe(4);
    expect(lw.status).toBe('finished');
    expect(lw.finishes).toHaveLength(1);
    expect(new Date(lw.finishes[0]).getDate()).toBe(9);
    expect(lw.pageCount).toBe(561);
    expect(lw.year).toBe(2011);
    expect(lw.tags).toEqual(['sci-fi']);
    expect(lw.notes).toBe('Great.\nReally.');
    expect(dune.status).toBe('want');
    expect(dune.rating).toBeNull();
    expect(dune.isbn).toBeNull();
    expect(dune.year).toBe(1965);
    expect(dune.finishes).toEqual([]);
    expect(dune.dateStarted).toBeNull();
    expect(silm.status).toBe('finished');
  });

  it('keeps the dates from the file instead of stamping today', () => {
    const dune = entries[1];
    expect(new Date(dune.dateAdded).getFullYear()).toBe(2024);
  });
});

describe('StoryGraph', () => {
  const csv = `Title,Authors,Contributors,ISBN/UID,Format,Read Status,Date Added,Last Date Read,Dates Read,Read Count,Moods,Pace,Character- or Plot-Driven?,Strong Character Development?,Loveable Characters?,Diverse Characters?,Flawed Characters?,Star Rating,Review,Content Warnings,Content Warning Description,Tags,Owned?
Piranesi,Susanna Clarke,,9781635575996,digital,read,2024/01/02,2024/02/10,2024/02/01-2024/02/10,1,,,,,,,,4.25,Strange and lovely.,,,"fantasy, mystery",No
Ulysses,James Joyce,,9780199535675,paperback,did-not-finish,2024/03/01,,,0,,,,,,,,,,,,,No`;
  const [piranesi, ulysses] = fromStoryGraph(rows(csv));

  it('keeps quarter-star ratings and the finish date of each read', () => {
    expect(piranesi.rating).toBe(4.25);
    expect(piranesi.status).toBe('finished');
    expect(piranesi.finishes).toHaveLength(1);
    expect(new Date(piranesi.finishes[0]).getDate()).toBe(10);
    expect(piranesi.tags).toEqual(['fantasy', 'mystery']);
    expect(piranesi.creators).toEqual(['Susanna Clarke']);
  });

  it('brings did-not-finish over as Did not finish', () => {
    expect(ulysses.status).toBe('abandoned');
    expect(ulysses.finishes).toEqual([]);
  });
});

describe('Letterboxd', () => {
  const files = [
    {
      name: 'watched.csv',
      rows: rows(
        `Date,Name,Year,Letterboxd URI\n2024-01-01,Alien,1979,https://boxd.it/a\n2024-02-01,Heat,1995,https://boxd.it/h`
      )
    },
    {
      name: 'diary.csv',
      rows: rows(
        `Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2024-01-02,Alien,1979,https://boxd.it/d1,4.5,,horror,2024-01-01\n2024-06-02,Alien,1979,https://boxd.it/d2,5,Yes,,2024-06-01`
      )
    },
    {
      name: 'watchlist.csv',
      rows: rows(`Date,Name,Year,Letterboxd URI\n2024-03-01,Ran,1985,https://boxd.it/r`)
    }
  ];
  const films = fromLetterboxd(files);

  it('folds every file into one entry per film', () => {
    expect(films.map((f) => f.title).sort()).toEqual(['Alien', 'Heat', 'Ran']);
    const alien = films.find((f) => f.title === 'Alien');
    expect(alien.type).toBe('movie');
    expect(alien.status).toBe('finished');
    expect(alien.finishes).toHaveLength(2);
    expect(alien.rating).toBe(5);
    expect(alien.tags).toEqual(['horror']);
    expect(films.find((f) => f.title === 'Ran').status).toBe('want');
    expect(films.find((f) => f.title === 'Heat').finishes).toHaveLength(1);
  });
});

describe('matching the shelf', () => {
  it('matches by ISBN, or by title and surname for books and title and year for films', () => {
    const book = { type: 'book', title: 'Dune!', creators: ['Frank Herbert'], year: 1965, isbn: null };
    expect(matchKeys(book)).toEqual(['book:dune|herbert']);
    expect(matchKeys({ ...book, isbn: '123' })).toContain('isbn:123');
    expect(matchKeys({ type: 'movie', title: 'Alien', creators: [], year: 1979, isbn: null })).toEqual([
      'movie:alien|1979'
    ]);
  });

  it('only fills in what the shelf is missing', () => {
    const existing = {
      rating: 3,
      status: 'finished',
      notes: 'mine',
      finishes: ['2024-01-01T12:00:00.000Z'],
      tags: ['a']
    };
    const changed = mergeInto(existing, {
      rating: 5,
      status: 'want',
      notes: 'theirs',
      pageCount: 300,
      finishes: ['2023-01-01T12:00:00.000Z'],
      tags: ['a', 'b']
    });
    expect(changed).toBe(true);
    expect(existing.rating).toBe(3);
    expect(existing.status).toBe('finished');
    expect(existing.notes).toBe('mine');
    expect(existing.pageCount).toBe(300);
    expect(existing.finishes).toHaveLength(2);
    expect(existing.tags).toEqual(['a', 'b']);
    expect(mergeInto(existing, { rating: 1 })).toBe(false);
  });
});

describe('Letterboxd folders', () => {
  const diary = (name) =>
    rows(
      `Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2024-05-01,${name},1999,https://boxd.it/x,2,,,2024-05-01`
    );

  it('reads only the export’s own files, not deleted/, orphaned/, likes/ or lists/', () => {
    const films = fromLetterboxd([
      { name: 'letterboxd-me-2026/diary.csv', rows: diary('Kept') },
      { name: 'letterboxd-me-2026/deleted/diary.csv', rows: diary('Deleted') },
      { name: 'orphaned/diary.csv', rows: diary('Orphaned') },
      { name: 'likes/films.csv', rows: diary('Liked') },
      { name: 'lists/watched.csv', rows: diary('A list named watched') }
    ]);
    expect(films.map((f) => f.title)).toEqual(['Kept']);
  });
});

describe('merging an import into the shelf', () => {
  it('treats a finish on a day already finished in the app as the same finish', () => {
    // Finished in the app at 5:40 pm; the export has that day (at local noon).
    const existing = { status: 'finished', finishes: [new Date(2025, 2, 9, 17, 40).toISOString()], tags: [] };
    const [incoming] = fromGoodreads([
      { Title: 'T', Author: 'X', 'Exclusive Shelf': 'read', 'Date Read': '2025/03/09' }
    ]);
    expect(mergeInto(existing, incoming)).toBe(false);
    expect(existing.finishes).toHaveLength(1);
  });

  it('moves a wishlist entry the export says was read to Completed, with the export’s date', () => {
    const existing = { status: 'want', queueRank: 3, finishes: [], tags: [] };
    const [incoming] = fromGoodreads([
      { Title: 'T', Author: 'X', 'Exclusive Shelf': 'read', 'Date Read': '2025/03/09' }
    ]);
    expect(mergeInto(existing, incoming)).toBe(true);
    expect(existing.status).toBe('finished');
    expect(existing.queueRank).toBeNull();
    expect(existing.finishes).toEqual([new Date(2025, 2, 9, 12).toISOString()]);
  });

  it('leaves a wishlist entry alone when the export also has it to read', () => {
    const existing = { status: 'want', queueRank: 3, finishes: [], tags: [] };
    const [incoming] = fromGoodreads([{ Title: 'T', Author: 'X', 'Exclusive Shelf': 'to-read' }]);
    expect(mergeInto(existing, incoming)).toBe(false);
    expect(existing.status).toBe('want');
  });
});

describe('dates in an export', () => {
  it('leaves out a date that does not exist instead of rolling it over', () => {
    const [e] = fromGoodreads([{ Title: 'T', 'Exclusive Shelf': 'read', 'Date Read': '2025/02/31' }]);
    expect(e.finishes).toEqual([]);
  });
});
