// BookShelf — app entry point: applies the theme, loads the shelf and mounts
// the Svelte UI, then wires up everything that arrives from outside (the
// Android shell, links from the sibling apps, sync).
//
// BookShelf is an Android app. The page runs only inside its shell; opened
// in a browser it says so, except under `npm run dev`, where the UI runs on
// its own for work on it (search, sync, sharing and backups need the shell).

import { mount } from 'svelte';
import { dismissOverlay } from 'dusk-dawn';
import App from './components/App.svelte';
import { refreshFollowedGuides } from './api/episode-sync';
import { moveToTmdb } from './api/tmdb-move';
import { dropTvdbSettings } from './util/settings';
import { claimBackForMenus, installNativeBridge, onNativeEvent } from './platform/native';
import { initTheme } from './platform/theme.svelte';
import { shelf } from './state/shelf.svelte';
import { startAutoBackup } from './sync/auto-backup';
import { ui } from './state/ui.svelte';
import { messageOf } from './util/errors';
import { readBookShelfLink } from './util/link-intake';
import { dropRetiredSettings } from './util/retired';
import { parseSharedText, type SharedInput } from './util/share-intake';

// Must run before anything fetches: routes cross-origin calls through the
// Android shell's native HTTP.
const inShell = installNativeBridge();
// Android Back closes an open Select menu before anything else.
claimBackForMenus(dismissOverlay);

function openShared(shared: SharedInput) {
  ui.openAdd({ prefill: parseSharedText(shared) });
}

/** A bookshelf:// link from another app (style.md §14.1). `open` just shows the shelf. */
function openLink(url: string) {
  const intake = readBookShelfLink(url);
  if (intake?.kind === 'add') ui.openAdd(intake.options);
}

async function boot(): Promise<void> {
  dropRetiredSettings();
  // The home-screen widget follows the theme, so it re-skins on a change.
  await initTheme(() => void shelf.refresh());
  await shelf.refresh();

  const target = document.getElementById('app')!;
  target.replaceChildren();
  mount(App, { target });

  // Events the shell kept during startup arrive as each listener is added.
  // Text shared from another app (Android share sheet) …
  onNativeEvent('shared', (data) => openShared(data || {}));
  // … a bookshelf:// link from Rosetta or another sibling app …
  onNativeEvent('link', (data) => typeof data?.url === 'string' && openLink(data.url));
  // … the home-screen widget's "+" button …
  onNativeEvent('openAdd', () => ui.openAdd());
  // … or a new-episode notification (open that show).
  onNativeEvent('openEntry', (data) => data?.id && ui.openEntry(String(data.id)));

  // Encrypted folder sync (Android app, once configured): pull now, push after changes.
  shelf.startSync();
  // The weekly backup to Documents/BookShelf/Backups (Android app).
  startAutoBackup();
  // Films and shows still on TheTVDB ids move to TMDB once there is a key,
  // then guides of shows being followed refresh (quietly; both need TMDB).
  void dropTvdbSettings()
    .then(() => moveToTmdb())
    .then(async (r) => {
      if (r.moved + r.needMatch) await shelf.refresh();
    })
    .then(() => refreshFollowedGuides(() => void shelf.refresh()))
    .catch((err) => console.warn('TMDB catch-up failed:', err));
}

/** Shown when the page is opened outside the Android app. */
function androidOnly() {
  const msg = document.createElement('div');
  msg.className = 'msg-error';
  msg.style.margin = '3rem 1.5rem';
  const link = document.createElement('a');
  link.href = 'https://github.com/not-mehul/BookShelf/releases/latest';
  link.textContent = 'Get the Android app';
  msg.append('BookShelf is an Android app; it doesn’t run in a browser. ', link, '.');
  document.getElementById('app')?.replaceChildren(msg);
}

if (inShell || import.meta.env.DEV) {
  boot().catch((err) => {
    console.error(err);
    const msg = document.createElement('div');
    msg.className = 'msg-error';
    msg.style.margin = '3rem 1.5rem';
    msg.textContent = `Failed to start: ${messageOf(err)}`;
    document.getElementById('app')?.replaceChildren(msg);
  });
} else {
  androidOnly();
}
