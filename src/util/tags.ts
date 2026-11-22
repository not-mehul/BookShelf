// Tags are matched without regard to case: "favourites" and "Favourites" are
// one tag, written the way it was written first.

/** What two spellings of one tag share. */
export const tagKey = (tag: string): string => tag.trim().toLocaleLowerCase();

/** Whether the list holds this tag, in any case. */
export function hasTag(tags: readonly string[] | undefined, tag: string): boolean {
  const key = tagKey(tag);
  return (tags ?? []).some((t) => tagKey(t) === key);
}

/** One of each tag, keeping each one's first spelling, in their order. */
export function uniqueTags(tags: readonly string[]): string[] {
  const seen = new Map<string, string>();
  for (const t of tags) {
    const trimmed = t.trim();
    if (trimmed && !seen.has(tagKey(trimmed))) seen.set(tagKey(trimmed), trimmed);
  }
  return [...seen.values()];
}

/** The spelling the shelf already uses for this tag, or the tag as typed. */
export function shelfSpelling(tag: string, known: readonly string[]): string {
  const key = tagKey(tag);
  return known.find((t) => tagKey(t) === key) ?? tag.trim();
}
