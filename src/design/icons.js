// WELOS line icons: 24 px grid, 1.6 px stroke, drawn for this product (no icon library).
// Colour comes from `currentColor`; the energy/water meaning comes from the class the caller sets.
const svg = (body, label) =>
  `<svg class="ico" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}>${body}</svg>`;

const P = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
  wind: '<path d="M3 8.5h10.5a2.5 2.5 0 1 0-2.5-2.5"/><path d="M3 12.5h15a2.5 2.5 0 1 1-2.5 2.5"/><path d="M3 16.5h7"/>',
  battery: '<rect x="3" y="7" width="16" height="10" rx="1.5"/><path d="M21 10.5v3"/><path d="M6 10v4M9 10v4M12 10v4"/>',
  grid: '<path d="M12 3 7 21M12 3l5 18M8.4 15.5h7.2M9.6 10.5h4.8M5 7h14M12 3v4"/>',
  home: '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>',
  drop: '<path d="M12 3.2S6 9.6 6 14a6 6 0 0 0 12 0c0-4.4-6-10.8-6-10.8z"/><path d="M9.2 14.6a2.9 2.9 0 0 0 2.4 2.6"/>',
  dust: '<rect x="3" y="5" width="18" height="12" rx="1"/><path d="M3 11h18M9 5v12M15 5v12"/><circle cx="6" cy="8" r=".6" fill="currentColor"/><circle cx="12.5" cy="13.5" r=".6" fill="currentColor"/><circle cx="18" cy="8.5" r=".6" fill="currentColor"/><path d="M7 21h10"/>',
  shield: '<path d="M12 3 5 6v5.5c0 4.4 3 8 7 9.5 4-1.5 7-5.1 7-9.5V6l-7-3z"/><path d="m9 12 2 2 4-4"/>',
  bill: '<path d="M6 3h12v18l-2-1.4L14 21l-2-1.4-2 1.4-2-1.4L6 21V3z"/><path d="M9 8h6M9 11.5h6M9 15h3.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  tank: '<path d="M6 5h12v14.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19.5V5z"/><path d="M4.5 5h15"/><path d="M6 13c2-1.2 4-1.2 6 0s4 1.2 6 0"/>',
  coin: '<ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7"/><path d="M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>',
  leaf: '<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z"/><path d="M5 19 13 11"/>',
  panel: '<path d="M4 15 7 6h13l-3 9H4z"/><path d="M5.5 10.5h13M10 6l-1.5 9M14.5 6 13 15"/><path d="M10.5 15v4M8 19h5"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="1.5"/><rect x="9.5" y="9.5" width="5" height="5"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
  cube: '<path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
  explode: '<path d="M12 3v5M12 16v5M3 12h5M16 12h5"/><path d="m9 5 3-2 3 2M9 19l3 2 3-2M5 9l-2 3 2 3M19 9l2 3-2 3"/><rect x="10" y="10" width="4" height="4"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/>',
  villa: '<path d="M2.5 20.5h19"/><path d="M4 20.5V11l6-4.5 6 4.5v9.5"/><path d="M16 13h4.5v7.5"/><path d="M8 20.5v-4h4v4"/>',
  block: '<path d="M2.5 20.5h19"/><rect x="6" y="4" width="12" height="16.5"/><path d="M9 7.5h2M13 7.5h2M9 11h2M13 11h2M9 14.5h2M13 14.5h2"/>',
  plant: '<path d="M2.5 20.5h19"/><path d="M3.5 20.5v-8l5 3v-3l5 3v-3l5 3V20.5"/><path d="M18.5 15.5V5h2v15.5"/>',
};

export const icon = (name, label) => svg(P[name] || "", label);
export const ICONS = Object.keys(P);
