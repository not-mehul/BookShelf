// Series helpers: detect a series from a title, order a series, find what's next.

/** @typedef {import('../types').CatalogEntry} CatalogEntry */
/** @typedef {{ name: string, position: number | null }} Series */

const NUM = '(\\d+(?:\\.\\d+)?)';
const PATTERNS = [
  // "Leviathan Wakes (The Expanse, #1)", "(Discworld #3)", "(Foundation, Book 2)"
  new RegExp(`\\(([^()]+?)[,;]?\\s*(?:#|no\\.?\\s*|book\\s+|vol\\.?\\s*|volume\\s+)${NUM}\\)\\s*$`, 'i'),
  // "Book 3 of the Wheel of Time", "Volume 2 of The Stormlight Archive"
  new RegExp(`(?:^|[:\\-—]\\s*)(?:book|volume|vol\\.?)\\s+${NUM}\\s+(?:of|in)\\s+(?:the\\s+)?(.+?)\\s*$`, 'i'),
  // "Children of Time: Children of Time, Book 1", "The Expanse, Book 3"
  new RegExp(`(?:^|:\\s*)([^:]+?),\\s*(?:book|vol\\.?|volume|part)\\s+${NUM}\\s*$`, 'i')
];

/**
 * Guess the series from a title, e.g. "Abaddon's Gate (The Expanse, #3)".
 * @param {string} title
 * @returns {Series | null}
 */
export function parseSeriesFromTitle(title) {
  const t = (title || '').trim();
  for (const [i, re] of PATTERNS.entries()) {
    const m = t.match(re);
    if (!m) continue;
    const [name, num] = i === 1 ? [m[2], m[1]] : [m[1], m[2]];
    const clean = name.trim().replace(/\s+/g, ' ');
    if (clean) return { name: clean, position: Number(num) };
  }
  return null;
}

/** Comparable series name: case-, punctuation- and leading-article-insensitive. */
export function seriesKey(/** @type {string | undefined} */ name) {
  return (name || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/^the\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Entries in the same series as `name`, in reading/watching order
 * (by position, then year, then title; unnumbered last).
 * @param {CatalogEntry[]} entries
 * @param {string} name
 */
export function seriesEntries(entries, name) {
  const key = seriesKey(name);
  if (!key) return [];
  return entries
    .filter((e) => e.type !== 'quote' && seriesKey(e.series?.name) === key)
    .sort(compareSeriesOrder);
}

/** @param {CatalogEntry} a @param {CatalogEntry} b */
export function compareSeriesOrder(a, b) {
  const pa = a.series?.position ?? Infinity;
  const pb = b.series?.position ?? Infinity;
  return pa - pb || (a.year ?? 0) - (b.year ?? 0) || a.title.localeCompare(b.title);
}

/**
 * What comes after `entry` in its series.
 *   next          — the next numbered entry on the shelf, if any
 *   nextPosition  — the position that should come next
 *   onShelf       — whether that position is on the shelf
 *   missing       — numbered gaps (1…highest) not on the shelf
 * @param {CatalogEntry[]} entries
 * @param {CatalogEntry} entry
 */
export function nextInSeries(entries, entry) {
  const series = entry.series;
  const all = series ? seriesEntries(entries, series.name) : [];
  const positions = new Set(all.map((e) => e.series?.position).filter((p) => p != null));
  const pos = series?.position ?? null;

  const next = pos == null ? null : all.find((e) => (e.series?.position ?? -Infinity) > pos) || null;
  const nextPosition = pos == null ? null : Math.floor(pos) + 1;
  const highest = Math.max(0, ...[...positions].map(Number));
  const missing = [];
  for (let p = 1; p <= highest; p++) if (!positions.has(p)) missing.push(p);

  return {
    next,
    nextPosition,
    onShelf: nextPosition != null && positions.has(nextPosition),
    missing
  };
}

/** Sort key for "series order" in the library: series name, then position. */
export function seriesSortKey(/** @type {CatalogEntry} */ e) {
  return e.series?.name ? `0 ${seriesKey(e.series.name)}` : `1 ${e.title.toLowerCase()}`;
}
