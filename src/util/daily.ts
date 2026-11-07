// A stable pick for the day: the same index all day, a different one tomorrow.

/** FNV-1a of the day string, folded into 0…n−1. */
export function dailyIndex(day: string, n: number): number {
  if (n <= 0) return 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < day.length; i++) {
    h ^= day.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % n;
}
