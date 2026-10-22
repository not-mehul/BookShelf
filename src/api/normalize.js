// Normalize external API responses into the unified CatalogEntry shape.
// CatalogEntry fields are documented in src/db/database.js.

export function normalizeBook(volume) {
  const info = volume.volumeInfo || {};
  const year = info.publishedDate ? parseInt(info.publishedDate.slice(0, 4), 10) : null;
  return {
    type: 'book',
    sourceId: String(volume.id),
    title: info.title || 'Untitled',
    creators: info.authors || [],
    year: Number.isFinite(year) ? year : null,
    summary: info.description || '',
    genres: info.categories || [],
    pageCount: info.pageCount || null,
    thumbnailUrl: pickBookThumb(info.imageLinks),
    detailUrl: info.infoLink || null
  };
}

function pickBookThumb(links) {
  if (!links) return null;
  const raw =
    links.extraLarge ||
    links.large ||
    links.medium ||
    links.thumbnail ||
    links.smallThumbnail ||
    null;
  if (!raw) return null;
  return raw.replace(/^http:\/\//, 'https://');
}

// Open Library /search.json doc → unified book shape.
export function normalizeOpenLibraryDoc(doc) {
  const year = Number.isFinite(doc.first_publish_year) ? doc.first_publish_year : null;
  const coverId = doc.cover_i;
  return {
    type: 'book',
    sourceId: `ol:${doc.key || doc.isbn?.[0] || Math.random().toString(36).slice(2)}`,
    title: doc.title || 'Untitled',
    creators: doc.author_name || [],
    year,
    summary: '',
    genres: (doc.subject || []).slice(0, 8),
    pageCount: doc.number_of_pages_median || null,
    isbn: doc.isbn?.[0] || null,
    thumbnailUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : null,
    detailUrl: doc.key ? `https://openlibrary.org${doc.key}` : null
  };
}

// TheTVDB /search returns a heterogeneous list with `type`: 'movie' | 'series' | etc.
export function normalizeTvdbSearchHit(hit) {
  const isSeries = hit.type === 'series';
  const type = isSeries ? 'tv' : 'movie';
  const year = hit.year ? parseInt(hit.year, 10) : null;
  return {
    type,
    sourceId: String(hit.tvdb_id || hit.id),
    title: hit.name || hit.title || 'Untitled',
    creators: [],
    year: Number.isFinite(year) ? year : null,
    summary: hit.overview || '',
    genres: hit.genres || [],
    thumbnailUrl: hit.image_url || hit.thumbnail || null,
    detailUrl: hit.url || null,
    raw: { type: hit.type }
  };
}

// Full /movies/{id}/extended or /series/{id}/extended detail enrichment.
export function enrichFromTvdbDetail(entry, detail) {
  if (!detail) return entry;
  const next = { ...entry };
  if (detail.image) next.thumbnailUrl = next.thumbnailUrl || detail.image;
  if (detail.overview) next.summary = next.summary || detail.overview;
  const genres = (detail.genres || []).map((g) => g.name).filter(Boolean);
  if (genres.length) next.genres = genres;
  const directors = (detail.characters || [])
    .filter((c) => /director/i.test(c.peopleType || ''))
    .map((c) => c.personName)
    .filter(Boolean);
  if (directors.length) next.creators = directors;
  next.enriched = true;
  return next;
}
