// A book for the nookling (style.md §14.1): finishing a book offers to tell
// Nookling, which opens with a card asking whether to give the pet a copy to
// read. Only offered when Nookling is installed; the link carries the title
// and author and nothing else.

import { AppLauncher } from '@capacitor/app-launcher';
import { Capacitor } from '@capacitor/core';
import { buildLink } from './links';

export function readLink(title: string, author: string): string {
  return buildLink(
    'nookling',
    'read',
    { title: title.trim().slice(0, 120), author: author.trim().slice(0, 120) },
    'bookshelf'
  );
}

/** Whether Nookling is on this phone. */
export async function hasNookling(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    return (await AppLauncher.canOpenUrl({ url: 'nookling://' })).value;
  } catch {
    return false;
  }
}

/** Opens Nookling with the book. */
export async function tellNookling(title: string, author: string): Promise<void> {
  try {
    await AppLauncher.openUrl({ url: readLink(title, author) });
  } catch {
    // Nothing to do: the book is finished either way.
  }
}
