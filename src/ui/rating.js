import { el } from './components.js';
import { icons } from '../util/icons.js';

// 5-star rating control with a clear option. value is an integer 0–5 or null.
export function ratingControl(initial, onChange) {
  let value = initial ?? null;
  const wrap = el('div', { class: 'rating-row' });
  const stars = [];

  const render = () => {
    stars.forEach((btn, i) => {
      const active = value != null && i < value;
      btn.classList.toggle('active', active);
    });
    clearBtn.style.display = value != null ? '' : 'none';
  };

  for (let i = 0; i < 5; i++) {
    const btn = el(
      'button',
      {
        type: 'button',
        class: 'rating-star',
        'aria-label': `${i + 1} of 5`,
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

export function displayRating(value) {
  if (value == null) return '— unrated';
  const full = '★'.repeat(value);
  const empty = '☆'.repeat(5 - value);
  return `${full}${empty}  ${value}/5`;
}
