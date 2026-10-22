import { el } from './components.js';
import { icons } from '../util/icons.js';

// 5-star rating control with a clear option. value is an integer 0–5 or null.
export function ratingControl(initial, onChange) {
  let value = initial ?? null;
  const wrap = el('div', { class: 'rating-row', role: 'radiogroup', 'aria-label': 'Rating' });
  const stars = [];

  const render = () => {
    stars.forEach((btn, i) => {
      const active = value != null && i < value;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-checked', value === i + 1 ? 'true' : 'false');
    });
    clearBtn.style.display = value != null ? '' : 'none';
  };

  for (let i = 0; i < 5; i++) {
    const btn = el(
      'button',
      {
        type: 'button',
        class: 'rating-star',
        role: 'radio',
        'aria-checked': 'false',
        'aria-label': `${i + 1} star${i ? 's' : ''}`,
        onClick: () => {
          value = value === i + 1 ? i : i + 1;
          if (value === 0) value = null;
          render();
          onChange(value);
        }
      }
    );
    btn.innerHTML = icons.star();
    stars.push(btn);
    wrap.appendChild(btn);
  }

  const clearBtn = el(
    'button',
    {
      type: 'button',
      class: 'rating-clear',
      onClick: () => {
        value = null;
        render();
        onChange(value);
      }
    },
    'Clear'
  );
  wrap.appendChild(clearBtn);

  render();
  return wrap;
}
