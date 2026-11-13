// Bringing a shelf over from Goodreads, StoryGraph or Letterboxd. Each one
// exports a CSV (Letterboxd a zip of them); the file is read on the device,
// matched against what is already on the shelf, and saved. Nothing is looked
// up online, so a big export imports in seconds and offline; covers fill in
// later from each entry's page, as for a hand-added entry.

import { unzipSync, strFromU8 } from 'fflate';
import { listEntries, saveEntry } from '../db/database';
import { newEntry } from '../util/new-entry';
import { normalizeRating } from '../util/stars';
import type { CatalogEntry, EntryStatus } from '../types';

export type CatalogSource = 'goodreads' | 'storygraph' | 'letterboxd';

/** RFC 4180: quoted fields, doubled quotes, newlines inside quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

type Row = Record<string, string>;

function records(text: string): { headers: string[]; rows: Row[] } {
  const [head, ...body] = parseCsv(text);
  const headers = (head ?? []).map((h) => h.trim());
  return {
    headers,
    rows: body.map((cells) => Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? '').trim()])))
  };
}

/** Which service wrote a CSV, from its header row. */
export function detectSource(headers: readonly string[]): CatalogSource | null {
  const has = (h: string) => headers.includes(h);
  if (has('Exclusive Shelf') || has('My Rating')) return 'goodreads';
  if (has('Read Status') && (has('Star Rating') || has('ISBN/UID'))) return 'storygraph';
  if (has('Letterboxd URI')) return 'letterboxd';
  return null;
}

/** "2024/03/09" or "2024-03-09" → an ISO time at local noon, so it stays on that day anywhere. */
function day(text: string | undefined): string | null {
  const m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.exec(text ?? '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Goodreads wraps ISBNs as ="0123456789" so spreadsheets keep the zeros. */
const isbnOf = (text: string | undefined) => (text ?? '').replace(/[^0-9Xx]/g, '').toUpperCase() || null;

const splitList = (text: string | undefined) =>
  (text ?? '')
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);

const yearOf = (text: string | undefined) => {
  const n = parseInt(text ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const statusOf = (shelf: string): EntryStatus | null => {
  const s = shelf.toLowerCase();
  if (s === 'read') return 'finished';
  if (s === 'currently-reading') return 'in-progress';
  if (s === 'to-read') return 'want';
  if (s === 'did-not-finish' || s === 'dnf' || s === 'abandoned') return 'abandoned';
  return null;
};

/** An entry whose journal is the file's, not today's: created unstatused, then filled in. */
function imported(
  type: CatalogEntry['type'],
  fields: Partial<CatalogEntry> & { title: string }
): CatalogEntry {
  const { status = null, ...rest } = fields;
  return Object.assign(newEntry(type, { title: rest.title }), {
    dateStarted: null,
    finishes: [],
    ...rest,
    status
  });
}

const book = (fields: Partial<CatalogEntry> & { title: string }) => imported('book', fields);

export function fromGoodreads(rows: readonly Row[]): CatalogEntry[] {
  return rows
    .filter((r) => r['Title'])
    .map((r) => {
      const shelves = splitList(r['Bookshelves']);
      const exclusive = r['Exclusive Shelf'] ?? '';
      const status =
        statusOf(exclusive) ?? (shelves.some((s) => statusOf(s) === 'abandoned') ? 'abandoned' : null);
      const read = day(r['Date Read']);
      const rating = Number(r['My Rating']);
      const authors = [r['Author'] ?? '', ...splitList(r['Additional Authors'])].filter(Boolean);
      const pages = parseInt(r['Number of Pages'] ?? '', 10);
      const tags = shelves.filter(
        (s) => !['read', 'to-read', 'currently-reading'].includes(s) && statusOf(s) !== 'abandoned'
      );
      return book({
        title: cleanTitle(r['Title']!),
        creators: authors,
        isbn: isbnOf(r['ISBN13']) ?? isbnOf(r['ISBN']),
        year: yearOf(r['Original Publication Year']) ?? yearOf(r['Year Published']),
        pageCount: Number.isFinite(pages) && pages > 0 ? pages : null,
        rating: rating > 0 ? normalizeRating(rating) : null,
        dateRated: rating > 0 ? (read ?? day(r['Date Added'])) : null,
        status,
        finishes: status === 'finished' && read ? [read] : [],
        dateAdded: day(r['Date Added']) ?? new Date().toISOString(),
        notes: [r['My Review'], r['Private Notes']]
          .filter(Boolean)
          .join('\n\n')
          .replace(/<br\s*\/?>/gi, '\n'),
        tags,
        series: seriesOf(r['Title']!)
      });
    });
}

export function fromStoryGraph(rows: readonly Row[]): CatalogEntry[] {
  return rows
    .filter((r) => r['Title'])
    .map((r) => {
      const status = statusOf(r['Read Status'] ?? '');
      const ranges = (r['Dates Read'] ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      // "2024/02/01-2024/02/10": a read's finish is the range's last date.
      const finishes = ranges
        .map((range) => day(range.match(/\d{4}[/-]\d{1,2}[/-]\d{1,2}/g)?.at(-1)))
        .filter((d): d is string => d != null);
      const last = day(r['Last Date Read']);
      if (status === 'finished' && finishes.length === 0 && last) finishes.push(last);
      const rating = Number(r['Star Rating']);
      return book({
        title: cleanTitle(r['Title']!),
        creators: splitList(r['Authors']),
        isbn: isbnOf(r['ISBN/UID']),
        rating: rating > 0 ? normalizeRating(rating) : null,
        dateRated: rating > 0 ? (last ?? day(r['Date Added'])) : null,
        status,
        finishes: status === 'finished' ? finishes : [],
        dateAdded: day(r['Date Added']) ?? new Date().toISOString(),
        notes: (r['Review'] ?? '').replace(/<br\s*\/?>/gi, '\n'),
        tags: splitList(r['Tags']),
        series: seriesOf(r['Title']!)
      });
    });
}

/**
 * Letterboxd's export is several files: watched, diary (one row per watch),
 * ratings and watchlist. They are folded into one entry per film.
 */
export function fromLetterboxd(files: readonly { name: string; rows: readonly Row[] }[]): CatalogEntry[] {
  const films = new Map<string, CatalogEntry>();
  const key = (r: Row) => `${(r['Name'] ?? '').toLowerCase()}|${r['Year'] ?? ''}`;
  const film = (r: Row) => {
    let e = films.get(key(r));
    if (!e) {
      e = imported('movie', {
        title: r['Name']!,
        year: yearOf(r['Year']),
        detailUrl: r['Letterboxd URI'] || null,
        dateAdded: day(r['Date']) ?? new Date().toISOString()
      });
      films.set(key(r), e);
    }
    return e;
  };
  const kind = (name: string) =>
    name
      .toLowerCase()
      .replace(/^.*\//, '')
      .replace(/\.csv$/, '');
  // Watchlist first, so a film both watched and still listed ends up watched.
  const order = ['watchlist', 'watched', 'ratings', 'diary', 'reviews'];
  const sorted = [...files].sort((a, b) => order.indexOf(kind(a.name)) - order.indexOf(kind(b.name)));
  for (const { name, rows } of sorted) {
    const k = kind(name);
    if (!order.includes(k)) continue;
    for (const r of rows) {
      if (!r['Name']) continue;
      const e = film(r);
      if (k === 'watchlist') {
        e.status ??= 'want';
        continue;
      }
      e.status = 'finished';
      const rating = Number(r['Rating']);
      if (rating > 0) {
        e.rating = normalizeRating(rating);
        e.dateRated = day(r['Date']) ?? e.dateRated;
      }
      if (k === 'diary') {
        const watched = day(r['Watched Date'] || r['Date']);
        if (watched && !e.finishes!.includes(watched)) e.finishes = [...e.finishes!, watched].sort();
        e.tags = [...new Set([...(e.tags ?? []), ...splitList(r['Tags'])])];
      }
      if (k === 'reviews' && r['Review']) e.notes = r['Review'];
      if (k === 'watched' && !e.finishes!.length) {
        const d = day(r['Date']);
        if (d) e.finishes = [d];
      }
    }
  }
  return [...films.values()];
}

/** "Leviathan Wakes (The Expanse, #1)" → the title alone; the series is kept separately. */
function cleanTitle(title: string): string {
  return title.replace(/\s*\(([^()]*),?\s*#\s*[\d.]+\)\s*$/, '').trim() || title;
}

function seriesOf(title: string): CatalogEntry['series'] {
  const m = /\(([^()]+?),?\s*#\s*([\d.]+)\)\s*$/.exec(title);
  return m ? { name: m[1]!.trim(), position: Number(m[2]) } : null;
}

// — Reading the files and saving ——————————————————————————————————————

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** What makes two entries the same thing: the ISBN, else the title with the first author's surname, or the year for a film. */
export function matchKeys(e: Pick<CatalogEntry, 'type' | 'title' | 'creators' | 'year' | 'isbn'>): string[] {
  const keys: string[] = [];
  if (e.isbn) keys.push(`isbn:${e.isbn}`);
  const surname =
    fold(e.creators[0] ?? '')
      .split(' ')
      .at(-1) ?? '';
  if (e.type === 'book') keys.push(`book:${fold(e.title)}|${surname}`);
  else keys.push(`${e.type}:${fold(e.title)}|${e.year ?? ''}`);
  return keys;
}

/** Fills what the shelf's copy doesn't have from the import; never overwrites what is already there. */
export function mergeInto(existing: CatalogEntry, incoming: CatalogEntry): boolean {
  let changed = false;
  const fill = <K extends keyof CatalogEntry>(k: K) => {
    const v = existing[k];
    const empty = v == null || v === '' || (Array.isArray(v) && v.length === 0);
    const w = incoming[k];
    const has = !(w == null || w === '' || (Array.isArray(w) && w.length === 0));
    if (empty && has) {
      existing[k] = w;
      changed = true;
    }
  };
  for (const k of ['rating', 'dateRated', 'status', 'isbn', 'pageCount', 'notes', 'series', 'year'] as const)
    fill(k);
  const finishes = [...new Set([...(existing.finishes ?? []), ...(incoming.finishes ?? [])])].sort();
  if (finishes.length !== (existing.finishes ?? []).length) {
    existing.finishes = finishes;
    changed = true;
  }
  const tags = [...new Set([...(existing.tags ?? []), ...(incoming.tags ?? [])])];
  if (tags.length !== (existing.tags ?? []).length) {
    existing.tags = tags;
    changed = true;
  }
  return changed;
}

export interface CatalogImport {
  source: CatalogSource;
  added: number;
  updated: number;
  unchanged: number;
}

/** CSV files, or Letterboxd's zip, as name and text. */
async function readFiles(files: readonly File[]): Promise<{ name: string; text: string }[]> {
  const out: { name: string; text: string }[] = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      for (const [name, data] of Object.entries(
        unzipSync(bytes, { filter: (f) => /\.csv$/i.test(f.name) })
      )) {
        out.push({ name, text: strFromU8(data) });
      }
    } else out.push({ name: file.name, text: strFromU8(bytes) });
  }
  return out;
}

/** Reads the export into entries, without saving. Throws when no file is one this knows. */
export async function readCatalogExport(
  files: readonly File[]
): Promise<{ source: CatalogSource; entries: CatalogEntry[] }> {
  const parsed = (await readFiles(files)).map((f) => ({ name: f.name, ...records(f.text) }));
  const letterboxd = parsed.filter((f) => detectSource(f.headers) === 'letterboxd');
  if (letterboxd.length > 0) return { source: 'letterboxd', entries: fromLetterboxd(letterboxd) };
  for (const f of parsed) {
    const source = detectSource(f.headers);
    if (source === 'goodreads') return { source, entries: fromGoodreads(f.rows) };
    if (source === 'storygraph') return { source, entries: fromStoryGraph(f.rows) };
  }
  throw new Error('That isn’t an export from Goodreads, StoryGraph or Letterboxd.');
}

/** Imports an export: new entries are added, ones already on the shelf only gain what they were missing. */
export async function importCatalogExport(files: readonly File[]): Promise<CatalogImport> {
  const { source, entries } = await readCatalogExport(files);
  const shelf = await listEntries();
  const byKey = new Map<string, CatalogEntry>();
  for (const e of shelf) for (const k of matchKeys(e)) byKey.set(k, e);
  const result: CatalogImport = { source, added: 0, updated: 0, unchanged: 0 };
  for (const e of entries) {
    const match = matchKeys(e)
      .map((k) => byKey.get(k))
      .find(Boolean);
    if (match) {
      if (mergeInto(match, e)) {
        await saveEntry(match);
        result.updated++;
      } else result.unchanged++;
      continue;
    }
    await saveEntry(e);
    for (const k of matchKeys(e)) byKey.set(k, e);
    result.added++;
  }
  return result;
}
