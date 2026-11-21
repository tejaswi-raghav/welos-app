// Below-the-story sections: the problem, the sizing demo with its day simulation,
// and the scale comparison. Every number is computed here by the real engines.
import { sizeSystem, TIERS, PACKAGES, RATES, CURRENCY } from "../site/sizing.js";
import { PRESETS, DEFAULT_PRESET, saveBuild, loadBuild } from "../site/presets.js";
import { simulateDay } from "../os/day.js";
import { referenceBuild } from "../os/reference.js";
import { DEFAULT_CONFIG } from "../control/engine.js";
import { mountDayChart } from "../viz/dayChart.js";
import { waffle, dust, cube, battery, hours, panels, bathtubs, payback, revealOnScroll } from "../viz/explain.js";
import { icon } from "../design/icons.js";
import { mountClean } from "./clean.js";

const $ = (s) => document.querySelector(s);
const n0 = (x) => Math.round(x).toLocaleString("en-US");
const n1 = (x) => (Math.round(x * 10) / 10).toLocaleString("en-US");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const byId = (r) => Object.fromEntries(r.components.map((c) => [c.id, c]));
const SRC = { engine: '<span class="w-src engine">Engine output</span>', assume: '<span class="w-src target">Engine assumption</span>', sim: '<span class="w-src sim">Simulated day</span>' };

/* ---------- what it changes: one picture, one number, one line each ---------- */
const ESSENTIALS_KW = 0.6; // fridge, lights, router, fans: an illustrative essentials load
function mountCompare() {
  const r = referenceBuild();
  const by = byId(r), T = r.totals, day = simulateDay(r);
  const reserveKwh = by.battery.metrics.batteryKwh * DEFAULT_CONFIG.batteryStormReserveSoc / 100;
  const side = Math.cbrt(T.waterLYear / 1000);
  const tiles = [
    { ico: "sun", k: "Power", viz: waffle(day.totals.selfSufficiencyPct, { label: `${Math.round(day.totals.selfSufficiencyPct)} of 100 squares lit: share of a day's power from the roof and battery` }),
      big: `${Math.round(day.totals.selfSufficiencyPct)}%`, line: "of an average day's power comes from your own roof and battery.", was: "Today: every unit is bought from the grid.", src: `${SRC.engine} ${SRC.sim}` },
    { ico: "dust", k: "Dust", viz: dust(by.cleaning.metrics.soilingRaw, by.cleaning.metrics.soilingManaged),
      big: `${n0(by.cleaning.metrics.recoveredKwhYear)} kWh`, line: "a year won back by cleaning at the right moment.", was: `Today: dust quietly takes up to ${Math.round(by.cleaning.metrics.soilingRaw * 100)}%.`, src: SRC.engine },
    { ico: "drop", k: "Water", viz: cube(T.waterLYear),
      big: `${n0(T.waterLYear)} L`, line: `a year from rain and AC condensate: a ${n1(side)} m cube beside a person.`, was: "Today: it runs down the drain.", src: SRC.engine },
    { ico: "battery", k: "Outages", viz: `<div class="tile-row">${battery(by.battery.metrics.batteryKwh, 0, { reservePct: DEFAULT_CONFIG.batteryStormReserveSoc })}${hours(reserveKwh / ESSENTIALS_KW)}</div>`,
      big: `${n0(reserveKwh)} kWh`, line: `always held back for storms and outages: about ${Math.round(reserveKwh / ESSENTIALS_KW)} hours of essentials.`, was: "Today: when the grid drops, the house goes dark.", src: `${SRC.engine} <span class="w-src target">Essentials at ${ESSENTIALS_KW} kW, assumed</span>` },
  ];
  $("#compare").innerHTML = tiles.map((t) => `<article class="tile viz anim"><p class="tile-k">${icon(t.ico)}${t.k}</p><div class="tile-viz">${t.viz}</div><p class="tile-big">${t.big}</p><p class="tile-line">${t.line}</p><p class="tile-was">${t.was}</p><p class="tile-src">${t.src}</p></article>`).join("");
  $("#compareFoot").textContent = `Reference: ${DEFAULT_PRESET.name} villa, ${n0(r.site.loadKwhDay)} kWh a day, ${n1(by.solar.metrics.pvKwp)} kWp solar, ${n0(by.battery.metrics.batteryKwh)} kWh battery.`;
}

/* ---------- sizing demo + day ---------- */
const RANGES = {
  S: { load: [15, 120, 1], roof: [30, 250, 5] },
  M: { load: [100, 900, 10], roof: [150, 1500, 10] },
  L: { load: [600, 6000, 50], roof: [800, 8000, 50] },
};
const state = (() => {
  const saved = loadBuild();
  const preset = PRESETS.find((p) => p.name === saved?.place) || DEFAULT_PRESET;
  const tier = TIERS[saved?.tier] ? saved.tier : "S";
  const inp = saved?.inputs || {};
  return { preset: preset.id, tier, pkg: PACKAGES[saved?.package] ? saved.package : "recommended",
    load: +inp.loadKwhDay || TIERS[tier].loadKwhDay, roof: +inp.roofM2 || TIERS[tier].roofM2,
    wind: typeof saved?.choices?.wind === "boolean" ? saved.choices.wind : null, touched: false };
})();

function segment(name, label, options, value) {
  return `<fieldset class="seg"><legend>${label}</legend><div class="seg-row">${options.map(([v, t, sub]) => `<label><input type="radio" name="${name}" value="${v}" ${v === value ? "checked" : ""}><span>${t}${sub ? `<small>${sub}</small>` : ""}</span></label>`).join("")}</div></fieldset>`;
}
function slider(name, label, unit, [min, max, step], value) {
  return `<div class="sl"><label for="sl-${name}">${label}</label><output id="o-${name}" for="sl-${name}">${n0(value)} ${unit}</output><input type="range" id="sl-${name}" name="${name}" min="${min}" max="${max}" step="${step}" value="${value}"></div>`;
}

function renderForm() {
  const R = RANGES[state.tier];
  $("#demoForm").innerHTML =
    segment("preset", "Climate", PRESETS.map((p) => [p.id, p.name.split(",")[0]]), state.preset) +
    segment("tier", "Building", Object.values(TIERS).map((t) => [t.id, t.name, t.audience.split(" and ")[0]]), state.tier) +
    slider("load", "Electricity use per day", "kWh", R.load, state.load) +
    slider("roof", "Usable roof area", "m²", R.roof, state.roof) +
    segment("pkg", "Package", Object.values(PACKAGES).map((p) => [p.id, p.name]), state.pkg) +
    `<div class="wind-row" id="windRow"></div>`;
}

let chart;
function compute() {
  const preset = PRESETS.find((p) => p.id === state.preset);
  const choices = state.wind == null ? {} : { wind: state.wind };
  const r = sizeSystem(preset.climate, state.tier, { roofM2: state.roof, loadKwhDay: state.load }, choices, state.pkg);
  return { r, preset };
}

function renderResults() {
  const { r, preset } = compute();
  const by = byId(r), T = r.totals, w = by.wind;
  $("#o-load").textContent = `${n0(state.load)} kWh`;
  $("#o-roof").textContent = `${n0(state.roof)} m²`;
  $("#windRow").innerHTML = `<label class="tog"><input type="checkbox" id="windTog" ${w.included ? "checked" : ""}><span>Wind turbine</span></label><p class="wind-why ${w.recommended ? "yes" : "no"}">${w.recommended ? "Recommended here." : "Not recommended here."} ${esc(w.why.split(". ")[0])}.</p>`;
  $("#windTog").addEventListener("change", (e) => { state.wind = e.target.checked; update(); });

  const pct = (v) => Math.min(100, v);
  const nightNeed = by.battery.metrics.nightKwh;
  $("#demoOut").innerHTML = `
    <div class="build viz in">
      <div><span class="k">${icon("sun")}Solar</span><b>${n1(by.solar.metrics.pvKwp)} <small>kWp</small></b>${panels(by.solar.metrics.modules, by.solar.metrics.maxModules)}<span class="s">${by.solar.metrics.modules} panels${by.solar.metrics.modules >= by.solar.metrics.maxModules ? ", roof full" : ""}</span></div>
      <div><span class="k">${icon("battery")}Battery</span><b>${n0(by.battery.metrics.batteryKwh)} <small>kWh</small></b>${battery(by.battery.metrics.batteryKwh, nightNeed)}<span class="s">${by.battery.metrics.batteryKwh >= nightNeed ? "covers a night's use" : `a night needs ${n0(nightNeed)}`}</span></div>
      <div><span class="k">${icon("tank")}Water tank</span><b>${n0(by.water.metrics.tankL)} <small>L</small></b>${bathtubs(by.water.metrics.tankL)}<span class="s">≈ ${n1(by.water.metrics.tankL / 150)} bathtubs</span></div>
      <div><span class="k">${icon("wind")}Wind</span><b>${w.included ? `${n0(w.capacity.value)} <small>kW</small>` : "Off"}</b><span class="windflag ${w.recommended ? "yes" : "no"}">${w.recommended ? "worth it here" : "not worth it here"}</span><span class="s">${n1(w.metrics.hubWindMs)} m/s at roof height</span></div>
    </div>
    <div class="cover">
      <div class="bar"><div class="bar-top"><span>Electricity made on the roof, per year</span><b>${n0(T.energyCoveragePct)}%</b></div><div class="track"><i class="e" style="width:${pct(T.energyCoveragePct)}%"></i></div></div>
      <div class="bar"><div class="bar-top"><span>Non-potable water covered, per year</span><b>${n0(T.waterCoveragePct)}%</b></div><div class="track"><i class="b" style="width:${pct(T.waterCoveragePct)}%"></i></div></div>
    </div>
    <div class="money viz in">
      <div class="money-top"><span>${icon("coin")}<b>${CURRENCY} ${n0(T.totalAed)}</b> installed</span><span>saves <b>${CURRENCY} ${n0(T.annualSavingsAed / 12)}</b> a month</span></div>
      ${payback(T.paybackYears)}
    </div>
    <p class="res-foot"><span class="w-src engine">Engine output</span> Indicative 2026 UAE prices at ${CURRENCY} ${RATES.tariffPerKwh}/kWh, not a quotation. <a href="/studio.html?tier=${state.tier}#configure">Configure in detail →</a></p>`;

  chart.update(simulateDay(r));
  // only remember the build once the visitor has changed something
  if (state.touched) saveBuild({ place: preset.name, climate: preset.climate, tier: state.tier, package: state.pkg, inputs: { roofM2: state.roof, loadKwhDay: state.load }, choices: state.wind == null ? {} : { wind: state.wind } });
}

let raf = 0;
function update() { state.touched = true; cancelAnimationFrame(raf); raf = requestAnimationFrame(renderResults); }

function mountDemo() {
  chart = mountDayChart($("#day"));
  renderForm();
  const form = $("#demoForm");
  form.addEventListener("submit", (e) => e.preventDefault());
  form.addEventListener("input", (e) => {
    const t = e.target;
    if (t.name === "load" || t.name === "roof") { state[t.name] = +t.value; update(); }
  });
  form.addEventListener("change", (e) => {
    const t = e.target;
    if (t.name === "preset") { state.preset = t.value; state.wind = null; update(); }
    if (t.name === "pkg") { state.pkg = t.value; update(); }
    if (t.name === "tier") setTier(t.value);
  });
  renderResults();
}

export function setTier(id) {
  state.tier = id; state.load = TIERS[id].loadKwhDay; state.roof = TIERS[id].roofM2; state.wind = null;
  state.touched = true; renderForm(); renderResults();
}

export function mountSections() {
  mountClean();
  mountCompare();
  mountDemo();
  revealOnScroll();
}
