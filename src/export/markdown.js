// Serialize the catalog to Markdown, grouped by type and sorted by rating desc.

import { listEntries } from '../db/database.js';
import { hasNativeExport, nativeExport } from '../util/android-bridge.js';

const TYPE_LABEL = { book: 'Books', movie: 'Movies', tv: 'TV Shows', quote: 'Quotes' };
const TYPE_ORDER = ['book', 'movie', 'tv', 'quote'];

function ratingStars(value) {
  if (value == null) return '';
  const full = Math.round(value);
  return '★'.repeat(full) + '☆'.repeat(Math.max(0, 5 - full));
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toISOString().slice(0, 10);
}

function escapeMd(text) {
  if (!text) return '';
  return text.replace(/[<>]/g, (c) => (c === '<' ? '&lt;' : '&gt;'));
}

export async function exportMarkdown() {
  const entries = await listEntries();
  const today = new Date().toISOString().slice(0, 10);

  let md = `# My Catalog\n\n_Exported ${today} — ${entries.length} entries_\n\n`;

  for (const type of TYPE_ORDER) {
    const slice = entries
      .filter((e) => e.type === type)
      .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.title.localeCompare(b.title));
    if (!slice.length) continue;
    md += `\n## ${TYPE_LABEL[type]} (${slice.length})\n\n`;
    for (const e of slice) {
      if (type === 'quote') {
        const qText = escapeMd(e.quoteText || e.title).replace(/\n/g, '\n> ');
        md += `> ${qText}\n`;
        const citeParts = [e.creators?.[0], e.source].filter(Boolean).map(escapeMd);
        if (citeParts.length) md += `>\n> — ${citeParts.join(', ')}\n\n`;
        else md += '\n';
        if (e.rating != null) md += `${ratingStars(e.rating)} **${e.rating}/5**\n\n`;
        if (e.notes?.trim()) md += `_${escapeMd(e.notes.trim())}_\n\n`;
        md += `_Added ${formatDate(e.dateAdded)}_\n\n---\n\n`;
        continue;
      }
      const year = e.year ? ` (${e.year})` : '';
      const stars = e.rating != null ? ` — ${ratingStars(e.rating)} **${e.rating}/5**` : '';
      md += `### ${escapeMd(e.title)}${year}${stars}\n`;
      if (e.creators?.length) md += `*${escapeMd(e.creators.join(', '))}*\n\n`;
      else md += '\n';
      if (e.genres?.length) {
        md += `**Genres:** ${e.genres.map(escapeMd).join(', ')}\n\n`;
      }
      if (e.status) md += `**Status:** ${e.status}\n\n`;
      if (e.summary) md += `${escapeMd(e.summary).trim()}\n\n`;
      if (e.notes?.trim()) md += `> ${escapeMd(e.notes.trim()).replace(/\n/g, '\n> ')}\n\n`;
      md += `_Added ${formatDate(e.dateAdded)}${e.dateRated ? ` · rated ${formatDate(e.dateRated)}` : ''}_\n\n---\n\n`;
    }
  }

  return md;
}

export async function saveAndShareMarkdown() {
  const md = await exportMarkdown();
  const today = new Date().toISOString().slice(0, 10);
  const filename = `bookshelf-${today}.md`;

  // Native Android shell — hand the file to the system share sheet.
  if (hasNativeExport()) {
    nativeExport(filename, md);
    return { method: 'native', filename };
  }

  // Browser — trigger a download.
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { method: 'download', filename };
}
