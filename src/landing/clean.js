// The self-cleaning demonstration. Every check, the decision and the blocked
// states come from evaluateController(); the picture only shows them.
import { createControllerState, evaluateController, MODES } from "../control/engine.js";
import { createInitialSensors } from "../control/simulator.js";
import { referencePlant } from "../os/scenarios.js";
import { pvKw } from "../os/reference.js";
import { icon } from "../design/icons.js";

const $ = (s, r = document) => r.querySelector(s);
const RM = matchMedia("(prefers-reduced-motion: reduce)");
const f1 = (x) => (Math.round(x * 10) / 10).toLocaleString("en-US");

const PRESETS = [
  { id: "ok", label: "Dusty evening", s: { soil: 22, wind: 2.5, sun: 180, tank: 64 } },
  { id: "wind", label: "Windy afternoon", s: { soil: 22, wind: 7.5, sun: 200, tank: 64 } },
  { id: "noon", label: "Midday heat", s: { soil: 22, wind: 2.5, sun: 880, tank: 64 } },
  { id: "tank", label: "Low tank", s: { soil: 22, wind: 2.5, sun: 180, tank: 18 } },
];
const CHECKS = [
  { k: "dust", label: "Dust is worth cleaning", blocker: "Soiling below trigger", ico: "dust" },
  { k: "water", label: "Enough water in the tank", blocker: "Water reserve too low", ico: "tank" },
  { k: "wind", label: "Calm enough for the spray", blocker: "Wind speed unsafe", ico: "wind" },
  { k: "sun", label: "Sun low enough", blocker: "Irradiance too high", ico: "sun" },
  { k: "heat", label: "Panels cool enough", blocker: "Panel temperature too high", ico: "temp" },
];

const st = { soil: 22, wind: 2.5, sun: 180, tank: 64, rinsing: false };

function evaluate() {
  const { config, plant } = referencePlant();
  const ambient = 34;
  const panelTempC = ambient + st.sun * 0.024;
  const sensors = {
    ...createInitialSensors(), rainfallMmHr: 0, gridAvailable: true, waterTurbidityNtu: 1.2, batteryTempC: 30, loadPowerKw: 2.4, batterySoc: 70,
    soilingIndex: st.soil / 100, windSpeedMs: st.wind, solarIrradianceWm2: st.sun, ambientTempC: ambient, panelTempC, tankLevelPct: st.tank,
    pvPowerKw: pvKw(plant, st.sun, panelTempC, st.soil / 100), windPowerKw: 0,
  };
  const r = evaluateController({ sensors, previousState: { ...createControllerState(), uptimeSeconds: 600 }, config, dtSeconds: 60 });
  return { r, sensors, config, plant };
}

function panelSvg() {
  // a close-up of three modules under the rinse rail, drawn in the model's colours
  let cells = "", dust = "", seed = 3;
  for (let m = 0; m < 3; m++) for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) cells += `<rect x="${40 + m * 150 + c * 23}" y="${70 + r * 34}" width="21" height="32" rx="1.5"/>`;
  for (let i = 0; i < 520; i++) { seed = (seed * 9301 + 49297) % 233280; const x = 40 + (seed / 233280) * 438; seed = (seed * 9301 + 49297) % 233280; const y = 70 + (seed / 233280) * 134; dust += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(1 + (i % 3) * 0.6).toFixed(1)}" style="--i:${i}"/>`; }
  let nozzles = "", spray = "";
  for (let n = 0; n < 9; n++) { const x = 58 + n * 50; nozzles += `<rect x="${x - 3}" y="52" width="6" height="8" rx="1"/>`; spray += `<path d="M${x} 60 L${x - 16} 120 M${x} 60 L${x} 130 M${x} 60 L${x + 16} 120" style="--n:${n}"/>`; }
  let windL = "";
  for (let w = 0; w < 6; w++) windL += `<path d="M${-30 - w * 14} ${62 + w * 24} h70" style="--w:${w}"/>`;
  return `<svg viewBox="0 0 520 250" class="cl-svg" role="img" aria-labelledby="clStatus">
    <g class="cl-wind">${windL}</g>
    <g class="cl-sun"><circle cx="478" cy="26" r="12"/><g class="cl-rays"><path d="M478 6v-6M478 52v-6M458 26h-6M504 26h-6M464 12l-4-4M492 12l4-4M464 40l-4 4M492 40l4 4"/></g></g>
    <rect x="34" y="64" width="450" height="146" rx="4" class="cl-frame"/>
    <g class="cl-cells">${cells}</g>
    <g class="cl-dust">${dust}</g>
    <g class="cl-spray">${spray}</g>
    <rect x="34" y="48" width="452" height="8" rx="3" class="cl-rail"/><g class="cl-noz">${nozzles}</g>
    <path d="M34 214 H486" class="cl-gutter"/>
    <text x="34" y="40" class="cl-t">S05 rinse rail</text><text x="34" y="236" class="cl-t">S03 gutter returns rinse water to the tank</text>
  </svg>`;
}

function slider(id, label, unit, min, max, step) {
  return `<div class="cl-sl"><label for="cl-${id}">${label}</label><output id="clo-${id}"></output><input type="range" id="cl-${id}" min="${min}" max="${max}" step="${step}"></div>`;
}

function render() {
  const { r, sensors, config, plant } = evaluate();
  const blockers = r.cleaning.blockers;
  const fig = $("#clean .cl-fig");
  fig.style.setProperty("--dust", (st.soil / 30).toFixed(3));
  fig.style.setProperty("--windy", Math.min(1, st.wind / 10).toFixed(3));
  fig.style.setProperty("--sunlvl", Math.min(1, st.sun / 900).toFixed(3));
  fig.classList.toggle("blocked", !r.cleaning.eligible && st.soil >= 15);
  for (const [k, v, u] of [["soil", st.soil, "% lost"], ["wind", st.wind, " m/s"], ["sun", st.sun, " W/m²"], ["tank", st.tank, "% full"]]) {
    $(`#clo-${k}`).textContent = `${k === "wind" ? f1(v) : Math.round(v)}${u}`;
    $(`#cl-${k}`).value = v;
  }
  // the five engine checks
  const limit = { dust: `≥ ${config.cleaningSoilingThreshold * 100}%`, water: `≥ ${config.tankCleaningReservePct}%`, wind: `< ${config.cleaningMaxWindMs} m/s`, sun: `≤ ${config.cleaningMaxIrradianceWm2} W/m²`, heat: `≤ ${config.cleaningMaxPanelTempC} °C` };
  const now = { dust: `${st.soil}%`, water: `${Math.round(st.tank)}%`, wind: `${f1(st.wind)} m/s`, sun: `${st.sun} W/m²`, heat: `${Math.round(sensors.panelTempC)} °C` };
  $("#clean .cl-checks").innerHTML = CHECKS.map((c) => {
    const ok = !blockers.includes(c.blocker);
    return `<li class="${ok ? "ok" : "no"}"><span class="cl-ico">${icon(c.ico)}</span><span class="cl-l">${c.label}<small>${now[c.k]} · needs ${limit[c.k]}</small></span><b aria-label="${ok ? "passes" : "fails"}">${ok ? "✓" : "✕"}</b></li>`;
  }).join("");
  // decision
  const lostKw = pvKw(plant, Math.max(st.sun, 600), sensors.panelTempC, 0) - pvKw(plant, Math.max(st.sun, 600), sensors.panelTempC, st.soil / 100);
  const dayLossKwh = (st.soil / 100) * 45.5;
  let status, cls;
  if (st.rinsing) { status = "Rinsing: 12 L over 3 minutes, pump on stored solar power."; cls = "go"; }
  else if (r.mode === MODES.CLEANING) { status = `Cleaning now: dust is costing ${st.soil}%, and every safety check passes.`; cls = "go"; }
  else if (st.soil < config.cleaningSoilingThreshold * 100) { status = "Not worth cleaning yet: dust is below the 15% trigger."; cls = "idle"; }
  else if (r.cleaning.eligible) { status = `Safe to clean. It starts on its own at ${config.cleaningAutoThreshold * 100}%, or rinse now.`; cls = "ok"; }
  else { status = `Holding: ${blockers.map((b) => b.toLowerCase()).join(", ")}. It waits rather than waste water or risk the panels.`; cls = "hold"; }
  const s = $("#clStatus"); s.textContent = status; s.className = `cl-status ${cls}`;
  $("#clLoss").innerHTML = `<b>${f1(dayLossKwh)} kWh</b> a day lost to dust at this level <span class="w-src target">Estimate · reference villa</span>`;
  const btn = $("#clRun");
  btn.disabled = st.rinsing || !r.cleaning.eligible;
  btn.textContent = st.rinsing ? "Rinsing…" : r.cleaning.eligible ? "Rinse now" : "Rinse blocked";
  fig.classList.toggle("rinsing", st.rinsing);
  return { lostKw };
}

function rinse() {
  const before = st.soil;
  st.rinsing = true; render();
  const tankDrop = (12 / referencePlant().plant.tankL) * 100;
  setTimeout(() => {
    st.rinsing = false; st.soil = 3; st.tank = Math.max(0, Math.round(st.tank - tankDrop));
    render();
    $("#clStatus").textContent = `Clean. Dust went from ${before}% to about 3%; the tank gave up 12 L (${Math.round(tankDrop)}% of a 300 L tank).`;
    $("#clStatus").className = "cl-status done";
  }, RM.matches ? 300 : 3200);
}

export function mountClean() {
  const el = $("#clean .cl-app");
  if (!el) return;
  el.innerHTML = `
    <figure class="cl-fig viz">${panelSvg()}<figcaption><p id="clStatus" class="cl-status" aria-live="polite"></p><p id="clLoss" class="cl-loss"></p></figcaption></figure>
    <div class="cl-side">
      <div class="chips cl-presets" role="group" aria-label="Try a situation">${PRESETS.map((p) => `<button type="button" class="chip" data-p="${p.id}">${p.label}</button>`).join("")}</div>
      <div class="cl-sliders">${slider("soil", "Dust on the panels", "", 0, 30, 1)}${slider("wind", "Wind", "", 0, 12, 0.5)}${slider("sun", "Sunlight", "", 0, 1000, 10)}${slider("tank", "Tank level", "", 0, 100, 1)}</div>
      <h3 class="cl-h">The controller's five checks</h3>
      <ul class="cl-checks" aria-live="polite"></ul>
      <button type="button" class="w-btn ink cl-run" id="clRun">Rinse now</button>
      <p class="cl-note"><span class="w-src engine">Engine output</span> Checks and thresholds from <code>evaluateController()</code>.</p>
    </div>`;
  el.addEventListener("input", (e) => { const k = e.target.id?.replace("cl-", ""); if (k in st) { st[k] = +e.target.value; render(); } });
  el.addEventListener("click", (e) => {
    const p = e.target.closest("[data-p]");
    if (p) { Object.assign(st, PRESETS.find((x) => x.id === p.dataset.p).s); el.querySelectorAll("[data-p]").forEach((b) => b.classList.toggle("on", b === p)); render(); }
  });
  $("#clRun").addEventListener("click", rinse);
  el.querySelector("[data-p='ok']").classList.add("on");
  render();
}
