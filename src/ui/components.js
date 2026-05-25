// Small DOM helpers used across screens.

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v === true) node.setAttribute(k, '');
    else if (v === false || v == null) {
      /* skip */
    } else node.setAttribute(k, v);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function segmented(options, currentValue, onChange) {
  const wrap = el('div', { class: 'segmented', role: 'tablist' });
  for (const opt of options) {
    const btn = el(
      'button',
      {
        type: 'button',
        role: 'tab',
        class: opt.value === currentValue ? 'active' : '',
        onClick: () => {
          if (opt.value === currentValue) return;
          for (const c of wrap.children) c.classList.remove('active');
          btn.classList.add('active');
          onChange(opt.value);
        }
      },
      opt.label
    );
    wrap.appendChild(btn);
  }
  return wrap;
}

export function loadingNode(label = 'Loading') {
  return el('div', { class: 'loading' }, label);
}

export function notice(message) {
  return el('div', { class: 'notice', html: message });
}

export function errorNode(message) {
  return el('div', { class: 'error' }, message);
}
