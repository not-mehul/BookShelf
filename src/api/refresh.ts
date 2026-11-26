// Library refresh: find what each entry is missing that the catalog could fill
// (a cover, a synopsis, its year or creators, or a catalog match at all),
// propose a match for each, and fill in the ones the user keeps. Only empty
// fields are filled (see match.ts); nothing the user wrote changes.

import type { CatalogEntry, SearchHit } from '../types';
import { confidentPick, findCandidates, lacksMatch, matchFills } from './match';

export type Missing = 'match' | 'cover' | 'synopsis' | 'details';

export const MISSING_LABEL: Record<Missing, string> = {
  match: 'catalog match',
  cover: 'cover',
  synopsis: 'synopsis',
  details: 'details'
};

/** What `e` is missing, in that order. Quotes have no catalog record. */
export function missingParts(e: CatalogEntry): Missing[] {
  if (e.type === 'quote') return [];
  const out: Missing[] = [];
  if (lacksMatch(e)) out.push('match');
  if (!e.thumbnailUrl && !e.thumbnailBlob) out.push('cover');
  if (!e.summary?.trim()) out.push('synopsis');
  if (!e.year || !e.creators?.length) out.push('details');
  return out;
}

// Entries the user left as they were (or the catalog had nothing more for),
// by what they were missing then: they come back if that changes.
const CHECKED_KEY = 'bookshelf:refresh_checked';

function readChecked(): Record<string, string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(CHECKED_KEY) || '{}');
    return v && typeof v === 'object' ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

const signature = (e: CatalogEntry) => missingParts(e).join(',');

/** Don't offer `e` again until what it is missing changes. */
export function markChecked(e: CatalogEntry): void {
  const checked = readChecked();
  checked[e.id] = signature(e);
  try {
    localStorage.setItem(CHECKED_KEY, JSON.stringify(checked));
  } catch {
    /* storage full or unavailable: it is offered again next time */
  }
}

/** The entries a refresh would look at. */
export function refreshTodo(entries: CatalogEntry[]): CatalogEntry[] {
  const checked = readChecked();
  return entries.filter((e) => {
    const sig = signature(e);
    return sig !== '' && checked[e.id] !== sig;
  });
}

/** What a match would add to `e`, worded for the list ("Cover", "Synopsis"…). */
export function refreshFills(e: CatalogEntry, hit: SearchHit): string[] {
  const fills = matchFills(e, hit);
  // Already matched: loading its credits again adds nothing new.
  return lacksMatch(e) ? fills : fills.filter((f) => !f.endsWith('and details'));
}

export type Proposal =
  /** One hit is surely this entry. */
  | { kind: 'sure'; hit: SearchHit; hits: SearchHit[] }
  /** Hits, but none surely this one: the user chooses. */
  | { kind: 'choose'; hits: SearchHit[] }
  /** Nothing found. */
  | { kind: 'none' }
  /** Surely this entry, but the catalog has nothing more for it. */
  | { kind: 'complete' };

/** Search the catalog for `e` and say what to do with what came back. */
export async function propose(e: CatalogEntry): Promise<Proposal> {
  const hits = (await findCandidates(e)).slice(0, 5);
  if (!hits.length) return { kind: 'none' };
  // An entry already matched: its own record, if the search found it.
  const hit = (e.sourceId && hits.find((h) => h.sourceId === e.sourceId)) || confidentPick(e, hits);
  if (!hit) return { kind: 'choose', hits };
  return refreshFills(e, hit).length ? { kind: 'sure', hit, hits } : { kind: 'complete' };
}
