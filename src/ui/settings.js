import { el, clear } from './components.js';
import { getSetting, setSetting, removeSetting } from '../util/settings.js';

export async function renderSettings(container) {
  clear(container);

  const panel = el('div', { class: 'panel' });

  panel.appendChild(el('div', { class: 'label-eyebrow' }, 'API access'));
  panel.appendChild(
    el(
      'p',
      {
        style: 'font-family: \'Iowan Old Style\', Baskerville, Georgia, serif; font-style: italic; color: var(--text-dim); margin: 0.5rem 0 1.5rem;'
      },
      'Keys stay on this device. Only you run this app.'
    )
  );

  // TheTVDB key + PIN
  panel.appendChild(
    await fieldGroup({
      label: 'TheTVDB API key',
      hint: 'Project key from your account at thetvdb.com. Required for movies and TV.',
      key: 'tvdb_api_key',
      type: 'password'
    })
  );
  panel.appendChild(
    await fieldGroup({
      label: 'TheTVDB subscriber PIN',
      hint: 'Your personal subscriber PIN. Leave empty if your project key uses a negotiated license.',
      key: 'tvdb_pin',
      type: 'password'
    })
  );

  // Google Books key (optional)
  panel.appendChild(
    await fieldGroup({
      label: 'Google Books API key (optional)',
      hint: 'Lifts the daily quota. Books search works without one, but may rate-limit.',
      key: 'google_books_api_key',
      type: 'password'
    })
  );

  // Cached token bookkeeping
  const tokenIssued = parseInt(await getSetting('tvdb_token_issued', '0'), 10);
  const issuedText = tokenIssued
    ? new Date(tokenIssued).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
    : 'never';
  const tokenInfo = el(
    'div',
    {
      class: 'field-hint',
      style: 'margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--border-faint);'
    }
  );
  tokenInfo.innerHTML = `<strong style="font-style: normal; color: var(--text-dim);">TVDB token cached:</strong> ${issuedText}`;
  panel.appendChild(tokenInfo);

  const clearTokenBtn = el(
    'button',
    {
      type: 'button',
      class: 'btn btn-muted',
      style: 'margin-top: 0.75rem;',
      onClick: async () => {
        await removeSetting('tvdb_token');
        await removeSetting('tvdb_token_issued');
        renderSettings(container);
      }
    },
    'Clear cached token'
  );
  panel.appendChild(clearTokenBtn);

  container.appendChild(panel);
}

async function fieldGroup({ label, hint, key, type = 'text' }) {
  const wrap = el('div', { class: 'field' });
  wrap.appendChild(el('label', { class: 'label-field', for: `f-${key}` }, label));

  const initial = await getSetting(key, '');
  const input = el('input', {
    id: `f-${key}`,
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
    }, 250);
  });
  wrap.appendChild(input);
  if (hint) wrap.appendChild(el('div', { class: 'field-hint' }, hint));
  return wrap;
}
