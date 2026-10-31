import { el, clear, messageOf } from './components.js';
import { icons } from '../util/icons.js';
import { getSetting, setSetting, removeSetting } from '../util/settings.js';
import { openModal, closeModal } from './detail-modal.js';
import { buildThemeToggle } from './theme.js';
import { isNativeShell } from '../platform/native.js';
import { importMarkdown } from '../export/import.js';
import { importJson, saveAndShareJson } from '../export/json.js';
import { syncSupported, getSyncStatus, chooseSyncFolder, forgetSyncFolder, syncNow } from '../sync/sync.js';

// Open Settings as a modal (the app no longer has a Settings tab).
/** @param {{ onChanged?: () => void }} [listener] Called after data changes (e.g. an import). */
export function openSettings({ onChanged } = {}) {
  openModal((card) => {
    clear(card);
    const closeBtn = el('button', {
      type: 'button', class: 'btn-icon modal-close', 'aria-label': 'Close', onClick: closeModal
    });
    closeBtn.innerHTML = icons.x();
    card.appendChild(closeBtn);

    card.appendChild(el('div', { class: 'add-head' },
      el('div', { class: 'modal-eyebrow' }, 'Settings'),
      el('h2', { class: 'add-title', id: 'modal-title', tabindex: '-1' }, 'Preferences')
    ));

    const body = el('div', { class: 'settings-modal-body' });
    card.appendChild(body);
    renderSettings(body, { onChanged });
  });
}

/**
 * @param {HTMLElement} container
 * @param {{ onChanged?: () => void }} [listener]
 */
export async function renderSettings(container, { onChanged } = {}) {
  clear(container);

  // ── Appearance ─────────────────────────────────────────────────

  container.appendChild(sectionHeading('Appearance'));

  const themeRow = el('div', { class: 'theme-setting-row' });
  themeRow.appendChild(el('div', { class: 'theme-setting-text' },
    el('div', { class: 'theme-setting-label' }, 'Theme'),
    el('div', { class: 'theme-setting-sub' }, 'Dusk (dark) or Dawn (light)')
  ));
  themeRow.appendChild(buildThemeToggle());
  container.appendChild(themeRow);

  container.appendChild(el('hr', { class: 'divider', style: 'margin: 2rem 0' }));

  // ── TheTVDB ────────────────────────────────────────────────────

  container.appendChild(sectionHeading('TheTVDB'));

  container.appendChild(await fieldGroup({
    label: 'API key',
    hint:  'Project key from thetvdb.com — required for movie and TV search.',
    key:   'tvdb_api_key',
    type:  'password'
  }));

  container.appendChild(await fieldGroup({
    label: 'Subscriber PIN',
    hint:  'Your personal subscriber PIN. Leave blank if using a negotiated-license project key.',
    key:   'tvdb_pin',
    type:  'password'
  }));

  container.appendChild(await fieldGroup({
    label: 'Proxy URL (optional)',
    hint:  'Use a BookShelf TheTVDB proxy (see proxy/ in the repo) instead of entering an API key on this device.',
    key:   'tvdb_proxy_url',
    type:  'url'
  }));

  container.appendChild(await fieldGroup({
    label: 'Proxy access token',
    hint:  'Only if your proxy was deployed with a PROXY_TOKEN.',
    key:   'tvdb_proxy_token',
    type:  'password'
  }));

  // Cached token status
  const tokenIssued = parseInt(await getSetting('tvdb_token_issued', '0'), 10);
  const issuedText = tokenIssued
    ? new Date(tokenIssued).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
    : 'not yet cached';

  const tokenRow = el('div', { class: 'token-info-row' });
  const tokenText = el('p', { class: 'token-info-text' });
  tokenText.innerHTML = `Token last refreshed: <strong>${issuedText}</strong>`;
  const clearTokenBtn = el('button', {
    type: 'button',
    class: 'btn btn-muted',
    onClick: async () => {
      await removeSetting('tvdb_token');
      await removeSetting('tvdb_token_issued');
      renderSettings(container);
    }
  }, 'Clear cached token');
  tokenRow.appendChild(tokenText);
  tokenRow.appendChild(clearTokenBtn);
  container.appendChild(tokenRow);

  container.appendChild(el('hr', { class: 'divider', style: 'margin: 2rem 0' }));

  // ── Google Books ───────────────────────────────────────────────

  container.appendChild(sectionHeading('Google Books'));

  container.appendChild(await fieldGroup({
    label: 'API key (optional)',
    hint:  'Raises the anonymous daily quota. Book search works without a key, but may rate-limit.',
    key:   'google_books_api_key',
    type:  'password'
  }));

  container.appendChild(el('hr', { class: 'divider', style: 'margin: 2rem 0' }));

  // ── Browser Compatibility ────────────────────────────────────

  if (!isNativeShell()) {
    container.appendChild(sectionHeading('Browser Compatibility'));
    container.appendChild(await fieldGroup({
      label: 'CORS Proxy (Browser only)',
      hint:  'In a plain browser, TheTVDB blocks cross-origin requests. Set the base URL of a CORS proxy you trust/run to enable movie & TV search. The Android app does not need this. Leave blank otherwise.',
      key:   'cors_proxy',
      type:  'url'
    }));
    container.appendChild(el('hr', { class: 'divider', style: 'margin: 2rem 0' }));
  }

  // ── Sync (Android app) ───────────────────────────────────────

  if (syncSupported()) {
    await renderSyncSection(container, onChanged);
    container.appendChild(el('hr', { class: 'divider', style: 'margin: 2rem 0' }));
  }

  // ── Data Management ──────────────────────────────────────────

  container.appendChild(sectionHeading('Backup & Data'));

  // Inline status line (native WebView has no window.alert).
  const notice = el('div', { class: 'settings-notice', role: 'status', 'aria-live': 'polite' });
  const say = (msg, kind = 'ok') => {
    notice.className = `settings-notice settings-notice-${kind}`;
    notice.textContent = msg;
  };

  container.appendChild(el('p', { class: 'field-hint' },
    'JSON is a complete, lossless backup (covers included) and is safe to re-import. Markdown import is best-effort for older exports.'));

  // JSON backup
  const backupBtn = el('button', { type: 'button', class: 'btn btn-primary' }, 'Export JSON backup');
  backupBtn.addEventListener('click', async () => {
    backupBtn.disabled = true;
    try {
      const { method, filename } = await saveAndShareJson();
      say(method === 'native' ? 'Backup shared.' : `Downloaded ${filename}.`);
    } catch (err) {
      say('Backup failed: ' + messageOf(err), 'err');
    } finally {
      backupBtn.disabled = false;
    }
  });

  const jsonInput = el('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
  jsonInput.addEventListener('change', () => {
    readFileThen(jsonInput, importBtnJson, async (text) => {
      const { imported, skippedExisting } = await importJson(text);
      say(`Imported ${imported} entries${skippedExisting ? `, skipped ${skippedExisting} existing` : ''}.`);
      onChanged?.();
    }, say);
  });
  const importBtnJson = el('button', {
    type: 'button', class: 'btn btn-muted', onClick: () => jsonInput.click()
  }, 'Import JSON');

  const mdInput = el('input', { type: 'file', accept: '.md,text/markdown', style: 'display:none' });
  mdInput.addEventListener('change', () => {
    readFileThen(mdInput, importBtnMd, async (text) => {
      const count = await importMarkdown(text);
      say(`Imported ${count} entries from Markdown.`);
      onChanged?.();
    }, say);
  });
  const importBtnMd = el('button', {
    type: 'button', class: 'btn btn-muted', onClick: () => mdInput.click()
  }, 'Import Markdown');

  const btnRow = el('div', { class: 'settings-btn-row' }, backupBtn, importBtnJson, importBtnMd);
  container.append(jsonInput, mdInput, btnRow, notice);
}

// Read a chosen file as text and run `handler`, toggling the button's busy
// state and surfacing errors through `say` (no window.alert — unsupported in
// the Android WebView).
function readFileThen(fileInput, btn, handler, say) {
  const file = fileInput.files[0];
  if (!file) return;
  const original = btn.textContent;
  btn.textContent = 'Importing…';
  btn.disabled = true;
  const done = () => { btn.textContent = original; btn.disabled = false; fileInput.value = ''; };

  const reader = new FileReader();
  reader.onload = async () => {
    try { await handler(reader.result); }
    catch (err) { say('Import failed: ' + messageOf(err), 'err'); }
    finally { done(); }
  };
  reader.onerror = () => { say('Failed to read file.', 'err'); done(); };
  reader.readAsText(file);
}

/**
 * Encrypted folder sync: folder picker, passphrase, status and actions.
 * Re-renders itself in place after each action.
 * @param {HTMLElement} container
 * @param {(() => void) | undefined} onChanged
 */
async function renderSyncSection(container, onChanged) {
  const section = el('div', { class: 'sync-section' });
  container.appendChild(section);

  async function render() {
    clear(section);
    section.appendChild(sectionHeading('Sync'));
    section.appendChild(el('p', { class: 'field-hint' },
      'Keeps an end-to-end encrypted copy of your shelf in a folder — e.g. one synced by Google Drive, Nextcloud or Syncthing — and merges changes from your other devices.'));

    const status = await getSyncStatus();
    const folderRow = el('div', { class: 'token-info-row' });
    const folderText = el('p', { class: 'token-info-text' }, 'Folder: ');
    folderText.appendChild(el('strong', {}, status ? status.folderName : 'not chosen'));
    const chooseBtn = el('button', { type: 'button', class: 'btn btn-muted' }, status ? 'Change folder' : 'Choose folder');
    chooseBtn.addEventListener('click', async () => {
      chooseBtn.disabled = true;
      try { await chooseSyncFolder(); } catch (err) { say(messageOf(err), 'err'); }
      await render();
    });
    folderRow.append(folderText, chooseBtn);
    section.appendChild(folderRow);

    section.appendChild(await fieldGroup({
      label: 'Sync passphrase',
      hint: 'Use the same passphrase on every device. It encrypts the sync file and cannot be recovered if lost.',
      key: 'sync_passphrase',
      type: 'password'
    }));

    const notice = el('div', { class: 'settings-notice', role: 'status', 'aria-live': 'polite' });
    /** @param {string} msg @param {'ok' | 'err'} [kind] */
    const say = (msg, kind = 'ok') => {
      notice.className = `settings-notice settings-notice-${kind}`;
      notice.textContent = msg;
    };
    const last = await getSetting('sync_last');
    const lastError = await getSetting('sync_last_error');
    if (lastError) say(`Last sync failed: ${lastError}`, 'err');
    else if (last) say(`Last synced ${new Date(last).toLocaleString()}`);

    if (status) {
      const syncBtn = el('button', { type: 'button', class: 'btn btn-primary' }, 'Sync now');
      syncBtn.addEventListener('click', async () => {
        syncBtn.disabled = true;
        say('Syncing…');
        try {
          const r = await syncNow();
          say(r.pulled || r.removed
            ? `Synced — ${r.pulled} updated, ${r.removed} removed on this device.`
            : 'Synced — already up to date.');
          if (r.pulled || r.removed) onChanged?.();
        } catch (err) {
          say(messageOf(err), 'err');
        } finally {
          syncBtn.disabled = false;
        }
      });
      const stopBtn = el('button', { type: 'button', class: 'btn btn-muted' }, 'Stop syncing');
      stopBtn.addEventListener('click', async () => {
        await forgetSyncFolder();
        await render();
      });
      section.appendChild(el('div', { class: 'settings-btn-row' }, syncBtn, stopBtn));
    }
    section.appendChild(notice);
  }
  await render();
}

function sectionHeading(label) {
  return el('div', { class: 'settings-section-heading' }, label);
}

async function fieldGroup({ label, hint, key, type = 'text' }) {
  const wrap = el('div', { class: 'field' });

  const id = `setting-${key}`;
  wrap.appendChild(el('label', { class: 'label-field', for: id }, label));

  const initial = await getSetting(key, '');
  const input = el('input', {
    id,
    type,
    class: 'input input-mono',
    value: initial,
    autocomplete: 'off',
    spellcheck: 'false'
  });

  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (input.value) await setSetting(key, input.value);
      else await removeSetting(key);
    }, 280);
  });

  wrap.appendChild(input);
  if (hint) wrap.appendChild(el('div', { class: 'field-hint' }, hint));
  return wrap;
}
