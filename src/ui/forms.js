// Shared form-field builders used by the add-flow and the edit form.
// Centralized here so both flows stay visually and behaviourally identical.

import { el } from './components.js';

export function fieldInput(label, id, placeholder, value = '') {
  const field = el('div', { class: 'field' });
  field.appendChild(el('label', { class: 'label-field', for: id }, label));
  const input = el('input', { id, type: 'text', class: 'input', placeholder, autocomplete: 'off' });
  if (value) input.value = value;
  field.appendChild(input);
  return { field, input };
}

export function fieldTextarea(label, id, placeholder, rows, value = '') {
  const field = el('div', { class: 'field' });
  field.appendChild(el('label', { class: 'label-field', for: id }, label));
  const input = el('textarea', { id, class: 'textarea', placeholder, rows: String(rows) });
  if (value) input.value = value;
  field.appendChild(input);
  return { field, input };
}

export function twoCol(a, b) {
  return el('div', { class: 'modal-two-col' }, a, b);
}

// "a, b , c" → ["a", "b", "c"]; empty/whitespace entries dropped.
export function splitList(value) {
  return (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
