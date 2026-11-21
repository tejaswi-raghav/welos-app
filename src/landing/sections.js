// Below-the-story sections: the problem, the sizing demo with its day simulation,
// and the scale comparison. Every number is computed here by the real engines.
import { sizeSystem, TIERS, PACKAGES, RATES, CURRENCY } from "../site/sizing.js";
import { PRESETS, DEFAULT_PRESET, saveBuild, loadBuild } from "../site/presets.js";
import { simulateDay } from "../os/day.js";
import { referenceBuild } from "../os/reference.js";
import { DEFAULT_CONFIG } from "../control/engine.js";
import { mountDayChart } from "../viz/dayChart.js";

const $ = (s) => document.querySelector(s);
const n0 = (x) => Math.round(x).toLocaleString("en-US");
const n1 = (x) => (Math.round(x * 10) / 10).toLocaleString("en-US");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const byId = (r) => Object.fromEntries(r.components.map((c) => [c.id, c]));
const SRC = { engine: '<span class="w-src engine">Engine output</span>', assume: '<span class="w-src target">Engine assumption</span>', sim: '<span class="w-src sim">Simulated day</span>' };

/* ---------- the problem: same villa, before and after ---------- */
function mountCompare() {
  const r = referenceBuild();
  const by = byId(r), T = r.totals, day = simulateDay(r);
  const gridAed = r.site.loadKwhDay * 365 * RATES.tariffPerKwh;
  const rows = [
    { k: "Electricity",
      before: `All ${n0(r.site.loadKwhDay)} kWh a day comes from the grid: about ${CURRENCY} ${n0(gridAed)} a year at ${CURRENCY} ${RATES.tariffPerKwh}/kWh.`, bs: SRC.assume,
      after: `The canopy makes ${n0(Math.min(T.energyCoveragePct, 999))}% of a year's use. On an average day ${Math.round(day.totals.selfSufficiencyPct)}% of the home's power comes from the roof and battery.`, as: `${SRC.engine} ${SRC.sim}` },
    { k: "Dust",
      before: `In a dry climate dust quietly takes up to ${Math.round(by.cleaning.metrics.soilingRaw * 100)}% of a panel's output.`, bs: SRC.assume,
      after: `A clean reference cell measures the loss; cleaning holds it near ${n1(by.cleaning.metrics.soilingManaged * 100)}%.`, as: SRC.assume },
    { k: "Water",
      before: `${n0(r.climate.rain)} mm of rain a year runs off the roof, and AC condensate goes down the drain.`, bs: SRC.engine,
      after: `${n0(T.waterLYear)} L a year captured from rain and condensate, filtered for irrigation and rinsing.`, as: SRC.engine },
    { k: "Outages",
      before: "When the grid drops, the house goes dark.", bs: "",
      after: `The ${n0(by.battery.metrics.batteryKwh)} kWh battery keeps a ${DEFAULT_CONFIG.batteryStormReserveSoc}% reserve whenever a storm or outage is detected.`, as: SRC.engine },
  ];
  $("#compare").innerHTML = `
    <div class="cmp-head" aria-hidden="true"><span></span><span>Roof today</span><span>With WELOS</span></div>
    ${rows.map((x) => `<div class="cmp-row"><h3>${x.k}</h3><p class="b"><span class="cmp-m">Roof today</span>${x.before}${x.bs ? `<br>${x.bs}` : ""}</p><p class="a"><span class="cmp-m">With WELOS</span>${x.after}<br>${x.as}</p></div>`).join("")}
    <p class="cmp-foot">Reference: ${esc(DEFAULT_PRESET.name)} villa, ${TIERS.S.roofM2} m² roof, ${n0(r.site.loadKwhDay)} kWh/day, ${esc(r.package.name)} build: ${n1(by.solar.metrics.pvKwp)} kWp solar, ${n0(by.battery.metrics.batteryKwh)} kWh battery, ${n0(by.water.metrics.tankL)} L tank. Installed estimate ${CURRENCY} ${n0(T.totalAed)}, payback about ${n1(T.paybackYears)} years.</p>`;
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
  $("#demoOut").innerHTML = `
    <div class="build">
      <div><span class="k">Solar</span><b>${n1(by.solar.metrics.pvKwp)} <small>kWp</small></b><span class="s">${by.solar.metrics.modules} modules${by.solar.metrics.modules >= by.solar.metrics.maxModules ? " · roof full" : ""}</span></div>
      <div><span class="k">Battery</span><b>${n0(by.battery.metrics.batteryKwh)} <small>kWh</small></b><span class="s">LiFePO4</span></div>
      <div><span class="k">Water tank</span><b>${n0(by.water.metrics.tankL)} <small>L</small></b><span class="s">${by.water.capacity.text.split("· ")[1] || ""}</span></div>
      <div><span class="k">Wind</span><b>${w.included ? `${n0(w.capacity.value)} <small>kW</small>` : "—"}</b><span class="s">${w.included ? w.capacity.text : "Not fitted"}</span></div>
    </div>
    <div class="cover">
      <div class="bar"><div class="bar-top"><span>Electricity made on the roof, per year</span><b>${n0(T.energyCoveragePct)}%</b></div><div class="track"><i class="e" style="width:${pct(T.energyCoveragePct)}%"></i></div></div>
      <div class="bar"><div class="bar-top"><span>Non-potable water covered, per year</span><b>${n0(T.waterCoveragePct)}%</b></div><div class="track"><i class="b" style="width:${pct(T.waterCoveragePct)}%"></i></div></div>
    </div>
    <div class="money">
      <div><span class="k">Installed estimate</span><b>${CURRENCY} ${n0(T.totalAed)}</b></div>
      <div><span class="k">Saves per year</span><b>${CURRENCY} ${n0(T.annualSavingsAed)}</b></div>
      <div><span class="k">Payback</span><b>${T.paybackYears ? n1(T.paybackYears) : "—"} <small>years</small></b></div>
    </div>
    <p class="why">${esc(by.solar.why)}</p>
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

/* ---------- scales ---------- */
function mountScales() {
  const c = DEFAULT_PRESET.climate;
  const cols = Object.values(TIERS).map((t) => ({ t, rec: sizeSystem(c, t.id), ess: sizeSystem(c, t.id, {}, {}, "essential") }));
  const row = (label, fn) => `<tr><th scope="row">${label}</th>${cols.map((x) => `<td>${fn(x)}</td>`).join("")}</tr>`;
  $("#scaleTable").innerHTML = `<table>
    <thead><tr><td></td>${cols.map(({ t }) => `<th scope="col"><span class="w-code">WELOS ${t.id}</span>${t.name}<small>${t.audience}</small></th>`).join("")}</tr></thead>
    <tbody>
      ${row("Typical roof", ({ t }) => `${n0(t.roofM2)} m²`)}
      ${row("Electricity use", ({ t }) => `${n0(t.loadKwhDay)} kWh/day`)}
      ${row("Solar", ({ rec }) => `${n1(byId(rec).solar.metrics.pvKwp)} kWp`)}
      ${row("Battery", ({ rec }) => `${n0(byId(rec).battery.metrics.batteryKwh)} kWh`)}
      ${row("Water tank", ({ rec }) => `${n0(byId(rec).water.metrics.tankL)} L`)}
      ${row("Wind at roof height", ({ rec }) => { const w = byId(rec).wind; return `${n1(w.metrics.hubWindMs)} m/s · ${w.recommended ? "fitted" : "not worth it"}`; })}
      ${row("Installed estimate", ({ rec, ess }) => `${CURRENCY} ${n0(rec.totals.totalAed)}<small>from ${CURRENCY} ${n0(ess.totals.totalAed)} as Essential</small>`)}
      ${row("Payback", ({ rec }) => `${n1(rec.totals.paybackYears)} years`)}
    </tbody>
    <tfoot><tr><td></td>${cols.map(({ t }) => `<td><button type="button" class="w-btn line" data-tier="${t.id}">Size a ${t.name.toLowerCase()}</button></td>`).join("")}</tr></tfoot>
  </table><p class="scales-foot"><span class="w-src engine">Engine output</span> Dubai climate, Recommended package. Indicative 2026 prices.</p>`;
  $("#scaleTable").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tier]"); if (!b) return;
    setTier(b.dataset.tier);
    $("#demo").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });
}

export function mountSections() {
  mountCompare();
  mountDemo();
  mountScales();
}
