// BookShelf — app entry point: applies the theme, loads the shelf and mounts
// the Svelte UI, then wires up everything that arrives from outside (the
// Android shell, the PWA share target, sync).

import { mount } from 'svelte';
import App from './components/App.svelte';
import { refreshFollowedGuides } from './api/episode-sync';
import { installNativeBridge, isNativeShell, notifyNativeReady, onNativeEvent } from './platform/native';
import { initTheme } from './platform/theme';
import { shelf } from './state/shelf.svelte';
import { ui } from './state/ui.svelte';
import { messageOf } from './util/errors';
import { parseSharedText, type SharedInput } from './util/share-intake';

// Must run before anything fetches: routes cross-origin calls through the
// Android shell's native HTTP. A no-op in a plain browser.
installNativeBridge();

function openShared(shared: SharedInput) {
  ui.openAdd({ prefill: parseSharedText(shared) });
}

async function boot(): Promise<void> {
  await initTheme();
  await shelf.refresh();

  const target = document.getElementById('app')!;
  target.replaceChildren();
  mount(App, { target });

  // Text shared from another app (Android share sheet) …
  onNativeEvent('shared', (data) => openShared(data || {}));
  // … the home-screen widget's "+" button …
  onNativeEvent('openAdd', () => ui.openAdd());
  // … or a new-episode notification (open that show).
  onNativeEvent('openEntry', (data) => data?.id && ui.openEntry(String(data.id)));

  // The installed PWA's Web Share Target (manifest share_target).
  const params = new URLSearchParams(location.search);
  if (['share-text', 'share-title', 'share-url'].some((k) => params.has(k))) {
    history.replaceState(null, '', location.pathname);
    openShared({
      text: params.get('share-text') || '',
      subject: params.get('share-title') || '',
      url: params.get('share-url') || ''
    });
  }

  // Encrypted folder sync (Android app, once configured): pull now, push after changes.
  shelf.startSync();
  // Refresh episode guides of shows being followed (quietly; needs TheTVDB).
  void refreshFollowedGuides(() => void shelf.refresh());

  // Booted: the shell may now deliver events it queued during startup.
  notifyNativeReady();
}

boot().catch((err) => {
  console.error(err);
  const msg = document.createElement('div');
  msg.className = 'msg-error';
  msg.style.margin = '3rem 1.5rem';
  msg.textContent = `Failed to start: ${messageOf(err)}`;
  document.getElementById('app')?.replaceChildren(msg);
});

// Register the service worker for offline support (web/PWA only). The native
// Android shell already bundles the app, so skip it there.
if ('serviceWorker' in navigator && !isNativeShell()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW registration failed', err));
  });
}
