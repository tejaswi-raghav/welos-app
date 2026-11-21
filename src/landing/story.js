import "./landing.css";
import "../ai/mount.jsx";
import { createStage } from "../stage/stage.js";
import { simulateDay, flowsFor, at, chartPaths } from "../stage/day.js";
import { sizeSystem, TIERS } from "../site/sizing.js";
import { DEFAULT_PRESET } from "../site/presets.js";

const $ = (s) => document.querySelector(s);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const seg = (t, a, b) => clamp((t - a) / (b - a));
const fmt = (x, d = 0) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

// The story follows a reference Dubai villa, with the turbine and condensate fitted so every part can be shown.
const villa = sizeSystem(DEFAULT_PRESET.climate, "S", {}, { wind: true, condensate: true }, "recommended");
const sim = simulateDay(villa);
const tankL = villa.components.find((c) => c.id === "water").metrics.tankL;

/* ---------- chapters: each maps local progress t (0..1) to the stage ---------- */
const CH = [
  { name: "Dawn", run: (t) => ({ hour: lerp(5.55, 6.15, t), shot: ["establish", "hero", t] }) },
  { name: "Sunrise", run: (t) => ({ hour: lerp(6.15, 9, t), shot: ["hero", "panels", t] }) },
  { name: "Midday", run: (t) => ({ hour: lerp(9, 13, t), shot: ["panels", "hero", t] }) },
  {
    name: "Dust", run: (t) => {
      const rinse = t > 0.5 && t < 0.95 ? 1 : 0;
      const dust = t < 0.5 ? 0.85 * ease(seg(t, 0.05, 0.45)) : 0.85 * (1 - ease(seg(t, 0.52, 0.9)));
      return { hour: lerp(13, 15.4, t), shot: ["hero", "dust", ease(seg(t, 0, 0.4))], dust, rinse, flows: { rinse, treat: rinse } };
    },
  },
  { name: "Sunset", run: (t) => ({ hour: lerp(15.4, 19.2, t), shot: ["dust", "turbine", t] }) },
  { name: "Night", run: (t) => ({ hour: lerp(19.2, 23.8, t), shot: ["turbine", "night", t] }) },
  {
    name: "Storm", run: (t) => ({
      hour: 10.5, weather: ease(seg(t, 0.05, 0.25)), tank: lerp(0.35, 0.95, ease(seg(t, 0.25, 0.9))),
      shot: ["night", "water", ease(seg(t, 0, 0.5))],
      flows: { rain: seg(t, 0.15, 0.3), condensate: seg(t, 0.4, 0.55), pv: 0.15, home: 0.4, charge: 0, export: 0, discharge: 0.2, wind: 0.3 },
      hudTank: true,
    }),
  },
  {
    name: "Inside", run: (t) => ({
      hour: 11, weather: 0, tank: 0.95, explode: ease(seg(t, 0.08, 0.55)), shot: ["water", "apart", ease(seg(t, 0, 0.5))],
      flows: { pv: 0, wind: 0, charge: 0, discharge: 0, home: 0, export: 0, rain: 0, condensate: 0, treat: 0, rinse: 0 }, spots: t > 0.45, hudTank: true,
    }),
  },
  { name: "WELOS OS", run: (t) => ({ hour: lerp(0, 23.9, seg(t, 0.15, 0.95)), explode: 0, tank: 0.6, shot: ["apart", "wide", ease(seg(t, 0, 0.35))], brain: t }) },
];

/* ---------- stage ---------- */
const stage = createStage($("#stage"), {
  onError: () => document.body.classList.add("no-gl"),
  // keep the unit clear of the captions: right of centre on wide screens, higher on phones
  frame: (w, h) => (w > 900 ? [0.17, 0] : [0, 0.2]),
});
stage?.set({ modules: { wind: true, water: true }, hour: 5.55, tank: 0.35 });
stage?.shot("establish", { instant: true });

/* ---------- chapter nav ---------- */
const nav = $("#chapters");
nav.innerHTML = CH.map((c, i) => `<button type="button" data-i="${i}"><span class="fill"></span><em>${c.name}</em></button>`).join("");
const navBtns = [...nav.children];
const story = $("#story");
const storyRange = () => story.offsetHeight - innerHeight;
nav.addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  const i = +b.dataset.i;
  window.scrollTo({ top: story.offsetTop + ((i + 0.6) / CH.length) * storyRange(), behavior: reduce ? "auto" : "smooth" });
});

/* ---------- chart for the WELOS OS chapter ---------- */
const svg = $("#chart");
const W = 640, H = 260;
const P = chartPaths(sim, W, H, 6);
const dec = [[1.5, "Holds 20% reserve", 30], [7.5, "Charges battery", 30], [11.5, "Sells surplus", 50], [14.8, "Rinses panels", 30], [19.5, "Battery to house", 50]];
svg.innerHTML = `
  <g class="grid">${[0, 6, 12, 18, 24].map((h) => `<line x1="${P.x(h)}" x2="${P.x(h)}" y1="0" y2="${H}"/><text x="${P.x(h) + 4}" y="${H - 8}">${String(h % 24).padStart(2, "0")}:00</text>`).join("")}</g>
  <path class="a-wind" d="${P.wind}"/><path class="a-solar" d="${P.solar}"/>
  <path class="l-load" d="${P.load}" pathLength="1"/><path class="l-soc" d="${P.soc}" pathLength="1"/>
  ${dec.map(([h, label, ty]) => `<g class="dec" data-h="${h}"><line x1="${P.x(h)}" x2="${P.x(h)}" y1="${ty - 12}" y2="${H - 26}"/><text x="${P.x(h) + 6}" y="${ty}">${label}</text></g>`).join("")}
  <line class="cursor" id="cursor" x1="0" x2="0" y1="0" y2="${H}"/>`;
const cursor = $("#cursor");
const decs = [...svg.querySelectorAll(".dec")];

/* ---------- hotspots ---------- */
const spots = $("#spots");
const spotBtns = [...spots.querySelectorAll("button")];
spotBtns.forEach((b) => {
  b.addEventListener("mouseenter", () => stage?.highlight(b.dataset.part));
  b.addEventListener("focus", () => stage?.highlight(b.dataset.part));
  b.addEventListener("mouseleave", () => stage?.highlight(null));
  b.addEventListener("blur", () => stage?.highlight(null));
  b.addEventListener("click", () => { spotBtns.forEach((x) => x.classList.toggle("on", x === b)); stage?.highlight(b.dataset.part); });
});

/* ---------- scroll -> state ---------- */
const caps = [...document.querySelectorAll(".cap")];
const daypart = (h) => (h < 5.5 ? "Night" : h < 6.3 ? "Before sunrise" : h < 10 ? "Morning" : h < 15 ? "Midday" : h < 18.3 ? "Afternoon" : h < 19.5 ? "Sunset" : "Night");
let current = -1, spotsOn = false;

function apply() {
  const p = clamp((scrollY - story.offsetTop) / Math.max(1, storyRange()));
  const f = p * CH.length;
  const i = Math.min(CH.length - 1, Math.floor(f));
  const t = clamp(f - i);
  const s = CH[i].run(t);
  const base = flowsFor(sim, s.hour);
  stage?.set({
    hour: s.hour, weather: s.weather ?? 0, dust: s.dust ?? 0, rinse: s.rinse ?? 0,
    tank: s.tank ?? 0.35, explode: s.explode ?? 0, soc: base.soc, wind: base.wind,
    flows: { rain: 0, condensate: 0, treat: 0, rinse: 0, ...base.flows, ...(s.flows || {}) },
  });
  if (s.shot) stage?.shotBlend(s.shot[0], s.shot[1], clamp(s.shot[2]));

  if (i !== current) {
    current = i;
    caps.forEach((c) => c.classList.toggle("on", +c.dataset.c === i));
    document.body.dataset.chapter = i;
  }
  navBtns.forEach((b, k) => b.style.setProperty("--p", k < i ? 1 : k > i ? 0 : t));

  // HUD
  const m = at(sim, s.hour);
  const hh = Math.floor(s.hour), mm = Math.floor((s.hour - hh) * 60);
  $("#clock").textContent = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  $("#daypart").textContent = s.weather > 0.5 ? "Storm" : daypart(s.hour);
  $("#m-sun").textContent = fmt(m.pv * (1 - (s.weather || 0) * 0.8), 1);
  $("#m-wind").textContent = fmt(m.wind, 1);
  $("#m-batt").textContent = fmt(m.soc * 100);
  $("#m-tank").textContent = fmt((s.tank ?? 0.35) * tankL);

  // hotspots
  const on = !!s.spots;
  if (on !== spotsOn) { spotsOn = on; spots.hidden = !on; if (!on) { stage?.highlight(null); spotBtns.forEach((b) => b.classList.remove("on")); } }

  // WELOS OS chart
  const brain = s.brain ?? -1;
  document.body.classList.toggle("brain-on", brain >= 0);
  if (brain >= 0) {
    const draw = ease(seg(brain, 0.05, 0.5));
    svg.style.setProperty("--draw", draw);
    cursor.setAttribute("x1", P.x(s.hour)); cursor.setAttribute("x2", P.x(s.hour));
    decs.forEach((d) => d.classList.toggle("on", s.hour >= +d.dataset.h));
  }
  document.body.classList.toggle("past-story", p >= 1);
}

function placeSpots() {
  if (spotsOn && stage) for (const b of spotBtns) {
    const q = stage.project(b.dataset.part, 0, +b.dataset.dy, 0);
    if (q) { b.style.transform = `translate(${q.x.toFixed(1)}px, ${q.y.toFixed(1)}px)`; b.style.opacity = q.visible ? 1 : 0; }
  }
  requestAnimationFrame(placeSpots);
}

let ticking = false;
addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; apply(); }); } }, { passive: true });
addEventListener("resize", apply);
apply();
requestAnimationFrame(placeSpots);

/* ---------- header tone over light sections ---------- */
const bar = $("#bar");
const light = [...document.querySelectorAll(".sizes, .next, .foot")];
const tone = () => {
  const y = bar.offsetHeight * 0.5;
  bar.classList.toggle("light", light.some((el) => { const r = el.getBoundingClientRect(); return r.top <= y && r.bottom >= y; }));
};
addEventListener("scroll", tone, { passive: true }); tone();

/* ---------- sizes ---------- */
const ART = {
  S: `<svg viewBox="0 0 220 140" aria-hidden="true"><path class="ink" d="M30 120V70l50-28 50 28v50Z M130 120V82h60v38"/><path class="ink thin" d="M46 120V92h18v28M98 86h18v14H98z M146 96h14v12h-14z"/><path class="sun" d="M58 52l58-18 38 6-58 18z"/><circle class="sky" cx="168" cy="72" r="7"/><path class="ink" d="M10 120h200"/></svg>`,
  M: `<svg viewBox="0 0 220 140" aria-hidden="true"><path class="ink" d="M48 120V40h70v80M118 120V60h54v60"/><path class="ink thin" d="M60 52h12v10H60zM84 52h12v10H84zM60 74h12v10H60zM84 74h12v10H84zM60 96h12v10H60zM84 96h12v10H84zM130 74h12v10h-12zM152 74h12v10h-12zM130 96h12v10h-12z"/><path class="sun" d="M44 32l42-12 38 4-42 12z M116 52l34-9 26 3-34 9z"/><path class="ink thin" d="M160 44V22M154 22h12"/><circle class="sky" cx="104" cy="112" r="6"/><path class="ink" d="M10 120h200"/></svg>`,
  L: `<svg viewBox="0 0 220 140" aria-hidden="true"><path class="ink" d="M14 120V78h84v42M98 120V64h104v56"/><path class="ink thin" d="M24 90h64M24 104h64M108 76h84M108 90h84M108 104h84"/><path class="sun" d="M16 70l30-8 30 2-30 8zM52 70l30-8 18 2-30 8zM104 56l30-8 30 2-30 8zM142 56l30-8 30 2-30 8z"/><path class="ink thin" d="M40 62V36M34 36h12M190 48V20M184 20h12"/><circle class="sky" cx="80" cy="112" r="6"/><circle class="sky" cx="180" cy="112" r="6"/><path class="ink" d="M6 120h208"/></svg>`,
};
const grid = $("#size-grid");
grid.innerHTML = ["S", "M", "L"].map((id) => {
  const rec = sizeSystem(DEFAULT_PRESET.climate, id, {}, {}, "recommended");
  const ess = sizeSystem(DEFAULT_PRESET.climate, id, {}, {}, "essential");
  const by = Object.fromEntries(rec.components.map((c) => [c.id, c]));
  return `<article class="size">
    <div class="art">${ART[id]}</div>
    <h3>${TIERS[id].name}</h3><p class="aud">${TIERS[id].audience}</p>
    <dl><div><dt>Solar</dt><dd>${fmt(by.solar.metrics.pvKwp, 1)} kWp</dd></div><div><dt>Storage</dt><dd>${fmt(by.battery.metrics.batteryKwh)} kWh</dd></div><div><dt>Water tank</dt><dd>${fmt(by.water.metrics.tankL)} L</dd></div><div><dt>Covers</dt><dd>${fmt(Math.min(rec.totals.energyCoveragePct, 100))}% of power</dd></div></dl>
    <p class="price">From <b>AED ${fmt(ess.totals.totalAed)}</b></p>
    <a class="go" href="/studio.html?tier=${id}">Configure the ${TIERS[id].name.toLowerCase()}</a>
  </article>`;
}).join("");
