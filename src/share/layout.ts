// Pure text-layout helpers for the canvas share cards (testable without a canvas).

export type Measure = (text: string, fontSize: number) => number;

/**
 * Greedy word wrap. Words longer than the line are broken by character.
 * Explicit newlines are kept.
 */
export function wrapLines(text: string, maxWidth: number, fontSize: number, measure: Measure): string[] {
  const lines = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate, fontSize) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // A single word wider than the line: split it.
      let rest = word;
      while (measure(rest, fontSize) > maxWidth && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && measure(rest.slice(0, cut), fontSize) > maxWidth) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

/**
 * Largest font size (stepping down from maxSize) at which the text fits in the
 * box; at minSize, overflow is truncated with an ellipsis.
 * @param [o.lineHeight] Multiple of the font size.
 */
export function fitText({
  text,
  maxWidth,
  maxHeight,
  maxSize,
  minSize,
  lineHeight = 1.25,
  maxLines = Infinity,
  measure
}: {
  text: string;
  maxWidth: number;
  maxHeight: number;
  maxSize: number;
  minSize: number;
  lineHeight?: number;
  maxLines?: number;
  measure: Measure;
}): { size: number; lines: string[]; truncated: boolean } {
  for (let size = maxSize; size >= minSize; size -= 2) {
    const lines = wrapLines(text, maxWidth, size, measure);
    if (lines.length <= maxLines && lines.length * size * lineHeight <= maxHeight) {
      return { size, lines, truncated: false };
    }
  }
  const size = minSize;
  const capacity = Math.max(1, Math.min(maxLines, Math.floor(maxHeight / (size * lineHeight))));
  const lines = wrapLines(text, maxWidth, size, measure);
  if (lines.length <= capacity) return { size, lines, truncated: false };
  const kept = lines.slice(0, capacity);
  let last = kept[capacity - 1];
  while (last && measure(`${last}…`, size) > maxWidth)
    last = last.replace(/\s*\S+$/, '') || last.slice(0, -1);
  kept[capacity - 1] = `${last}…`;
  return { size, lines: kept, truncated: true };
}

/** Card formats, in pixels (1080 wide: crisp on phones and social apps). */
export const FORMATS = {
  post: { width: 1080, height: 1350, label: 'Post' },
  square: { width: 1080, height: 1080, label: 'Square' },
  story: { width: 1080, height: 1920, label: 'Story' }
};
