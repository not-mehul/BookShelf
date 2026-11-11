// BookShelf's moments of delight and its easter eggs (style.md §11.3). The
// animations come from dusk-dawn and all of them respect reduced motion; the
// toast always says what happened, so nothing is only visual.

import { celebrate, createEggs, type CelebrateOptions } from 'dusk-dawn/expressive';
import { ui } from '../state/ui.svelte';

export const EGGS = ['konami', 'title', 'tsundoku'] as const;
export type Egg = (typeof EGGS)[number];

const eggs = createEggs('bookshelf', EGGS);

/** Confetti from the reading room: stars for the rating, a few fleurons and section marks. */
export const READING_ROOM: CelebrateOptions = {
  glyphs: ['★', '❦', '¶', '§'],
  shapes: ['sunny', 'circle', 'diamond', 'heart', 'cookie-6'],
  colours: ['--accent-bright', '--accent-amber', '--accent-sage', '--text-heading']
};

/** An easter egg hatches: its toast, with the count the first time it's found. */
export function hatch(id: Egg, message: string): void {
  const { isNew, found, total } = eggs.find(id);
  ui.notify(isNew ? `${message} Easter egg found: ${found} of ${total}.` : message, 'celebrate');
}

export function eggsFound(): number {
  return eggs.found().length;
}

/** A real accomplishment: confetti, from where it happened. */
export function cheer(origin?: Element | null, options: CelebrateOptions = {}): void {
  void celebrate({ ...READING_ROOM, origin: origin ?? undefined, ...options });
}
