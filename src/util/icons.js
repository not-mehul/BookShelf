// Inlined Lucide icons (MIT). stroke="currentColor" so they inherit text color.

const wrap = (inner, size = 16, stroke = 2) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

export const icons = {
  moon: () => wrap('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>', 14, 2.2),
  sun: () => wrap('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>', 14, 2.2),
  search: () => wrap('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
  x: () => wrap('<path d="M18 6 6 18M6 6l12 12"/>'),
  plus: () => wrap('<path d="M5 12h14M12 5v14"/>'),
  trash: () => wrap('<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1.2 14a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 6"/><path d="M10 11v6M14 11v6"/>'),
  download: () => wrap('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>'),
  settings: () => wrap('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  star: () => wrap('<path d="M12 2 14.9 8.6 22 9.3l-5.4 4.9 1.6 7.1L12 17.8 5.8 21.3l1.6-7.1L2 9.3l7.1-.7Z"/>'),
  bookmark: () => wrap('<path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>'),
  book: () => wrap('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
  film: () => wrap('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 7.5h4M3 12h18M3 16.5h4M17 7.5h4M17 16.5h4"/>'),
  tv: () => wrap('<rect x="2" y="7" width="20" height="15" rx="2"/><path d="m17 2-5 5-5-5"/>'),
  quote: () => wrap('<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>'),
  arrowLeft: () => wrap('<path d="M19 12H5M12 19l-7-7 7-7"/>'),
  check: () => wrap('<path d="M20 6 9 17l-5-5"/>'),
  edit: () => wrap('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  share: () => wrap('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>'),
  chart: () => wrap('<path d="M3 3v18h18"/><rect x="7" y="10" width="3" height="7"/><rect x="12" y="6" width="3" height="11"/><rect x="17" y="13" width="3" height="4"/>'),
  barcode: () => wrap('<path d="M3 5v14M7 5v14M11 5v14M14 5v14M18 5v14M21 5v14" stroke-width="1.6"/><path d="M8.5 5v14M16 5v14" stroke-width="2.6"/>'),
  queue: () => wrap('<path d="M10 6h11M10 12h11M10 18h11"/><path d="M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>'),
  grip: () => wrap('<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>'),
  arrowUp: () => wrap('<path d="M12 19V5M5 12l7-7 7 7"/>'),
  arrowDown: () => wrap('<path d="M12 5v14M19 12l-7 7-7-7"/>'),
  shuffle: () => wrap('<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>'),
  select: () => wrap('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m8 12 3 3 5-6"/>'),
  image: () => wrap('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>'),
  bell: () => wrap('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>'),
  tag: () => wrap('<path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.8 8.8a2 2 0 0 0 2.8 0l6.4-6.4a2 2 0 0 0 0-2.8Z"/><circle cx="7.5" cy="7.5" r="1.3"/>')
};
