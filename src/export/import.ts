import { listEntries, newEntryId, saveEntry } from '../db/database';
import { matchKeys } from './catalog-import';
import { fetchThumbBlob } from '../util/thumbs';
import { fromDay } from '../util/journal';
import { parseRatingLabel } from '../util/stars';
import type { CatalogEntry, EntryType } from '../types';

/** The export writes < and > as entities; read them back as the characters. */
function unescapeMd(text: string): string {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/**
 * Parse the Markdown format produced by exportMarkdown() into entry objects.
 * Pure (aside from optional cover fetches) — safe to unit-test. Does not save.
 */
export async function parseMarkdown(text: string): Promise<CatalogEntry[]> {
  const entries: CatalogEntry[] = [];
  const typeSections = text.split(/\n## /);

  for (const section of typeSections) {
    const lines = section.split('\n');
    const header = (lines[0] ?? '').toLowerCase();
    let type: EntryType | null = null;
    if (header.includes('books')) type = 'book';
    else if (header.includes('movies')) type = 'movie';
    else if (header.includes('tv shows')) type = 'tv';
    else if (header.includes('quotes')) type = 'quote';

    if (!type) continue;

    const content = lines.slice(1).join('\n');
    const items = content.split(/\n---\n/);

    for (const item of items) {
      const entry = await parseEntry(item.trim(), type);
      if (entry) entries.push(entry);
    }
  }
  return entries;
}

/**
 * Best-effort import of a Markdown export (the JSON backup is the lossless
 * one). Anything already on the shelf, matched as the catalog imports match
 * it, is left as it is, so importing the same file twice adds nothing.
 */
export async function importMarkdown(text: string): Promise<{ imported: number; skipped: number }> {
  const entries = await parseMarkdown(text);
  const known = new Set((await listEntries()).flatMap(matchKeys));
  let imported = 0;
  let skipped = 0;
  for (const e of entries) {
    const keys = matchKeys(e);
    if (keys.some((k) => known.has(k))) {
      skipped++;
      continue;
    }
    await saveEntry(e);
    for (const k of keys) known.add(k);
    imported++;
  }
  return { imported, skipped };
}
async function parseEntry(text: string, type: EntryType): Promise<CatalogEntry | null> {
  if (!text) return null;
  const entry: CatalogEntry = {
    id: newEntryId(),
    type,
    title: '',
    creators: [],
    year: null,
    summary: '',
    genres: [],
    tags: [],
    progress: null,
    rating: null,
    notes: '',
    dateAdded: new Date().toISOString(),
    dateRated: null,
    sourceId: null,
    thumbnailUrl: null,
    thumbnailBlob: null
  };

  if (type === 'quote') {
    const lines = text.split('\n').map((l) => l.trim());
    const quoted = lines.filter((l) => l.startsWith('>')).map((l) => l.slice(1).trim());
    // The citation is the last line of the quote, after a bare ">", starting
    // with a dash. A line of dialogue that opens with a dash is quote text.
    const lastIndex = quoted.length - 1;
    const hasCite = lastIndex >= 1 && quoted[lastIndex]!.startsWith('—') && quoted[lastIndex - 1] === '';
    const body = hasCite ? quoted.slice(0, lastIndex - 1) : quoted;
    if (hasCite) {
      const cite = quoted[lastIndex]!.slice(1).trim();
      if (cite.includes(' · ')) {
        // Author · source · where (exports since 2.2).
        const [author = '', source = '', where = ''] = cite.split(' · ').map((x) => unescapeMd(x.trim()));
        entry.creators = author ? [author] : [];
        entry.source = source;
        if (where) entry.location = where;
      } else {
        const parts = cite.split(',').map((x) => unescapeMd(x.trim()));
        entry.creators = parts[0] ? [parts[0]] : [];
        entry.source = parts.slice(1).join(', ');
      }
    }
    const notes: string[] = [];
    for (const line of lines) {
      if (line.startsWith('>')) continue;
      if (/[★☆½]/.test(line)) {
        const rating = parseRatingLabel(line);
        if (rating != null) entry.rating = rating;
      } else if (line.startsWith('_') && line.endsWith('_') && line.length > 1) {
        const content = line.slice(1, -1).trim();
        const added = /^Added (\d{4}-\d{2}-\d{2})$/.exec(content);
        if (added) entry.dateAdded = new Date(added[1]!).toISOString();
        else notes.push(unescapeMd(content));
      }
    }
    entry.notes = notes.join('\n');
    // Trailing blank quote lines (a paragraph break kept as ">") are not text.
    while (body.length && !body[body.length - 1]) body.pop();
    entry.quoteText = unescapeMd(body.join('\n').trim());
    entry.title = entry.quoteText.slice(0, 100);
    if (!entry.quoteText) return null;
    return entry;
  } else {
    const lines = text.split('\n');
    const firstLine = (lines[0] ?? '').trim();
    if (!firstLine.startsWith('###')) return null;

    let titlePart = firstLine.slice(3).trim();
    // "Title (1977) — ★★★★½ **4.5/5**": the rating is the end of the line, so a
    // title with a dash of its own ("Star Wars — A New Hope") stays whole.
    const ratingMatch = /\s*—\s*[★☆½]+\s*\*\*([\d.]+\/(?:5|10))\*\*\s*$/.exec(titlePart);
    if (ratingMatch) {
      entry.rating = parseRatingLabel(ratingMatch[1]!);
      titlePart = titlePart.slice(0, ratingMatch.index).trim();
    }
    const yearMatch = titlePart.match(/\((\d{4})\)$/);
    if (yearMatch) {
      entry.year = parseInt(yearMatch[1]!, 10);
      entry.title = unescapeMd(titlePart.replace(/\(\d{4}\)$/, '').trim());
    } else {
      entry.title = unescapeMd(titlePart);
    }
    // The author line comes before the synopsis; an italic line after it is synopsis.
    let creatorsRead = false;

    for (let i = 1; i < lines.length; i++) {
      const line = (lines[i] ?? '').trim();
      if (!line) continue;

      if (line.startsWith('![Poster]')) {
        const urlMatch = line.match(/\((.*?)\)/);
        if (urlMatch) {
          entry.thumbnailUrl = urlMatch[1] ?? null;
          entry.thumbnailBlob = await fetchThumbBlob(entry.thumbnailUrl);
        }
      } else if (
        !creatorsRead &&
        !entry.summary &&
        line.startsWith('*') &&
        line.endsWith('*') &&
        !line.startsWith('**')
      ) {
        creatorsRead = true;
        entry.creators = line
          .slice(1, -1)
          .split(',')
          .map((s) => unescapeMd(s.trim()));
      } else if (line.startsWith('**Genres:**')) {
        entry.genres = line
          .replace('**Genres:**', '')
          .split(',')
          .map((s) => s.trim());
      } else if (line.startsWith('**Series:**')) {
        const m = line
          .replace('**Series:**', '')
          .trim()
          .match(/^(.+?)(?:\s+#(\d+(?:\.\d+)?))?$/);
        if (m) entry.series = { name: m[1]!.trim(), position: m[2] ? Number(m[2]) : null };
      } else if (line.startsWith('**Journal:**')) {
        const text = line.replace('**Journal:**', '');
        const started = text.match(/started (\d{4}-\d{2}-\d{2})/);
        if (started) entry.dateStarted = fromDay(started[1]!);
        const finished = text.match(/finished ([\d\-, ]+)/);
        if (finished)
          entry.finishes = (finished[1]!.match(/\d{4}-\d{2}-\d{2}/g) || [])
            .map(fromDay)
            .filter((d): d is string => d != null);
      } else if (line.startsWith('**Status:**')) {
        const status = line.replace('**Status:**', '').trim();
        if (status === 'want' || status === 'in-progress' || status === 'finished' || status === 'abandoned')
          entry.status = status;
      } else if (line.startsWith('>')) {
        entry.notes += (entry.notes ? '\n' : '') + unescapeMd(line.slice(1).trim());
      } else if (line.startsWith('_Added')) {
        const dates = line.match(/\d{4}-\d{2}-\d{2}/g);
        if (dates && dates[0]) entry.dateAdded = new Date(dates[0]).toISOString();
        if (dates && dates[1]) entry.dateRated = new Date(dates[1]).toISOString();
      } else {
        // A backslash in front marks a synopsis line that looked like structure.
        const plain = line.startsWith('\\') ? line.slice(1) : line;
        entry.summary += (entry.summary ? '\n' : '') + unescapeMd(plain);
      }
    }

    if (!entry.title) return null;
    return entry;
  }
}
