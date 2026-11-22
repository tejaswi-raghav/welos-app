// Home: one continuous scroll story over the shared digital twin.
import "../ui/chrome.js";
import "./home.css";
import { Stage, webglAvailable } from "../twin/stage.js";
import { simulateDay, explainFrame, modeLabel, CLEAN_CYCLE, DEFAULT_CONFIG } from "../twin/sim.js";
import { LAYERS } from "../twin/model.js";
import { parts, partById, systems } from "../model/parts.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;
const f1 = (x) => Number(x).toFixed(1), f2 = (x) => Number(x).toFixed(2);
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobile = () => matchMedia("(max-width: 860px)").matches;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

let currentScene = null;
let intro = null;

/* ---------------------------------------------------------------- simulation */
const days = {
  clear: simulateDay("clear"), windy: simulateDay("windy"), rain: simulateDay("rain"),
  dust: simulateDay("dust"), stress: simulateDay("stress"), outage: simulateDay("outage"),
};
const at = (day, hour) => days[day].frames[Math.round(hour * 4)];
const FR = {
  hero: at("clear", 17.25), sun: at("clear", 12.5), wind: at("windy", 17.5), rain: at("rain", 16),
  network: at("clear", 15), exploded: at("clear", 14), os: at("clear", 15),
};

/* ---------------------------------------------------------------- scenes */
const SOLAR = ["pv-array", "pv-racking", "soiling-sensor", "cleaning-manifold", "canopy", "mppt", "pv-cable"];
const WIND = ["vawt-rotor", "wind-brake", "wind-generator", "wind-mast", "wind-rectifier", "wind-cable"];
const WATER = LAYERS.find((l) => l.id === "water").keys.concat(["pv-array"]);

const SCENES = {
  hero: { pose: { pos: [15.5, 5.6, 18.5], target: [0.2, 0.7, 0], fov: 30 }, shift: 0.17, frame: FR.hero, flows: "off",
    annos: [] },
  sun: { pose: { pos: [3.5, 11.5, 11], target: [-0.4, 1.0, -0.2], fov: 30 }, shift: 0.16, frame: FR.sun, flows: "active", filter: ["pv", "mpptBus", "battery", "loads"], focus: SOLAR,
    annos: [
      { key: "pv-array", at: [1.6, 1.75, 0.6], cls: "power", label: "S01 · Canopy", title: "6 × PV modules", v: (f) => `${f2(f.result.power.pvKw)} kW from ${f.sensors.solarIrradianceWm2} W/m²`, dx: 50, dy: -70 },
      { key: "soiling-sensor", at: [-2.74, 1.6, -1.53], label: "S04 · Soiling reference", title: "Clean cell vs exposed glass", v: (f) => `Soiling ${pct(f.sensors.soilingIndex)}`, dx: 40, dy: -90 },
      { key: "mppt", at: [1.36, 0.15, 1.75], cls: "power", label: "E01 · MPPT", title: "Tracks the power point", v: (f) => `${f2(f.result.power.batteryChargeKw)} kW into the battery`, dx: 40, dy: 50 },
    ] },
  wind: { pose: { pos: [11, 3.6, 7.5], target: [3.0, 1.7, -0.9], fov: 30 }, shift: 0.16, frame: FR.wind, flows: "active", filter: ["wind", "rectBus", "battery", "loads"], focus: WIND,
    annos: [
      { key: "vawt-rotor", at: [3.25, 3.0, -0.4], cls: "power", label: "W01 · Helical rotor", title: "Omnidirectional, no yaw", v: (f) => `${f1(f.sensors.windSpeedMs)} m/s · ${f2(f.result.power.windKw)} kW`, dx: 60, dy: -50 },
      { key: "wind-brake", at: [3.7, 0.86, -0.9], label: "W03 · Brake", title: "Fail-safe, cloud-independent", v: (f) => (f.result.outputs.windBrake ? "Engaged" : "Released"), dx: 70, dy: 30 },
      { key: "wind-rectifier", at: [2.13, 0.15, 1.75], cls: "power", label: "E02 · Rectifier", title: "AC → 48 V DC bus", v: (f) => `${f2(f.result.power.windKw)} kW rectified`, dx: -230, dy: 40 },
    ] },
  rain: { pose: { pos: [-10.5, 3.4, 10.5], target: [-2.4, -0.1, 1.0], fov: 30 }, shift: 0.16, frame: FR.rain, flows: "active", filter: ["catch", "store", "treat", "water"], focus: WATER,
    annos: [
      { key: "rain-gutter", at: [-2.4, 1.76, 1.54], cls: "water", label: "S03 · Perimeter gutter", title: "Canopy runoff", v: (f) => `${f1(f.sensors.rainfallMmHr)} mm/h falling`, dx: 40, dy: -70 },
      { key: "first-flush", at: [-4.05, -1.05, 1.0], cls: "water", label: "R01 · First flush", title: `First ${DEFAULT_CONFIG.firstFlushMm} mm to drain`, v: (f) => (f.result.water.firstFlushActive ? `Diverting · ${f2(f.result.water.rainEventMm)} mm` : "Complete"), dx: -230, dy: 10 },
      { key: "water-tank", at: [-2.8, 0.2, 1.67], cls: "water", label: "R03 · Storage", title: "Opaque, vented tank", v: (f) => `${f.tank.toFixed(0)}% · ${f.result.water.captureRateLpm} L/min in`, dx: 50, dy: 30 },
    ] },
  network: { pose: { pos: [19, 12, 22], target: [3.5, -0.4, -1.5], fov: 30 }, shift: 0.14, frame: FR.network, flows: "all",
    annos: [
      { key: "dc-bus", at: [1.75, -0.13, 1.98], cls: "power", label: "E04", title: "48 V DC bus", v: (f) => `${f2(f.result.power.renewableKw)} kW in`, dx: 50, dy: -40 },
      { key: null, at: [11.2, -1.2, -6.4], cls: "power", label: "Building", title: "House loads", v: (f) => `${f2(f.result.power.servedLoadKw)} kW served`, dx: 30, dy: -60 },
      { key: "water-tank", at: [-2.8, 0.4, 1.4], cls: "water", label: "R03", title: "Tank", v: (f) => `${f.tank.toFixed(0)}%`, dx: -170, dy: -40 },
    ] },
  coord: { pose: { pos: [0.4, 21, 8.5], target: [0.2, -0.6, 0.4], fov: 30 }, shift: -0.2, schem: 0.55, frame: null, flows: "active", annos: [] },
  exploded: { pose: { pos: [15.5, 8.8, 19], target: [0.3, 1.7, 0.3], fov: 32 }, shift: 0.17, frame: FR.exploded, explode: 1, env: 0.2, flows: "off", pick: true, annos: [] },
  pressure: { pose: { pos: [16.5, 7.5, 19.5], target: [1.2, 0.5, -0.5], fov: 30 }, shift: 0.14, frame: null, flows: "active", annos: [] },
  os: { pose: { pos: [9.5, 19, 15], target: [0.6, -0.6, 0.2], fov: 30 }, shift: 0.18, frame: FR.os, schem: 1, env: 0.0, flows: "all",
    annos: [
      { key: "pv-array", at: [-0.95, 1.75, -0.28], cls: "power node", label: "SRC", title: "Solar array", v: (f) => `${f2(f.result.power.pvKw)} kW`, dx: 26, dy: -30 },
      { key: "vawt-rotor", at: [3.25, 2.25, -0.9], cls: "power node", label: "SRC", title: "Turbine", v: (f) => `${f2(f.result.power.windKw)} kW`, dx: 26, dy: -30 },
      { key: "dc-bus", at: [1.75, -0.13, 1.98], cls: "power node", label: "BUS", title: "DC bus", v: (f) => `${f2(f.result.power.renewableKw)} kW`, dx: 26, dy: 10 },
      { key: "lifepo4-battery", at: [1.2, -1.36, 1.97], cls: "power node", label: "STORE", title: "Battery", v: (f) => `${f.soc.toFixed(0)}%`, dx: 40, dy: 70 },
      { key: "water-tank", at: [-2.8, -0.2, 1.0], cls: "water node", label: "STORE", title: "Tank", v: (f) => `${f.tank.toFixed(0)}%`, dx: -40, dy: -70 },
      { key: "filter-header", at: [-1.3, -0.5, 1.9], cls: "water node", label: "TREAT", title: "Filters + UV", v: () => "", dx: -60, dy: 80 },
      { key: "controller-pcb", at: [-0.37, -0.37, 1.6], cls: "node", label: "CTRL", title: "Controller", v: (f) => modeLabel(f.mode), dx: 30, dy: 110 },
    ] },
};

/* ---------------------------------------------------------------- stage */
const canvas = $("#gl");
let stage = null;
if (webglAvailable()) {
  stage = new Stage(canvas, { env: "rooftop" });
  if (!stage.ok) stage = null;
}
if (!stage) document.documentElement.classList.add("no-gl");
$("#loader")?.remove();

/* ---------------------------------------------------------------- annotations */
const annoLayer = $("#annos");
let liveAnnos = [];
function mountAnnos(list, frame) {
  annoLayer.innerHTML = "";
  const max = isMobile() ? 1 : list.length;
  liveAnnos = list.slice(0, max).map((a) => {
    const el = document.createElement("div");
    el.className = `anno ${a.cls || ""}`;
    el.innerHTML = `<i class="lead"></i><i class="dot"></i><div class="card"><span class="t-label">${esc(a.label)}</span><b>${esc(a.title)}</b><span class="v"></span></div>`;
    annoLayer.appendChild(el);
    const card = el.querySelector(".card"), lead = el.querySelector(".lead"), v = el.querySelector(".v");
    if (frame) v.textContent = a.v(frame);
    if (!v.textContent) v.remove();
    requestAnimationFrame(() => el.classList.add("on"));
    return { ...a, el, card, lead, out: {} };
  });
}
function placeAnnos() {
  if (!stage) return;
  for (const a of liveAnnos) {
    stage.screenOf(a.key, a.at, a.out);
    const { x, y, visible } = a.out;
    a.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    a.el.style.visibility = visible ? "visible" : "hidden";
    const dx = isMobile() ? Math.sign(a.dx || 1) * 18 : a.dx, dy = isMobile() ? -70 : a.dy;
    const cw = a.card.offsetWidth || 160, ch = a.card.offsetHeight || 50;
    const left = dx < 0 ? dx - cw : dx;
    a.card.style.transform = `translate(${left}px, ${dy - ch / 2}px)`;
    const tx = dx < 0 ? dx : dx, ty = dy;
    const len = Math.hypot(tx, ty), ang = Math.atan2(ty, tx);
    a.lead.style.width = `${len}px`;
    a.lead.style.transform = `rotate(${ang}rad)`;
  }
}

/* ---------------------------------------------------------------- resource chains */
function chainHtml(steps) {
  return steps.map(([k, v, on = true]) => `<li class="${on ? "on" : "off"}"><span class="t-label">${esc(k)}</span><b class="t-num">${esc(v)}</b></li>`).join("");
}
function fillChains() {
  const s = FR.sun, w = FR.wind, r = FR.rain;
  $('[data-chain="sun"]').innerHTML = chainHtml([
    ["Irradiance", `${s.sensors.solarIrradianceWm2} W/m²`],
    ["Panel temp", `${f1(s.sensors.panelTempC)} °C`],
    ["Derating", `${(s.pvEfficiency * 100).toFixed(0)}% of rated`],
    ["Canopy DC", `${f2(s.result.power.pvKw)} kW`],
    [s.result.power.batteryChargeKw > 0 ? "To battery" : "To loads", `${f2(s.result.power.batteryChargeKw || s.result.power.servedLoadKw)} kW`],
  ]);
  $('[data-chain="wind"]').innerHTML = chainHtml([
    ["Wind at hub", `${f1(w.sensors.windSpeedMs)} m/s`],
    ["Window", `${DEFAULT_CONFIG.windCutInMs}–${DEFAULT_CONFIG.windCutOutMs} m/s`],
    ["Brake", w.result.outputs.windBrake ? "Engaged" : "Released"],
    ["Generator", `${f2(w.result.power.windKw)} kW`],
    ["Sun now", `${f2(w.result.power.pvKw)} kW`, w.result.power.pvKw > 0.05],
  ]);
  $('[data-chain="rain"]').innerHTML = chainHtml([
    ["Rainfall", `${f1(r.sensors.rainfallMmHr)} mm/h`],
    ["First flush", r.result.water.firstFlushActive ? "Diverting" : `${DEFAULT_CONFIG.firstFlushMm} mm done`],
    ["Storage valve", r.result.water.storageActive ? "Open" : "Closed", r.result.water.storageActive],
    ["Capture", `${r.result.water.captureRateLpm} L/min`],
    ["Tank", `${r.tank.toFixed(0)}%`],
  ]);
  const h = FR.hero;
  $("#heroReadout").innerHTML = [
    ["Simulated", `${h.clock}`], ["Solar", `${f2(h.result.power.pvKw)} kW`], ["Wind", `${f1(h.sensors.windSpeedMs)} m/s`],
    ["Battery", `${h.soc.toFixed(0)}%`],
  ].map(([k, v]) => `<div><dt class="t-label">${k}</dt><dd class="t-num">${esc(v)}</dd></div>`).join("");
}
fillChains();

/* ---------------------------------------------------------------- coordination graph */
const MOMENTS = [
  { id: "dust", label: "Dust at noon", day: "dust", hour: 13 },
  { id: "rinse", label: "Dusk rinse", day: "dust", hour: 17.25 },
  { id: "storm", label: "Storm", day: "rain", hour: 16.75 },
  { id: "blackout", label: "Blackout", day: "outage", hour: 19.5 },
];
const LINKS = {
  faults: ["charge", "discharge", "import", "export", "shed", "brake", "flush", "store", "clean"],
  storm: ["brake", "clean", "store"], grid: ["import", "export", "shed"], soc: ["discharge", "shed", "charge"],
  balance: ["charge", "discharge", "import", "export"], soiling: ["clean"], water: ["clean", "store"],
};
let momentId = "dust";
function renderGraph() {
  const m = MOMENTS.find((x) => x.id === momentId);
  const frame = at(m.day, m.hour);
  const ex = explainFrame(frame);
  const graph = $("#graph");
  const checks = ex.checks.filter((c) => c.id !== "faults");
  graph.innerHTML = `
    <div class="g-head"><span class="mode-pill" data-mode="${ex.mode}"><i></i>${esc(modeLabel(ex.mode))}</span><span class="t-label">${esc(days[m.day].scenario.label)} · ${frame.clock} · simulated</span></div>
    <div class="g-cols">
      <div class="g-col"><p class="t-label">Signal → rule</p>${checks.map((c) => `<div class="g-check ${c.pass ? "pass" : "fail"}" data-c="${c.id}"><span class="g-sig">${esc(c.signal)}</span><b class="t-num">${esc(c.value)}</b><small>${esc(c.rule)}</small></div>`).join("")}</div>
      <svg class="g-links" aria-hidden="true"></svg>
      <div class="g-col"><p class="t-label">Action</p>${ex.actions.map((a) => `<div class="g-act ${a.state} ${a.domain}" data-a="${a.id}"><span class="g-state">${a.state === "active" ? "Permitted" : a.state === "blocked" ? "Blocked" : "Idle"}</span><b>${esc(a.name)}</b><small>${esc(a.reason)}</small></div>`).join("")}</div>
    </div>
    <p class="g-decision"><span class="t-label">Decision</span>${esc(ex.decision)}.</p>`;
  requestAnimationFrame(() => drawLinks(graph, ex));
  if (currentScene === "coord" && stage) stage.setFrame(frame);
  SCENES.coord.frame = frame;
}
function drawLinks(graph, ex) {
  const svg = graph.querySelector(".g-links");
  const box = svg.getBoundingClientRect();
  const byA = Object.fromEntries(ex.actions.map((a) => [a.id, a]));
  const byC = Object.fromEntries(ex.checks.map((c) => [c.id, c]));
  let paths = "";
  for (const [cid, targets] of Object.entries(LINKS)) {
    const cel = graph.querySelector(`[data-c="${cid}"]`); if (!cel) continue;
    const cr = cel.getBoundingClientRect();
    for (const aid of targets) {
      const ael = graph.querySelector(`[data-a="${aid}"]`); if (!ael) continue;
      const ar = ael.getBoundingClientRect();
      const a = byA[aid], c = byC[cid];
      const relevant = (a.state === "blocked" && !c.pass) || (a.state === "active" && (c.pass || cid === "storm" || cid === "balance" || cid === "grid"));
      const cls = a.state === "blocked" && !c.pass ? "blk" : a.state === "active" && relevant ? `act ${a.domain}` : "idle";
      const y1 = cr.top + cr.height / 2 - box.top, y2 = ar.top + ar.height / 2 - box.top;
      const w = box.width;
      paths += `<path class="${cls}" d="M0 ${y1.toFixed(1)} C ${w * 0.5} ${y1.toFixed(1)}, ${w * 0.5} ${y2.toFixed(1)}, ${w} ${y2.toFixed(1)}"/>`;
    }
  }
  svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
  svg.innerHTML = paths;
}
const momentsEl = $("#moments");
momentsEl.innerHTML = MOMENTS.map((m) => `<button type="button" data-m="${m.id}" aria-pressed="${m.id === momentId}">${m.label}</button>`).join("");
momentsEl.addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  momentId = b.dataset.m;
  $$("button", momentsEl).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  renderGraph();
});
renderGraph();
addEventListener("resize", () => renderGraph());

/* ---------------------------------------------------------------- exploded: parts */
const partList = $("#partList"), partCard = $("#partCard");
partList.innerHTML = systems.filter((s) => s.id !== "overview").map((s) => `<div class="pl-sys"><span class="t-label">${s.code} ${esc(s.name)}</span><div>${parts.filter((p) => p.system === s.id).map((p) => `<button type="button" class="chip" data-p="${p.id}" aria-pressed="false">${p.code}</button>`).join("")}</div></div>`).join("");
function showPart(id) {
  const p = partById[id];
  $$("[data-p]", partList).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.p === id)));
  if (!p) { partCard.innerHTML = `<p class="t-fine">Select a part to inspect it.</p>`; stage?.setSelected(null); stage?.setFocus(null); return; }
  const sys = systems.find((s) => s.id === p.system);
  partCard.innerHTML = `<p class="t-label">${p.code} · ${esc(p.category)} · ${esc(sys.name)}</p><h3 class="t-h3">${esc(p.name)}</h3><p>${esc(p.role)}</p><dl><div><dt class="t-label">Concept basis</dt><dd>${esc(p.evidence)}</dd></div><div><dt class="t-label">Open engineering</dt><dd>${esc(p.status)}</dd></div></dl><a class="more" href="/explorer.html#${p.id}">Inspect in Explorer →</a>`;
  stage?.setSelected(id);
  stage?.setFocus(parts.filter((x) => x.system === p.system).map((x) => x.id).concat([id]));
}
partList.addEventListener("click", (e) => { const b = e.target.closest("[data-p]"); if (b) showPart(b.dataset.p); });
showPart(null);
const tip = document.createElement("div"); tip.className = "hover-tip"; document.body.appendChild(tip);
stage?.on("hover", (id, ev) => {
  const p = id && partById[id];
  tip.classList.toggle("on", !!p);
  if (p && ev) { tip.textContent = `${p.code} · ${p.name}`; tip.style.transform = `translate(${ev.clientX + 14}px, ${ev.clientY + 14}px)`; }
});
stage?.on("pick", (id) => { if (currentScene === "exploded") showPart(partById[id] ? id : null); });

/* ---------------------------------------------------------------- pressure timeline */
const stressDay = days.stress;
function pickStops() {
  const ev = stressDay.events;
  const find = (fn) => ev.find(fn);
  const stops = [];
  const add = (e, title, body) => { if (e && !stops.some((s) => s.i === e.i)) stops.push({ i: e.i, title, body, event: e }); };
  add({ i: 24, title: "Before sunrise" }, "Before sunrise", "No sun, light wind. The battery carries the house through the night, and the controller holds its reserve floor.");
  add(find((e) => e.hour >= 9 && e.hour <= 12.6 && e.kind === "mode") || { i: 46 }, "The canopy recovers the battery", "Solar output passes household demand. The surplus goes to the battery first; nothing is exported until it is charged.");
  add(find((e) => e.kind === "clean" && e.level === "warning"), "Dust settles, cleaning is refused", "Soiling crosses the 18% trigger. A rinse is proposed, and refused: water on hot glass under full sun, in rising wind, is unsafe. The controller defers rather than overrides.");
  add(find((e) => e.kind === "water" && /first flush/i.test(e.title)), "The storm breaks", "Rain starts. The first flush of runoff carries the accumulated dust, so it goes to drain before any water is kept.");
  add(find((e) => e.kind === "mode" && /Storm/.test(e.title)), "Storm mode", "Wind and rain cross the storm limits. Battery reserve is protected, rain capture takes priority, and the turbine is braked if the wind passes cut-out.");
  add(find((e) => e.kind === "water" && /Storage/.test(e.title)), "Clean water is kept", "The first flush is complete. The storage valve opens and water passes the sediment, carbon and UV-C stages into the tank. The rain has also washed the panels.");
  add(find((e) => e.kind === "grid" && /lost/.test(e.title)), "Then the grid drops", "Utility power is lost. The unit islands itself, raises its battery reserve to 35% and sheds non-critical loads rather than drain the battery to empty.");
  add(find((e) => e.kind === "grid" && /restored/.test(e.title)) || { i: 92 }, "Grid restored", "The grid returns. The normal reserve floor resumes and the house is fully served again.");
  return stops.filter((s) => s.i != null).sort((a, b) => a.i - b.i);
}
const STOPS = pickStops();
const stepsEl = $("#pressSteps"), clockbar = $("#clockbar"), hud = $("#pressHud");
clockbar.innerHTML = STOPS.map((s, k) => `<button type="button" data-k="${k}">${stressDay.frames[s.i].clock}</button>`).join("");
stepsEl.innerHTML = STOPS.map((s, k) => {
  const f = stressDay.frames[s.i];
  const evs = stressDay.events.filter((e) => e.i === s.i);
  return `<li class="pstep" data-k="${k}">
    <div class="pclock"><span class="t-num">${f.clock}</span><span class="t-label">Step ${k + 1} of ${STOPS.length}</span></div>
    <h3 class="t-h2">${esc(s.title)}</h3>
    <p class="t-body">${esc(s.body)}</p>
    ${evs.length ? `<ul class="plog">${evs.map((e) => `<li class="${e.level}"><b>${esc(e.title)}</b><span>${esc(e.detail)}</span></li>`).join("")}</ul>` : ""}
    <blockquote class="pdecide"><span class="t-label">Controller</span>${esc(f.result.nextState.lastDecision)}.</blockquote>
    <div class="pnav">${k > 0 ? `<button type="button" class="btn btn--line btn--sm" data-go="${k - 1}">← Previous</button>` : ""}${k < STOPS.length - 1 ? `<button type="button" class="btn btn--line btn--sm" data-go="${k + 1}">Next moment →</button>` : ""}</div>
  </li>`;
}).join("");
let stepK = 0;
function renderHud(f) {
  const P = f.result.power, ex = explainFrame(f);
  const bar = (v, cls) => `<span class="bar ${cls}"><i style="width:${clamp(v / 100) * 100}%"></i></span>`;
  hud.innerHTML = `
    <div class="hud-top"><span class="mode-pill" data-mode="${f.mode}"><i></i>${esc(modeLabel(f.mode))}</span><span class="t-num hud-clock">${f.clock}</span></div>
    <div class="hud-grid">
      <div class="metric"><span class="t-label">Solar</span><b>${f2(P.pvKw)}<small>kW</small></b></div>
      <div class="metric"><span class="t-label">Wind</span><b>${f2(P.windKw)}<small>kW</small></b><em>${f1(f.sensors.windSpeedMs)} m/s${f.result.outputs.windBrake ? " · braked" : ""}</em></div>
      <div class="metric"><span class="t-label">Demand</span><b>${f2(P.demandKw)}<small>kW</small></b><em>${P.loadShedKw > 0 ? `${f2(P.loadShedKw)} kW shed` : P.gridImportKw > 0 ? `${f2(P.gridImportKw)} kW from grid` : f.sensors.gridAvailable ? "grid available" : "grid lost"}</em></div>
      <div class="metric"><span class="t-label">Rain</span><b>${f1(f.sensors.rainfallMmHr)}<small>mm/h</small></b></div>
    </div>
    <div class="hud-bars">
      <div><span class="t-label">Battery</span>${bar(f.soc, "amber")}<b class="t-num">${f.soc.toFixed(0)}%</b></div>
      <div><span class="t-label">Tank</span>${bar(f.tank, "sky")}<b class="t-num">${f.tank.toFixed(0)}%</b></div>
      <div><span class="t-label">Soiling</span>${bar((f.soiling / 0.3) * 100, "dust")}<b class="t-num">${pct(f.soiling)}</b></div>
    </div>
    <ul class="hud-acts">${ex.actions.filter((a) => a.state !== "idle").map((a) => `<li class="${a.state} ${a.domain}"><i></i>${esc(a.name)}<small>${a.state === "blocked" ? esc(a.reason) : ""}</small></li>`).join("")}</ul>`;
}
function setStep(k) {
  stepK = k;
  const f = stressDay.frames[STOPS[k].i];
  $$("button", clockbar).forEach((b) => b.setAttribute("aria-current", String(+b.dataset.k === k)));
  $$(".pstep", stepsEl).forEach((li) => li.classList.toggle("on", +li.dataset.k === k));
  renderHud(f);
  SCENES.pressure.frame = f;
  if (currentScene === "pressure" && stage) stage.setFrame(f);
}
function goStep(k) {
  const li = $(`.pstep[data-k="${k}"]`, stepsEl);
  li?.scrollIntoView({ behavior: reduce() ? "auto" : "smooth", block: "center" });
  setStep(k);
}
clockbar.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) goStep(+b.dataset.k); });
stepsEl.addEventListener("click", (e) => { const b = e.target.closest("[data-go]"); if (b) goStep(+b.dataset.go); });
const stepIO = new IntersectionObserver((ents) => { for (const e of ents) if (e.isIntersecting) setStep(+e.target.dataset.k); }, { rootMargin: "-45% 0px -50% 0px" });
$$(".pstep", stepsEl).forEach((li) => stepIO.observe(li));
setStep(0);

/* ---------------------------------------------------------------- rail */
const RAIL = [["hero", "Reveal"], ["sun", "Sun"], ["wind", "Wind"], ["rain", "Rain"], ["network", "Network"], ["coord", "Decisions"], ["exploded", "Inside"], ["pressure", "Pressure"], ["os", "OS"]];
const rail = $("#rail");
rail.innerHTML = RAIL.map(([id, name], i) => `<button type="button" data-to="${id}" aria-label="${name}"><span>${String(i + 1).padStart(2, "0")} ${name}</span><i></i></button>`).join("");
rail.addEventListener("click", (e) => {
  const b = e.target.closest("[data-to]"); if (!b) return;
  const el = $(`[data-scene="${b.dataset.to}"]`);
  window.scrollTo({ top: el.offsetTop + (b.dataset.to === "hero" ? 0 : 2), behavior: reduce() ? "auto" : "smooth" });
});

/* ---------------------------------------------------------------- scroll engine */
const sceneEls = $$("[data-scene]");
const order = sceneEls.map((el) => el.dataset.scene);

function poseFor(id) {
  const p = SCENES[id].pose;
  if (!isMobile()) return p;
  // mobile: pull back and centre
  // mobile: pull back; text sits at the top of the hero and at the bottom elsewhere
  const k = 1.38, dy = id === "hero" ? 2.3 : id === "pressure" ? 1.2 : -1.4;
  return { pos: p.pos.map((v, i) => p.target[i] + (v - p.target[i]) * k), target: [p.target[0], p.target[1] + dy, p.target[2]], fov: (p.fov || 30) + 4 };
}
function applyScene(id) {
  if (id === currentScene) return;
  currentScene = id;
  const s = SCENES[id];
  document.body.dataset.scene = id;
  $$("button", rail).forEach((b) => b.setAttribute("aria-current", String(b.dataset.to === id)));
  if (!stage) return;
  stage.setFrame(s.frame || FR.hero);
  stage.setExplode(s.explode || 0);
  stage.setSchematic(s.schem || 0);
  stage.setEnvironment(s.env ?? 1);
  stage.setFlows(s.flows || "off", s.filter ? new Set(s.filter) : null);
  stage.setFocus(s.focus || null);
  stage.setHoverEnabled(!!s.pick);
  if (id !== "exploded") stage.setSelected(null);
  else showPart(null);
  stage.setShift(isMobile() ? 0 : s.shift || 0);
  mountAnnos(s.annos || [], s.frame);
}
function onScroll() {
  const y = scrollY, h = innerHeight, probe = y + h * 0.5;
  let i = 0;
  const tops = sceneEls.map((el) => el.offsetTop);
  while (i < tops.length - 1 && probe >= tops[i + 1]) i++;
  const a = tops[i], b = i < tops.length - 1 ? tops[i + 1] : a + sceneEls[i].offsetHeight;
  const u = clamp((probe - a) / Math.max(1, b - a));
  const t = i < order.length - 1 ? ease(clamp((u - 0.62) / 0.38)) : 0;
  applyScene(t > 0.5 ? order[i + 1] : order[i]);
  if (!stage || intro) return;
  const A = poseFor(order[i]), B = poseFor(order[Math.min(i + 1, order.length - 1)]);
  stage.setPoseNow({ pos: A.pos.map((v, k) => lerp(v, B.pos[k], t)), target: A.target.map((v, k) => lerp(v, B.target[k], t)), fov: lerp(A.fov || 30, B.fov || 30, t) });
}
let ticking = false;
addEventListener("scroll", () => {
  if (intro && scrollY > 10) intro = null;
  if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; onScroll(); }); }
}, { passive: true });
addEventListener("resize", () => { currentScene = null; onScroll(); });

if (stage) {
  stage.on("tick", placeAnnos);
  if (scrollY < 20 && !reduce()) {
    // cinematic reveal: from a high aerial approach down to the hero composition
    const hp = poseFor("hero");
    stage.setPoseNow({ pos: [hp.pos[0] * 2.3, hp.pos[1] * 4.2, hp.pos[2] * 2.1], target: [hp.target[0] + 2, hp.target[1] - 1, hp.target[2] - 2], fov: 34 });
    applyScene("hero");
    intro = true;
    requestAnimationFrame(() => {
      stage.setPose(hp, 2800);
      setTimeout(() => { intro = null; }, 2850);
    });
  } else onScroll();
} else onScroll();
document.body.classList.add("ready");
