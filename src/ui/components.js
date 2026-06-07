// Minimal DOM helpers used across all screens.

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class')   node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v === true) node.setAttribute(k, '');
    else if (v === false || v == null) { /* skip */ }
    else node.setAttribute(k, v);
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

// Wrap a <select> element with the custom-arrow container.
export function selectWrap(selectEl, compact = false) {
  const wrap = el('div', { class: compact ? 'select-wrap select-wrap-sm' : 'select-wrap' });
  wrap.appendChild(selectEl);
  return wrap;
}

export function segmented(options, currentValue, onChange) {
  // Track current selection internally — the control persists across grid
  // re-renders, so a captured `currentValue` would go stale (and the
  // originally-active option could never be re-selected).
  let current = currentValue;
  const seg = el('div', { class: 'segmented', role: 'tablist' });
  for (const opt of options) {
    const btn = el(
      'button',
      {
        type: 'button',
        role: 'tab',
        class: opt.value === currentValue ? 'active' : '',
        onClick: () => {
          if (opt.value === current) return;
          current = opt.value;
          for (const c of seg.children) c.classList.remove('active');
          btn.classList.add('active');
          onChange(opt.value);
        }
      },
      opt.label
    );
    seg.appendChild(btn);
  }
  // Wrap in scroll container so wide controls don't overflow on narrow screens
  const scroll = el('div', { class: 'seg-scroll' });
  scroll.appendChild(seg);
  return scroll;
}

export function loadingNode(label = 'Loading') {
  return el('div', { class: 'loading-row' }, label);
}

export function noticeNode(html) {
  return el('div', { class: 'notice', html });
}

export function errorNode(message) {
  return el('div', { class: 'msg-error' }, message);
}
