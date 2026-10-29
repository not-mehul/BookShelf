import { el, clear } from './components.js';
import { icons } from '../util/icons.js';
import { getSetting, setSetting, removeSetting } from '../util/settings.js';
import { openModal, closeModal } from './detail-modal.js';
import { buildThemeToggle } from './theme.js';
import { isNativeShell } from '../platform/native.js';
import { importMarkdown } from '../export/import.js';
import { importJson, saveAndShareJson } from '../export/json.js';

// Open Settings as a modal (the app no longer has a Settings tab).
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
      say('Backup failed: ' + err.message, 'err');
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
    catch (err) { say('Import failed: ' + err.message, 'err'); }
    finally { done(); }
  };
  reader.onerror = () => { say('Failed to read file.', 'err'); done(); };
  reader.readAsText(file);
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
