import { newEntryId, saveEntry } from '../db/database.js';
import { fetchThumbBlob } from '../util/thumbs.js';

/**
 * Naive parser for the Markdown format produced by exportMarkdown().
 */
export async function importMarkdown(text) {
  const entries = [];
  const typeSections = text.split(/\n## /);

  for (const section of typeSections) {
    const lines = section.split('\n');
    const header = lines[0].toLowerCase();
    let type = null;
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

  let count = 0;
  for (const e of entries) {
    await saveEntry(e);
    count++;
  }

  return count;
}

async function parseEntry(text, type) {
  if (!text) return null;

  const entry = {
    id: newEntryId(),
    type,
    title: '',
    creators: [],
    year: null,
    summary: '',
    genres: [],
    rating: null,
    notes: '',
    dateAdded: new Date().toISOString(),
    dateRated: null,
    sourceId: null,
    thumbnailUrl: null,
    thumbnailBlob: null
  };

  if (type === 'quote') {
    const lines = text.split('\n');
    const quoteLines = [];
    let state = 'quote';

    for (let line of lines) {
      line = line.trim();
      if (line.startsWith('>')) {
        const content = line.slice(1).trim();
        if (content.startsWith('—')) {
          const cite = content.slice(1).trim();
          const parts = cite.split(',').map(s => s.trim());
          entry.creators = [parts[0]];
          entry.source = parts.slice(1).join(', ');
          state = 'meta';
        } else if (state === 'quote') {
          quoteLines.push(content);
        }
      } else if (line.includes('★') || line.includes('☆')) {
        const match = line.match(/(\d)\/5/);
        if (match) entry.rating = parseInt(match[1], 10);
      } else if (line.startsWith('_') && line.endsWith('_')) {
        const content = line.slice(1, -1).trim();
        if (content.startsWith('Added')) {
          const dateMatch = content.match(/\d{4}-\d{2}-\d{2}/);
          if (dateMatch) entry.dateAdded = new Date(dateMatch[0]).toISOString();
        } else {
          entry.notes = content;
        }
      }
    }
    entry.quoteText = quoteLines.filter(Boolean).join('\n');
    entry.title = entry.quoteText.slice(0, 100);
    if (!entry.quoteText) return null;
    return entry;
  } else {
    const lines = text.split('\n');
    const firstLine = lines[0].trim();
    if (!firstLine.startsWith('###')) return null;

    const titlePart = firstLine.slice(3).trim();
    const ratingMatch = titlePart.match(/—\s*[★☆]+\s*\*\*(\d)\/5\*\*/);
    if (ratingMatch) {
      entry.rating = parseInt(ratingMatch[1], 10);
    }

    let titleNoRating = titlePart.split('—')[0].trim();
    const yearMatch = titleNoRating.match(/\((\d{4})\)$/);
    if (yearMatch) {
      entry.year = parseInt(yearMatch[1], 10);
      entry.title = titleNoRating.replace(/\(\d{4}\)$/, '').trim();
    } else {
      entry.title = titleNoRating;
    }

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith('![Poster]')) {
        const urlMatch = line.match(/\((.*?)\)/);
        if (urlMatch) {
          entry.thumbnailUrl = urlMatch[1];
          entry.thumbnailBlob = await fetchThumbBlob(entry.thumbnailUrl);
        }
      } else if (line.startsWith('*') && line.endsWith('*') && !line.startsWith('**')) {
        entry.creators = line.slice(1, -1).split(',').map(s => s.trim());
      } else if (line.startsWith('**Genres:**')) {
        entry.genres = line.replace('**Genres:**', '').split(',').map(s => s.trim());
      } else if (line.startsWith('**Status:**')) {
        entry.status = line.replace('**Status:**', '').trim();
      } else if (line.startsWith('>')) {
        entry.notes += (entry.notes ? '\n' : '') + line.slice(1).trim();
      } else if (line.startsWith('_Added')) {
        const dates = line.match(/\d{4}-\d{2}-\d{2}/g);
        if (dates && dates[0]) entry.dateAdded = new Date(dates[0]).toISOString();
        if (dates && dates[1]) entry.dateRated = new Date(dates[1]).toISOString();
      } else {
        entry.summary += (entry.summary ? '\n' : '') + line;
      }
    }

    if (!entry.title) return null;
    return entry;
  }
}
