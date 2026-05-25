import { el, clear } from './components.js';
import { getSetting, setSetting, removeSetting } from '../util/settings.js';

export async function renderSettings(container) {
  clear(container);

  // ── Intro ──────────────────────────────────────────────────────

  container.appendChild(
    el('p', { class: 'settings-intro' },
      el('strong', {}, 'Keys stay on this device.'),
      ' This is a personal app — nothing is sent to any server of ours. ' +
      'API calls go directly from your browser to TheTVDB and Google.'
    )
  );

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
