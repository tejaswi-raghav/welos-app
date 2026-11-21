// Visual explainers: each turns one engine number into something you can see.
// Pure functions returning SVG/HTML strings, so the landing (vanilla) and the
// Studio (React, via dangerouslySetInnerHTML) draw the same pictures.
// Animations are CSS keyframes that run when the root has class "in".
import { icon } from "../design/icons.js";

const n0 = (x) => Math.round(x).toLocaleString("en-US");
const n1 = (x) => (Math.round(x * 10) / 10).toLocaleString("en-US");
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

/** 10×10 grid: each square is 1% of something. `pct` squares lit. */
export function waffle(pct, { tone = "sun", label = "" } = {}) {
  const on = Math.round(clamp(pct / 100) * 100);
  let cells = "";
  for (let i = 0; i < 100; i++) {
    const x = (i % 10) * 11, y = Math.floor(i / 10) * 11;
    cells += `<rect x="${x}" y="${y}" width="9" height="9" rx="1.5" class="${i < on ? `w-on ${tone}` : "w-off"}" style="--i:${i}"/>`;
  }
  return `<svg class="v-waffle" viewBox="0 0 108 108" role="img" aria-label="${label || `${on} of 100 squares`}">${cells}</svg>`;
}

/** One small panel per module (grouped if there are many). */
export function panels(modules, maxModules) {
  const per = modules > 48 ? Math.ceil(modules / 48) : 1;
  const shown = Math.ceil(modules / per), slots = Math.max(shown, Math.ceil(maxModules / per));
  const cols = Math.min(12, Math.max(6, Math.ceil(Math.sqrt(slots * 2))));
  const rows = Math.ceil(slots / cols);
  let g = "";
  for (let i = 0; i < slots; i++) {
    const x = (i % cols) * 14, y = Math.floor(i / cols) * 10;
    g += `<rect x="${x}" y="${y}" width="12" height="8" rx="1" class="${i < shown ? "p-on" : "p-free"}" style="--i:${i}"/>`;
  }
  return `<svg class="v-panels" viewBox="-1 -1 ${cols * 14} ${rows * 10 + 1}" role="img" aria-label="${modules} solar modules${per > 1 ? `, each tile is ${per}` : ""}">${g}</svg>`;
}

/** Battery drawn as cells; a marker shows what one night needs. */
export function battery(kwh, needKwh, { reservePct = 0 } = {}) {
  const cap = Math.max(kwh, needKwh) * 1.05;
  const W = 150, fill = (kwh / cap) * W, need = (needKwh / cap) * W, res = reservePct ? (reservePct / 100) * fill : 0;
  return `<svg class="v-battery" viewBox="-2 -14 168 46" role="img" aria-label="${n0(kwh)} kWh battery${needKwh ? `; a night needs about ${n0(needKwh)} kWh` : ""}">
    <rect x="0" y="0" width="${W + 4}" height="24" rx="3" class="b-shell"/><rect x="${W + 5}" y="7" width="4" height="10" rx="1" class="b-shell"/>
    <rect x="2" y="2" width="${fill}" height="20" rx="2" class="b-fill"/>
    ${res ? `<rect x="2" y="2" width="${res}" height="20" rx="2" class="b-res"/>` : ""}
    ${needKwh ? `<line x1="${need + 2}" x2="${need + 2}" y1="-6" y2="30" class="b-need"/><text x="${need + 2}" y="-8" class="b-t" text-anchor="middle">night</text>` : ""}
  </svg>`;
}

/** Litres as 150 L bathtubs (familiar), switching to a cube for big volumes. */
export function bathtubs(litres) {
  const tubs = litres / 150;
  if (tubs > 16) return cube(litres);
  const whole = Math.floor(tubs), part = tubs - whole, n = Math.ceil(tubs);
  let g = "";
  for (let i = 0; i < n; i++) {
    const x = i * 34, f = i < whole ? 1 : part;
    g += `<g transform="translate(${x} 0)" style="--i:${i}" class="tub"><path d="M2 8h28v6a8 8 0 0 1-8 8H10a8 8 0 0 1-8-8V8z" class="t-shell"/><clipPath id="tc${i}"><path d="M2 8h28v6a8 8 0 0 1-8 8H10a8 8 0 0 1-8-8V8z"/></clipPath><rect x="2" y="${8 + 14 * (1 - f)}" width="28" height="14" clip-path="url(#tc${i})" class="t-water"/><path d="M8 22l-2 4M24 22l2 4" class="t-shell"/></g>`;
  }
  return `<svg class="v-tubs" viewBox="0 0 ${n * 34} 28" role="img" aria-label="${n1(tubs)} bathtubs of about 150 litres">${g}</svg>`;
}

/** A cube of water drawn to scale beside a 1.75 m person. */
export function cube(litres) {
  const side = Math.cbrt(litres / 1000); // metres
  const S = 34; // px per metre
  const s = side * S, dx = s * 0.5, dy = s * 0.28, base = 90;
  const x0 = 70, y0 = base;
  const front = `M${x0} ${y0} h${s} v${-s} h${-s} Z`;
  const top = `M${x0} ${y0 - s} l${dx} ${-dy} h${s} l${-dx} ${dy} Z`;
  const right = `M${x0 + s} ${y0} l${dx} ${-dy} v${-s} l${-dx} ${dy} Z`;
  const ph = 1.75 * S;
  const person = `<g class="c-person" transform="translate(30 ${base})"><circle cx="0" cy="${-ph + 6}" r="6"/><path d="M0 ${-ph + 13} V${-ph * 0.42} M0 ${-ph * 0.42} l-7 ${ph * 0.42} M0 ${-ph * 0.42} l7 ${ph * 0.42} M-9 ${-ph * 0.72} l9 -6 9 6"/></g>`;
  return `<svg class="v-cube" viewBox="0 ${Math.min(base - ph - 14, base - s - dy - 14)} ${x0 + s + dx + 12} ${Math.max(ph, s + dy) + 30}" role="img" aria-label="${n0(litres)} litres is a cube ${n1(side)} metres on each side, next to a 1.75 metre person">
    ${person}
    <g class="c-box"><path d="${front}" class="c-front"/><path d="${right}" class="c-right"/><path d="${top}" class="c-top"/></g>
    <line x1="${x0}" x2="${x0 + s}" y1="${base + 10}" y2="${base + 10}" class="c-dim"/><text x="${x0 + s / 2}" y="${base + 22}" text-anchor="middle" class="c-t">${n1(side)} m</text>
    <line x1="0" x2="${x0 + s + dx + 12}" y1="${base}" y2="${base}" class="c-ground"/>
  </svg>`;
}

/** A panel whose dust density shows output lost; the second state is after cleaning. */
export function dust(beforePct, afterPct) {
  const specks = (pct, seed) => {
    let g = "", r = seed;
    const n = Math.round(pct * 900);
    for (let i = 0; i < n; i++) { r = (r * 9301 + 49297) % 233280; const x = 4 + (r / 233280) * 92; r = (r * 9301 + 49297) % 233280; const y = 4 + (r / 233280) * 52; g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.4"/>`; }
    return g;
  };
  const cells = [0, 1, 2].map((c) => [0, 1].map((r) => `<rect x="${4 + c * 31}" y="${4 + r * 26}" width="29" height="24" rx="1"/>`).join("")).join("");
  return `<svg class="v-dust" viewBox="0 0 100 60" role="img" aria-label="Dust costs ${n1(beforePct * 100)}% of output uncleaned and about ${n1(afterPct * 100)}% with cleaning">
    <g class="d-cells">${cells}</g>
    <g class="d-before">${specks(beforePct, 7)}</g><g class="d-after">${specks(afterPct, 11)}</g>
    <rect class="d-wipe" x="0" y="0" width="5" height="60"/>
  </svg>`;
}

/** Break-even timeline: cost is repaid by yearly savings. */
export function payback(years, { horizon, compact = false } = {}) {
  if (!years) return "";
  const H = horizon || Math.max(15, Math.ceil(years * 1.6 / 5) * 5);
  const W = 300, x = (y) => 10 + (y / H) * (W - 20), be = x(years);
  let ticks = "";
  if (!compact) for (let y = 0; y <= H; y += 5) ticks += `<line x1="${x(y)}" x2="${x(y)}" y1="34" y2="38" class="pb-tick"/><text x="${x(y)}" y="50" text-anchor="middle" class="pb-t">${y === 0 ? "install" : `yr ${y}`}</text>`;
  return `<svg class="v-payback" viewBox="0 ${compact ? 10 : 0} ${W} ${compact ? 30 : 56}" role="img" aria-label="Pays back in about ${n1(years)} years">
    <line x1="10" x2="${W - 10}" y1="34" y2="34" class="pb-axis"/>
    <rect x="10" y="26" width="${be - 10}" height="8" class="pb-cost"/>
    <rect x="${be}" y="26" width="${W - 10 - be}" height="8" class="pb-gain"/>
    ${ticks}
    <g transform="translate(${be} 0)"><line y1="${compact ? 18 : 8}" y2="34" class="pb-mark"/><circle cy="${compact ? 18 : 8}" r="${compact ? 6 : 4}" class="pb-dot"/>${compact ? "" : `<text x="${be > W - 70 ? -8 : 8}" y="12" text-anchor="${be > W - 70 ? "end" : "start"}" class="pb-lbl">paid back</text>`}</g>
  </svg>`;
}

/** Hours on a clock dial. */
export function hours(h) {
  const a = clamp(h / 24) * Math.PI * 2, r = 22, cx = 26, cy = 26;
  const ex = cx + r * Math.sin(a), ey = cy - r * Math.cos(a), large = a > Math.PI ? 1 : 0;
  return `<svg class="v-hours" viewBox="0 0 52 52" role="img" aria-label="About ${n0(h)} hours">
    <circle cx="${cx}" cy="${cy}" r="${r}" class="h-dial"/>
    <path d="M${cx} ${cy - r} A${r} ${r} 0 ${large} 1 ${ex.toFixed(1)} ${ey.toFixed(1)}" class="h-arc" pathLength="1"/>
    <text x="${cx}" y="${cy + 5}" text-anchor="middle" class="h-t">${n0(h)}h</text>
  </svg>`;
}

/** Rain falling on a bare roof and running into the drain (the "before"). */
export function runoff() {
  let drops = "";
  for (let i = 0; i < 9; i++) drops += `<line x1="${12 + i * 10}" x2="${10 + i * 10}" y1="0" y2="6" class="r-drop" style="--i:${i}"/>`;
  return `<svg class="v-runoff" viewBox="0 0 110 70" role="img" aria-label="Rain runs off the roof into the drain">
    ${drops}<path d="M6 30h92v34H6z" class="r-house"/><path d="M4 30h96" class="r-roof"/>
    <path d="M100 30v30h8" class="r-pipe"/><circle cx="104" cy="62" r="2" class="r-out"/>
  </svg>`;
}

/** Small icon + value + bar, for climate inputs. */
export function meter(name, value, unit, frac, label) {
  return `<div class="v-meter"><span class="m-ico">${icon(name)}</span><span class="m-l">${label}</span><b>${value}<small>${unit}</small></b><i class="m-bar"><i style="width:${(clamp(frac) * 100).toFixed(1)}%"></i></i></div>`;
}

/** A ring showing a share of 100%. */
export function ring(pct, tone = "sun") {
  const p = clamp(pct / 100), r = 16;
  return `<svg class="v-ring ${tone}" viewBox="0 0 40 40" role="img" aria-label="${Math.round(pct)}%"><circle cx="20" cy="20" r="${r}" class="g-bg"/><circle cx="20" cy="20" r="${r}" class="g-fg" pathLength="100" stroke-dasharray="${(p * 100).toFixed(1)} 100" transform="rotate(-90 20 20)"/></svg>`;
}

/** Mark elements with class "viz" as "in" when they scroll into view (once). */
export function revealOnScroll(root = document) {
  const els = root.querySelectorAll(".viz:not(.in)");
  if (!("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("in")); return; }
  const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.35 });
  els.forEach((e) => io.observe(e));
}
