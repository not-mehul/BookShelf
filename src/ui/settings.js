import { el, clear } from './components.js';
import { icons } from '../util/icons.js';
import { getSetting, setSetting, removeSetting } from '../util/settings.js';
import { openModal, closeModal } from './detail-modal.js';
import { buildThemeToggle } from './theme.js';
import { importMarkdown } from '../export/import.js';

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
      el('h2', { class: 'add-title' }, 'Preferences')
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

  if (!window.AndroidHttp) {
    container.appendChild(sectionHeading('Browser Compatibility'));
    container.appendChild(await fieldGroup({
      label: 'CORS Proxy (Browser only)',
      hint:  'If running in a plain browser, TheTVDB API requires a CORS proxy (e.g. https://cors-anywhere.herokuapp.com/). Leave blank if not needed.',
      key:   'cors_proxy',
      type:  'url'
    }));
    container.appendChild(el('hr', { class: 'divider', style: 'margin: 2rem 0' }));
  }

  // ── Data Management ──────────────────────────────────────────

  container.appendChild(sectionHeading('Data Management'));

  const dataRow = el('div', { class: 'token-info-row' });
  const dataText = el('p', { class: 'token-info-text' }, 'Import entries from a previously exported Markdown file.');

  const fileInput = el('input', { type: 'file', accept: '.md', style: 'display:none' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;

    const importBtn = dataRow.querySelector('.btn-import');
    const originalText = importBtn.textContent;
    importBtn.textContent = 'Importing...';
    importBtn.disabled = true;

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const count = await importMarkdown(reader.result);
          alert(`Successfully imported ${count} entries.`);
          onChanged?.();
        } catch (err) {
          alert('Import failed: ' + err.message);
        } finally {
          importBtn.textContent = originalText;
          importBtn.disabled = false;
          fileInput.value = '';
        }
      };
      reader.onerror = () => {
        alert('Failed to read file.');
        importBtn.textContent = originalText;
        importBtn.disabled = false;
      };
      reader.readAsText(file);
    } catch (err) {
      console.error(err);
      alert('Import failed: ' + err.message);
      importBtn.textContent = originalText;
      importBtn.disabled = false;
    }
  });

  const importBtn = el('button', {
    type: 'button',
    class: 'btn btn-primary btn-import',
    onClick: () => fileInput.click()
  }, 'Import Markdown');

  dataRow.appendChild(dataText);
  dataRow.appendChild(importBtn);
  container.appendChild(fileInput);
  container.appendChild(dataRow);
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
