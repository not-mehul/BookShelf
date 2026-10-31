// Small text helpers for forms.

/** "a, b , c" → ["a", "b", "c"]; empty entries dropped. */
export function splitList(value: string | null | undefined): string[] {
  return (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
