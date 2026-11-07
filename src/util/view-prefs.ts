// The library's last tab and sort order, remembered on this device.
// A convenience only: storage can be missing or full, and then it is forgotten.

const KEY = 'bookshelf:library_view';

export interface LibraryView {
  type?: string;
  sort?: string;
}

export function loadView(): LibraryView {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) || '{}');
    return parsed && typeof parsed === 'object' ? (parsed as LibraryView) : {};
  } catch {
    return {};
  }
}

export function saveView(view: LibraryView): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(view));
  } catch {
    /* private mode or full: not worth a message */
  }
}
