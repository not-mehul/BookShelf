// Small text helpers for forms.

/** "a, b , c" → ["a", "b", "c"]; empty entries dropped. */
export function splitList(value: string | null | undefined): string[] {
  return (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** A–Z by title, for sorting; copes with an entry that has none. */
export function compareTitles(a: { title?: string | null }, b: { title?: string | null }): number {
  return String(a.title ?? '').localeCompare(String(b.title ?? ''));
}
