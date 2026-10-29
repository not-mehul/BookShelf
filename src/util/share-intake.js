// Turn text shared into the app (Android share sheet / PWA share target)
// into prefill values for the add flow.
//
// Typical inputs:
//   • A highlight from a reader app:  “Quote…”\n\n— Author, Book\nhttps://…
//   • A page from a browser:          subject "Dune by Frank Herbert", text "https://…"
//   • A bare title:                   "The Left Hand of Darkness"

/**
 * @typedef {object} SharedInput
 * @property {string} [text]
 * @property {string} [subject] Android EXTRA_SUBJECT / share-target title.
 * @property {string} [url]
 */
/**
 * @typedef {object} SharePrefill
 * @property {string} quoteText Body with links and attribution removed.
 * @property {string} author
 * @property {string} source
 * @property {string} query  A plausible title to search for ('' if none).
 * @property {string | null} link First URL found, if any.
 */

const URL_RE = /https?:\/\/[^\s<>"]+/gi;
const WRAPPING_QUOTES = /^[\s"“”‘’'«»]+|[\s"“”‘’'«»]+$/g;
// A final line that reads like an attribution: "— Author", "- Author, Book", "from Book by Author".
const ATTRIBUTION_RE = /^(?:[—–-]\s*|from\s+)(.+)$/i;
const MAX_QUERY_LENGTH = 80;

/**
 * @param {SharedInput} input
 * @returns {SharePrefill}
 */
export function parseSharedText({ text = '', subject = '', url = '' }) {
  const links = [...`${text} ${url}`.matchAll(URL_RE)].map((m) => m[0]);
  const lines = text
    .replace(URL_RE, '')
    .split('\n')
    .map((l) => l.trim());

  // Peel an attribution line off the end (ignoring trailing blanks).
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  let attribution = '';
  const last = lines[lines.length - 1] || '';
  const match = lines.length > 1 ? last.match(ATTRIBUTION_RE) : null;
  if (match) {
    attribution = match[1].trim();
    lines.pop();
  }

  const quoteText = lines.join('\n').trim().replace(WRAPPING_QUOTES, '');
  const { author, source } = splitAttribution(attribution);
  const cleanSubject = subject.trim();
  const singleShortLine = quoteText && !quoteText.includes('\n') && quoteText.length <= MAX_QUERY_LENGTH;

  return {
    quoteText,
    author,
    source: source || (cleanSubject && !author ? cleanSubject : ''),
    query: cleanSubject || (singleShortLine ? quoteText : ''),
    link: links[0] || null
  };
}

/**
 * "Book by Author" → both; "Author, Book" → both; otherwise treat as author.
 * @param {string} attribution
 */
function splitAttribution(attribution) {
  if (!attribution) return { author: '', source: '' };
  const by = attribution.match(/^(.+?)\s+by\s+(.+)$/i);
  if (by) return { source: by[1].trim(), author: by[2].trim() };
  const comma = attribution.indexOf(',');
  if (comma > 0) return { author: attribution.slice(0, comma).trim(), source: attribution.slice(comma + 1).trim() };
  return { author: attribution, source: '' };
}
