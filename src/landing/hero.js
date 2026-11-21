// Hero conditions dock + "How it decides" trace.
// One shared state: choosing a condition runs the control engine once and
// updates the 3D model (via the welos:condition event), the dock and the trace.
import { CONDITIONS, MODE_LABEL, runCondition } from "../os/scenarios.js";
import { modeReason as explainMode } from "../os/explain.js";

const $ = (s) => document.querySelector(s);
const f1 = (x) => (Math.abs(x) < 0.05 ? "0" : x.toFixed(1));
const RM = matchMedia("(prefers-reduced-motion: reduce)");

function tagsFor(run) {
  const { result: r, sensors: x } = run;
  const p = r.power, w = r.water, o = r.outputs;
  const bat = p.batteryChargeKw - p.batteryDischargeKw;
  const homeFrom = p.renewableKw >= p.servedLoadKw - 0.01 ? "all from sun and wind" : p.batteryDischargeKw > 0.01 ? (p.renewableKw > 0.05 ? "sun, wind and battery" : "from the battery") : "from the grid";
  const tags = {
    pv: { code: "SUN", value: `${f1(p.pvKw)} kW`, note: x.soilingIndex >= 0.15 ? `Dust is costing ${Math.round(x.soilingIndex * 100)}%` : `${Math.round(x.solarIrradianceWm2)} W/m²` },
    wind: { code: "WIND", value: o.windBrake ? "Braked" : `${f1(p.windKw)} kW`, note: `${x.windSpeedMs.toFixed(1)} m/s${o.windBrake ? ", above the 15 m/s limit" : ""}` },
    bat: { code: "BATTERY", value: Math.abs(bat) < 0.05 ? "Idle" : bat > 0 ? `Charging ${f1(bat)} kW` : `Supplying ${f1(-bat)} kW`, note: `${Math.round(x.batterySoc)}% full · keeps ${p.reserveSoc}%` },
    home: { code: "HOME", value: `${f1(p.servedLoadKw)} kW`, note: homeFrom },
  };
  if (w.storageActive || w.firstFlushActive) tags.water = { code: "WATER", value: w.storageActive ? `${w.captureRateLpm.toFixed(0)} L/min to the tank` : "Diverting first flush", note: "rain off the canopy" };
  else if (o.cleaningPump) tags.water = { code: "WATER", value: "Rinsing the panels", note: "12 L from the tank" };
  return tags;
}

function flowsFor(run) {
  const p = run.result.power, x = run.sensors;
  const bat = p.batteryChargeKw - p.batteryDischargeKw;
  const grid = !x.gridAvailable ? "Off" : p.gridImportKw > 0.05 ? `−${f1(p.gridImportKw)} kW` : p.gridExportKw > 0.05 ? `+${f1(p.gridExportKw)} kW` : "0 kW";
  return [
    ["Sun", `${f1(p.pvKw)} kW`, "s"],
    ["Wind", run.result.outputs.windBrake ? "Braked" : `${f1(p.windKw)} kW`, "w"],
    ["Battery", Math.abs(bat) < 0.05 ? "Idle" : `${bat > 0 ? "+" : "−"}${f1(Math.abs(bat))} kW`, "k"],
    ["Grid", grid, "g"],
    ["Home", `${f1(p.servedLoadKw)} kW`, "h"],
  ];
}

const modeReason = (run) => explainMode(run.result, run.sensors, run.config);

function routeLines(run) {
  const { result: r } = run;
  const p = r.power, w = r.water, o = r.outputs;
  const lines = [];
  lines.push(`Home gets ${f1(p.servedLoadKw)} kW: ${f1(Math.min(p.renewableKw, p.servedLoadKw))} from sun and wind${p.batteryDischargeKw > 0.01 ? `, ${f1(p.batteryDischargeKw)} from the battery` : ""}${p.gridImportKw > 0.01 ? `, ${f1(p.gridImportKw)} from the grid` : ""}.`);
  if (p.batteryChargeKw > 0.01) lines.push(`Surplus ${f1(p.batteryChargeKw)} kW charges the battery${p.gridExportKw > 0.01 ? `; ${f1(p.gridExportKw)} kW exports` : ""}.`);
  if (p.batteryDischargeKw > 0.01) lines.push(`Battery may discharge down to its ${p.reserveSoc}% reserve.`);
  if (o.windBrake) lines.push("Turbine brake applied; wind contactor open.");
  if (w.firstFlushActive) lines.push("First-flush valve open: dirty runoff diverted.");
  if (w.storageActive) lines.push(`Storage valve open: ${w.captureRateLpm.toFixed(0)} L/min through the filters to the tank.`);
  if (o.cleaningPump) lines.push("Cleaning pump on for a 180-second rinse.");
  return lines;
}

function senseLines(run) {
  const x = run.sensors;
  return [
    ["Sunlight", `${Math.round(x.solarIrradianceWm2)} W/m²`],
    ["Wind", `${x.windSpeedMs.toFixed(1)} m/s`],
    ["Rain", `${x.rainfallMmHr || 0} mm/h`],
    ["Dust loss", `${Math.round(x.soilingIndex * 100)}%`],
    ["Battery", `${Math.round(x.batterySoc)}%`],
    ["Grid", x.gridAvailable ? "On" : "Off"],
  ];
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

let current = null;
const listeners = [];
export function onCondition(fn) { listeners.push(fn); if (current) fn(current); }

export function setCondition(id) {
  const run = runCondition(id);
  run.tags = tagsFor(run);
  current = run;
  window.__welosCondition = run;
  dispatchEvent(new CustomEvent("welos:condition", { detail: run }));
  listeners.forEach((fn) => fn(run));
}

function chipRow(container, name) {
  container.innerHTML = CONDITIONS.map((c) => `<button type="button" role="radio" class="chip" data-id="${c.id}" aria-checked="false">${esc(c.label)}</button>`).join("");
  const btns = [...container.querySelectorAll(".chip")];
  container.addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (b) { stopTour(); setCondition(b.dataset.id); } });
  container.addEventListener("keydown", (e) => {
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
    e.preventDefault();
    const i = btns.findIndex((b) => b.dataset.id === current?.cond.id);
    const n = btns[(i + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : btns.length - 1)) % btns.length];
    stopTour(); setCondition(n.dataset.id); n.focus();
  });
  onCondition((run) => btns.forEach((b) => {
    const on = b.dataset.id === run.cond.id;
    b.setAttribute("aria-checked", on); b.tabIndex = on ? 0 : -1; b.classList.toggle("on", on);
  }));
  container.setAttribute("aria-label", name);
}

/* ---------- dock ---------- */
function mountDock() {
  chipRow($("#condChips"), "Operating condition");
  onCondition((run) => {
    $("#cClock").textContent = run.cond.clock;
    $("#cMode").textContent = MODE_LABEL[run.result.mode];
    $("#cMode").dataset.mode = run.result.mode;
    $("#cDec").textContent = run.result.nextState.lastDecision;
    $("#cFlows").innerHTML = flowsFor(run).map(([k, v, c]) => `<div class="${c}"><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  });
}

/* ---------- auto tour: shows the system responding before anyone touches it ---------- */
let tour = null;
const pauseBtn = () => $("#condPause");
function startTour() {
  if (RM.matches) { pauseBtn().hidden = true; return; }
  let i = 0;
  tour = setInterval(() => {
    if (document.hidden || scrollY > innerHeight * 0.5) return;
    i = (CONDITIONS.findIndex((c) => c.id === current.cond.id) + 1) % CONDITIONS.length;
    setCondition(CONDITIONS[i].id);
  }, 6500);
  pauseBtn().textContent = "Pause tour"; pauseBtn().setAttribute("aria-pressed", "false");
}
function stopTour() {
  if (!tour) return;
  clearInterval(tour); tour = null;
  pauseBtn().textContent = "Resume tour"; pauseBtn().setAttribute("aria-pressed", "true");
}

/* ---------- trace ---------- */
function mountTrace() {
  const el = $("#trace");
  el.innerHTML = `<div class="chips trace-chips" role="radiogroup"></div>
    <ol class="stages">
      <li class="stage" data-i="0"><span class="w-code">01</span><h3>Sense</h3><p class="stage-sub">Read every sensor</p><dl class="stage-body" data-k="sense"></dl></li>
      <li class="stage" data-i="1"><span class="w-code">02</span><h3>Protect</h3><p class="stage-sub">Safety checks run first</p><div class="stage-body" data-k="protect"></div></li>
      <li class="stage" data-i="2"><span class="w-code">03</span><h3>Choose a mode</h3><p class="stage-sub">Highest-priority rule wins</p><div class="stage-body" data-k="mode"></div></li>
      <li class="stage" data-i="3"><span class="w-code">04</span><h3>Route</h3><p class="stage-sub">Power and water, in order</p><div class="stage-body" data-k="route"></div></li>
    </ol>
    <p class="trace-note"><span class="w-src engine">Engine output</span> Computed by <code>evaluateController()</code> from the simulated inputs in step 01.</p>`;
  chipRow(el.querySelector(".trace-chips"), "Condition to trace");
  const body = (k) => el.querySelector(`[data-k="${k}"]`);
  const stages = [...el.querySelectorAll(".stage")];
  onCondition((run) => {
    const { result: r } = run;
    body("sense").innerHTML = senseLines(run).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
    const alarms = r.alarms.filter((a) => a.id !== "TANK_HIGH");
    body("protect").innerHTML = alarms.length
      ? `<ul>${alarms.map((a) => `<li class="${a.severity}"><b>${esc(a.title)}</b>${esc(a.detail)}</li>`).join("")}</ul>`
      : `<p>No alarms. Battery, inverter, leak and temperature interlocks are clear.</p>`;
    body("mode").innerHTML = `<p class="mode-name" data-mode="${r.mode}">${MODE_LABEL[r.mode]}</p><p>${esc(modeReason(run))}</p>`;
    body("route").innerHTML = `<ul>${routeLines(run).map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
    if (!RM.matches) stages.forEach((s, i) => { s.classList.remove("lit"); void s.offsetWidth; s.style.setProperty("--d", `${i * 110}ms`); s.classList.add("lit"); });
  });
}

export function mountHero() {
  mountDock();
  mountTrace();
  pauseBtn().addEventListener("click", () => (tour ? stopTour() : startTour()));
  setCondition("noon");
  startTour();
}
