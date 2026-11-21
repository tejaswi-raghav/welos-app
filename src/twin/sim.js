// WELOS digital twin — one deterministic operating-day simulation for the whole site.
//
// Every page (home story, explorer, lab, control OS) reads frames from this module, so the
// same scenario always produces the same rooftop, the same flows and the same controller
// decisions everywhere. Controller behaviour comes from src/control/engine.js unchanged;
// this file only supplies the environment (sun, wind, rain, dust, load) and integrates
// battery, tank and soiling state between 15-minute steps.
//
// Nothing here is measured data. Every value is a labelled, deterministic simulation of a
// concept reference unit (constants below are the same ones src/control/simulator.js uses).

import { createControllerState, DEFAULT_CONFIG, evaluateController, MODES, projectBatterySoc } from "../control/engine.js";

export const STEP_MIN = 15;
export const STEPS = (24 * 60) / STEP_MIN;
const DT = STEP_MIN * 60;

/** Reference simulation unit. Sources: src/control/simulator.js and engine DEFAULT_CONFIG. */
export const UNIT = Object.freeze({
  name: "Reference unit · concept",
  pvRatedKw: 3.6,            // simulator: irradiance/1000 × 3.6 kW
  pvModules: 6,              // model-data / bom.json S01 qty
  windMaxKw: 1.2,            // simulator clamp
  windCoef: 0.011,           // simulator: 0.011 × v³ kW
  tankL: 420,                // simulator tankCapacityLitres
  batteryKwh: DEFAULT_CONFIG.batteryCapacityKwh,
  captureLpmPerMmHr: 1.8,    // engine captureRateLpm
  soilingPerCleanMin: 0.035, // simulator cleaningRate per minute of rinse
  site: { name: "Dubai rooftop (simulated)", lat: 25.2, lon: 55.27, tz: 4 },
});

export const CLEAN_CYCLE = Object.freeze({
  litres: DEFAULT_CONFIG.cleaningWaterLitres,
  minutes: DEFAULT_CONFIG.cleaningDurationSeconds / 60,
  soilingDrop: UNIT.soilingPerCleanMin * (DEFAULT_CONFIG.cleaningDurationSeconds / 60),
});

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const r = (x, p = 2) => Number(x.toFixed(p));
const bump = (h, mid, w) => Math.exp(-(((h - mid) / w) ** 2));
const win = (h, a, b, edge = 0.5) => clamp((h - a) / edge, 0, 1) * clamp((b - h) / edge, 0, 1);

/** PV derating used by the browser simulator: soiling and cell temperature. */
export function pvEfficiency(soiling, panelTempC) {
  return Math.max(0.55, 1 - soiling * 1.45 - Math.max(0, panelTempC - 25) * 0.0035);
}

/** Solar position for the reference site. Hour is local clock time. */
export function sunPosition(hour, doy = 105, site = UNIT.site) {
  const rad = Math.PI / 180;
  const decl = 23.44 * Math.sin((2 * Math.PI * (284 + doy)) / 365) * rad;
  const solarHour = hour + (site.lon - 15 * site.tz) / 15;
  const H = (solarHour - 12) * 15 * rad;
  const lat = site.lat * rad;
  const sinEl = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H);
  const el = Math.asin(clamp(sinEl, -1, 1));
  const cosAz = (Math.sin(decl) - Math.sin(el) * Math.sin(lat)) / (Math.cos(el) * Math.cos(lat));
  let az = Math.acos(clamp(cosAz, -1, 1));
  if (H > 0) az = 2 * Math.PI - az; // afternoon: west of south
  return { elevationDeg: el / rad, azimuthDeg: az / rad };
}

/** Haurwitz clear-sky global horizontal irradiance, W/m². */
function clearSky(elevationDeg) {
  const s = Math.sin((elevationDeg * Math.PI) / 180);
  return s <= 0.01 ? 0 : 1098 * s * Math.exp(-0.057 / s);
}

// ---------------------------------------------------------------- scenarios
// Each scenario is a set of stated assumptions. Shapes are smooth functions of the hour,
// so values are repeatable and explainable; there is no random number anywhere.
export const SCENARIOS = Object.freeze({
  clear: {
    id: "clear", label: "Clear day", blurb: "Strong sun, light sea breeze, clean air.",
    doy: 105, tMean: 30, tAmp: 6, humidity: 45,
    clearness: () => 0.96, wind: (h) => 2.6 + 1.6 * bump(h, 15, 3.5), rain: () => 0,
    dustPerHour: 0.0025, startSoc: 62, startTank: 58, startSoiling: 0.09, demand: 1, grid: () => true,
  },
  windy: {
    id: "windy", label: "High wind", blurb: "A shamal builds through the afternoon; the turbine carries the evening.",
    doy: 105, tMean: 29, tAmp: 5, humidity: 35,
    clearness: (h) => 0.9 - 0.08 * bump(h, 16, 4), wind: (h) => 5.2 + 5.6 * bump(h, 16.5, 4.5) + 0.6 * Math.sin(h * 1.7), rain: () => 0,
    dustPerHour: 0.006, startSoc: 58, startTank: 55, startSoiling: 0.1, demand: 1, grid: () => true,
  },
  dust: {
    id: "dust", label: "Dust event", blurb: "Haze cuts the sun and dust settles on the canopy all day.",
    doy: 105, tMean: 33, tAmp: 6, humidity: 30,
    clearness: (h) => 0.74 - 0.12 * bump(h, 13, 3), wind: (h) => 3.4 + 1.2 * bump(h, 11, 2.5), rain: () => 0,
    dustPerHour: 0.013, dustShape: (h) => 0.12 + bump(h, 11, 2.6), startSoc: 60, startTank: 64, startSoiling: 0.115, demand: 1.05, grid: () => true,
  },
  rain: {
    id: "rain", label: "Rainfall", blurb: "A convective storm in the late afternoon fills the tank.",
    doy: 30, tMean: 22, tAmp: 4, humidity: 78,
    clearness: (h) => 0.85 - 0.72 * win(h, 14.5, 19.5, 1.2), wind: (h) => 3 + 7.5 * bump(h, 16.5, 1.4),
    rain: (h) => 1.6 * win(h, 15, 19, 0.75) + 7 * bump(h, 16.6, 0.8),
    dustPerHour: 0.002, startSoc: 64, startTank: 28, startSoiling: 0.12, demand: 0.75, grid: () => true,
  },
  lowbatt: {
    id: "lowbatt", label: "Low battery", blurb: "The day starts near the reserve floor after a cloudy evening.",
    doy: 105, tMean: 30, tAmp: 6, humidity: 50,
    clearness: (h) => 0.92 - 0.25 * bump(h, 9, 2), wind: (h) => 2.4 + 1.4 * bump(h, 15, 3.5), rain: () => 0,
    dustPerHour: 0.003, startSoc: 24, startTank: 60, startSoiling: 0.1, demand: 1, grid: () => true,
  },
  demand: {
    id: "demand", label: "High demand", blurb: "A heat wave keeps air-conditioning running hard into the night.",
    doy: 200, tMean: 37, tAmp: 6, humidity: 55,
    clearness: () => 0.9, wind: (h) => 2.8 + 1.4 * bump(h, 15, 3.5), rain: () => 0,
    dustPerHour: 0.004, startSoc: 55, startTank: 50, startSoiling: 0.1, demand: 1.55, grid: () => true,
  },
  outage: {
    id: "outage", label: "Grid outage", blurb: "The utility drops from 17:00 to 23:00; the unit islands itself.",
    doy: 105, tMean: 30, tAmp: 6, humidity: 45,
    clearness: () => 0.95, wind: (h) => 2.4 + 1.3 * bump(h, 15, 3.5), rain: () => 0,
    dustPerHour: 0.003, startSoc: 52, startTank: 58, startSoiling: 0.1, demand: 1, grid: (h) => !(h >= 17 && h < 23),
  },
  stress: {
    id: "stress", label: "Combined stress", blurb: "Dust at noon, wind by afternoon, a storm at dusk, then the grid drops.",
    doy: 105, tMean: 32, tAmp: 6, humidity: 40,
    clearness: (h) => 0.88 - 0.16 * bump(h, 12, 2.5) - 0.62 * win(h, 16.2, 19.2, 0.9),
    wind: (h) => 3.2 + 2.2 * bump(h, 14, 2) + 9.8 * bump(h, 17.3, 1.1),
    rain: (h) => 5.5 * bump(h, 17.6, 0.7) + 1.2 * win(h, 17, 19, 0.5),
    dustPerHour: 0.014, dustShape: (h) => 0.12 + bump(h, 11.5, 2.4), startSoc: 60, startTank: 30, startSoiling: 0.11, demand: 1.15, grid: (h) => !(h >= 19.5 && h < 22.5),
  },
});

export const SCENARIO_ORDER = ["clear", "windy", "dust", "rain", "lowbatt", "demand", "outage", "stress"];

/** Inputs a visitor may change; each multiplies or replaces one stated assumption. */
export const INPUT_DEFS = Object.freeze([
  { id: "startSoc", label: "Battery at 00:00", unit: "%", min: 12, max: 95, step: 1 },
  { id: "startSoiling", label: "Panel soiling at 00:00", unit: "%", min: 0, max: 30, step: 1, scale: 100 },
  { id: "dustPerHour", label: "Dust deposition", unit: "%/h", min: 0, max: 2, step: 0.05, scale: 100 },
  { id: "windScale", label: "Wind strength", unit: "×", min: 0, max: 1.8, step: 0.05 },
  { id: "rainScale", label: "Rain intensity", unit: "×", min: 0, max: 2, step: 0.05 },
  { id: "demand", label: "Household demand", unit: "×", min: 0.5, max: 2, step: 0.05 },
  { id: "startTank", label: "Tank at 00:00", unit: "%", min: 0, max: 100, step: 1 },
]);

export function defaultInputs(scenarioId) {
  const s = SCENARIOS[scenarioId] || SCENARIOS.clear;
  return { startSoc: s.startSoc, startSoiling: s.startSoiling, dustPerHour: s.dustPerHour, windScale: 1, rainScale: 1, demand: s.demand, startTank: s.startTank, gridOutage: false };
}

/** UAE villa load shape (kW), mean ≈ 1.7 kW like the browser simulator. */
function loadAt(h, ambient, demand) {
  const cooling = 0.9 * Math.max(0, Math.sin((Math.PI * (h - 7.5)) / 15)) * clamp((ambient - 22) / 12, 0.2, 1.4);
  const kw = 1.05 + cooling + 0.62 * bump(h, 20.5, 1.8) + 0.28 * bump(h, 7, 1) + 0.04 * Math.sin(h * 2.3);
  return kw * demand;
}

/** Environmental state at an hour, before the controller acts. */
export function environmentAt(scenario, inputs, hour) {
  const s = scenario;
  const sun = sunPosition(hour, s.doy);
  const clear = clamp(s.clearness(hour), 0.05, 1);
  const irradiance = clearSky(sun.elevationDeg) * clear;
  const ambient = s.tMean + s.tAmp * Math.sin((2 * Math.PI * (hour - 9)) / 24) - (1 - clear) * 3;
  const wind = Math.max(0, s.wind(hour) * inputs.windScale);
  const rain = Math.max(0, s.rain(hour) * inputs.rainScale);
  const humidity = clamp(s.humidity + (rain > 0.2 ? 35 : 0) - 10 * Math.sin((2 * Math.PI * (hour - 9)) / 24), 10, 98);
  const grid = inputs.gridOutage ? !(hour >= 18 && hour < 22) : s.grid(hour);
  return { hour, sun, clearness: clear, irradiance, ambient, wind, rain, humidity, gridAvailable: grid, load: loadAt(hour, ambient, inputs.demand) };
}

function windKw(v, cfg = DEFAULT_CONFIG) {
  return v < cfg.windCutInMs || v >= cfg.windCutOutMs ? 0 : Math.min(UNIT.windMaxKw, UNIT.windCoef * v ** 3);
}

/**
 * Simulate one operating day.
 * @returns {{ scenario, inputs, frames: Frame[], events: Event[], totals }}
 */
export function simulateDay(scenarioId = "clear", overrides = {}, { manual = {}, manualFrom = 0, config = DEFAULT_CONFIG } = {}) {
  const scenario = SCENARIOS[scenarioId] || SCENARIOS.clear;
  const inputs = { ...defaultInputs(scenario.id), ...overrides };
  let state = { ...createControllerState(), uptimeSeconds: 10, lastTransitionAt: 0 };
  let soc = clamp(inputs.startSoc, 0, 100);
  let tank = clamp(inputs.startTank, 0, 100);
  let soiling = clamp(inputs.startSoiling, 0.005, 0.35);
  let batteryTemp = scenario.tMean - 2;
  const frames = [];

  for (let i = 0; i <= STEPS; i++) {
    const hour = (i * STEP_MIN) / 60;
    const env = environmentAt(scenario, inputs, Math.min(hour, 23.999));
    const panelTempC = env.ambient + env.irradiance * 0.024;
    const eff = pvEfficiency(soiling, panelTempC);
    const sensors = {
      timestamp: i * DT * 1000,
      solarIrradianceWm2: r(env.irradiance, 0),
      panelTempC: r(panelTempC, 1),
      pvPowerKw: r((env.irradiance / 1000) * UNIT.pvRatedKw * eff, 3),
      windSpeedMs: r(env.wind, 1),
      windPowerKw: r(windKw(env.wind, config), 3),
      rainfallMmHr: r(env.rain, 1),
      ambientTempC: r(env.ambient, 1),
      humidityPct: r(env.humidity, 0),
      loadPowerKw: r(env.load, 3),
      batterySoc: r(soc, 2),
      batteryTempC: r(batteryTemp, 1),
      tankLevelPct: r(tank, 1),
      waterTurbidityNtu: env.rain > 3 ? 2.8 : 1.4,
      soilingIndex: r(soiling, 3),
      gridAvailable: env.gridAvailable,
      inverterFault: false, bmsFault: false, leakDetected: false, emergencyStop: false,
    };
    const result = evaluateController({ sensors, previousState: state, manual: i >= manualFrom ? manual : {}, config, dtSeconds: DT });
    const cleanPotentialKw = (env.irradiance / 1000) * UNIT.pvRatedKw * (pvEfficiency(0, panelTempC) - eff);
    frames.push({
      i, hour, clock: clock(hour), env, sensors, result,
      mode: result.mode,
      soc: sensors.batterySoc, tank: sensors.tankLevelPct, soiling: sensors.soilingIndex,
      pvEfficiency: eff, soilingLossKw: r(Math.max(0, cleanPotentialKw), 3),
      cleaningRan: result.outputs.cleaningPump,
    });

    if (i === STEPS) break;
    // integrate state to the next step
    soc = projectBatterySoc(soc, result.power, DT, config);
    const capturedL = (result.water.captureRateLpm * DT) / 60;
    const cleanL = result.outputs.cleaningPump ? CLEAN_CYCLE.litres : 0;
    tank = clamp(tank + ((capturedL - cleanL) / UNIT.tankL) * 100, 0, 100);
    let ds = inputs.dustPerHour * (scenario.dustShape ? scenario.dustShape(hour) : 1) * (STEP_MIN / 60) * (env.wind > 6 ? 1.4 : 1);
    if (env.rain > 1) ds -= 0.042 * (STEP_MIN / 60) * Math.min(1, env.rain / 4); // rain washes some dust off
    if (result.outputs.cleaningPump) ds -= CLEAN_CYCLE.soilingDrop;
    soiling = clamp(soiling + ds, 0.005, 0.35);
    const batteryNet = result.power.batteryChargeKw + result.power.batteryDischargeKw;
    batteryTemp = clamp(batteryTemp + (env.ambient - 4 - batteryTemp) * 0.08 + batteryNet * 0.06, 10, 56);
    state = result.nextState;
  }

  const events = deriveEvents(frames, config);
  return { scenario, inputs, frames, events, totals: dayTotals(frames) };
}

export function clock(hour) {
  const h = Math.floor(hour) % 24;
  const m = Math.round((hour - Math.floor(hour)) * 60);
  return `${String(h + (m === 60 ? 1 : 0)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function dayTotals(frames) {
  const h = STEP_MIN / 60;
  const sum = (fn) => frames.slice(0, -1).reduce((a, f) => a + fn(f), 0);
  const last = frames[frames.length - 1];
  return {
    pvKwh: sum((f) => f.result.power.pvKw * h),
    windKwh: sum((f) => f.result.power.windKw * h),
    loadKwh: sum((f) => f.result.power.demandKw * h),
    servedKwh: sum((f) => f.result.power.servedLoadKw * h),
    importKwh: sum((f) => f.result.power.gridImportKw * h),
    exportKwh: sum((f) => f.result.power.gridExportKw * h),
    shedKwh: sum((f) => f.result.power.loadShedKw * h),
    soilingLossKwh: sum((f) => f.soilingLossKw * h),
    capturedL: sum((f) => f.result.water.captureRateLpm * STEP_MIN),
    cleaningCycles: frames.filter((f) => f.cleaningRan).length,
    cleaningL: frames.filter((f) => f.cleaningRan).length * CLEAN_CYCLE.litres,
    minSoc: Math.min(...frames.map((f) => f.soc)),
    endSoc: last.soc, endTank: last.tank,
    modes: [...new Set(frames.map((f) => f.mode))],
  };
}

// ---------------------------------------------------------------- events
const MODE_TEXT = {
  STARTUP: "Startup validation", NORMAL: "Automatic optimisation", CONSERVE: "Reserve protection",
  STORM: "Storm capture", CLEANING: "Panel cleaning", MANUAL: "Manual supervision", FAULT: "Safety isolation",
};
export const modeLabel = (m) => MODE_TEXT[m] || m;

function deriveEvents(frames, cfg) {
  const ev = [];
  const push = (f, level, kind, title, detail) => ev.push({ i: f.i, hour: f.hour, clock: f.clock, level, kind, title, detail });
  let wasDeferred = false;
  frames.forEach((f, idx) => {
    const p = frames[idx - 1];
    const R = f.result;
    if (!p) { push(f, "info", "mode", `Day starts in ${modeLabel(f.mode)}`, R.nextState.lastDecision); return; }
    if (p.mode !== f.mode) push(f, f.mode === MODES.STORM ? "warning" : "info", "mode", `${modeLabel(p.mode)} → ${modeLabel(f.mode)}`, R.nextState.lastDecision);
    const pa = new Set(p.result.alarms.map((a) => a.id));
    R.alarms.filter((a) => !pa.has(a.id)).forEach((a) => push(f, a.severity, "alarm", a.title, a.detail));
    if (p.env.irradiance < 5 && f.env.irradiance >= 5) push(f, "info", "sun", "Sunrise: canopy starts producing", `${f.sensors.solarIrradianceWm2} W/m² on the canopy`);
    if (p.env.irradiance >= 5 && f.env.irradiance < 5) push(f, "info", "sun", "Sunset: PV output ends", "Loads move to battery and wind");
    if (!p.result.outputs.windBrake && f.result.outputs.windBrake && f.sensors.windSpeedMs >= cfg.windCutOutMs) push(f, "warning", "wind", "Turbine braked above cut-out", `${f.sensors.windSpeedMs} m/s ≥ ${cfg.windCutOutMs} m/s`);
    if (p.result.outputs.windBrake && !f.result.outputs.windBrake && p.sensors.windSpeedMs >= cfg.windCutInMs) push(f, "info", "wind", "Turbine released", `${f.sensors.windSpeedMs} m/s inside the operating window`);
    if (!p.result.water.firstFlushActive && f.result.water.firstFlushActive) push(f, "info", "water", "Rain detected: first flush diverting", `First ${cfg.firstFlushMm} mm of runoff goes to drain`);
    if (!p.result.water.storageActive && f.result.water.storageActive) push(f, "info", "water", "Storage valve opened", `${f.result.water.captureRateLpm} L/min to filtration and tank`);
    const wants = f.sensors.soilingIndex >= cfg.cleaningAutoThreshold;
    const deferred = wants && !f.result.cleaning.eligible;
    if (deferred && !wasDeferred) push(f, "warning", "clean", "Cleaning proposed, blocked", f.result.cleaning.blockers.join(" · "));
    wasDeferred = deferred;
    if (f.cleaningRan) push(f, "action", "clean", "Cleaning cycle permitted (simulated)", `${CLEAN_CYCLE.litres} L rinse · soiling ${pct(f.sensors.soilingIndex)} → ${pct(Math.max(0.005, f.sensors.soilingIndex - CLEAN_CYCLE.soilingDrop))}`);
    if (p.sensors.gridAvailable && !f.sensors.gridAvailable) push(f, "warning", "grid", "Grid lost: islanded operation", `Battery reserve raised to ${cfg.batteryStormReserveSoc}%`);
    if (!p.sensors.gridAvailable && f.sensors.gridAvailable) push(f, "info", "grid", "Grid restored", "Normal reserve floor resumes");
    if (p.result.power.loadShedKw < 0.01 && f.result.power.loadShedKw >= 0.01) push(f, "critical", "shed", "Non-critical loads shed (simulated)", `${f.result.power.loadShedKw} kW unserved to protect reserve`);
  });
  return ev;
}
const pct = (x) => `${(x * 100).toFixed(1)}%`;

// ---------------------------------------------------------------- explanation
/**
 * Decision trace for one frame: the signals the controller read, the rule each was checked
 * against, and what each candidate action did. Thresholds come from the engine config, so the
 * text always matches the code that made the decision.
 */
export function explainFrame(f, cfg = DEFAULT_CONFIG) {
  const s = f.sensors, R = f.result, P = R.power, W = R.water, O = R.outputs;
  const reserve = P.reserveSoc;
  const storm = s.windSpeedMs >= cfg.windStormMs || s.rainfallMmHr >= cfg.rainStormMmHr;
  const checks = [
    { id: "faults", signal: "Interlocks", value: R.alarms.some((a) => a.severity === "critical" && a.id !== "BATTERY_SOC_CRITICAL") ? "Fault" : "Clear", rule: "E-stop, BMS, inverter, leak all clear", pass: R.mode !== MODES.FAULT },
    { id: "storm", signal: "Wind / rain", value: `${s.windSpeedMs} m/s · ${s.rainfallMmHr} mm/h`, rule: `Storm if wind ≥ ${cfg.windStormMs} m/s or rain ≥ ${cfg.rainStormMmHr} mm/h`, pass: !storm, flag: storm ? "Storm mode" : null },
    { id: "grid", signal: "Grid", value: s.gridAvailable ? "Available" : "Lost", rule: "Grid present for import/export", pass: s.gridAvailable },
    { id: "soc", signal: "Battery", value: `${s.batterySoc.toFixed(1)}%`, rule: `Discharge only above ${reserve}% reserve`, pass: s.batterySoc > reserve },
    { id: "balance", signal: "Renewables − demand", value: `${(P.renewableKw - P.demandKw).toFixed(2)} kW`, rule: "Surplus charges, deficit draws", pass: P.renewableKw >= P.demandKw },
    { id: "soiling", signal: "Soiling", value: pct(s.soilingIndex), rule: `Clean at ≥ ${Math.round(cfg.cleaningAutoThreshold * 100)}%`, pass: s.soilingIndex < cfg.cleaningAutoThreshold },
    { id: "water", signal: "Tank", value: `${s.tankLevelPct.toFixed(0)}%`, rule: `Keep ≥ ${cfg.tankCleaningReservePct}% for cleaning, < ${cfg.tankHighPct}% to store`, pass: s.tankLevelPct >= cfg.tankCleaningReservePct },
  ];
  const act = (id, name, state, reason, domain) => ({ id, name, state, reason, domain });
  const actions = [
    P.batteryChargeKw > 0 ? act("charge", "Charge battery", "active", `${P.batteryChargeKw} kW of surplus`, "power")
      : P.renewableKw > P.demandKw ? act("charge", "Charge battery", "blocked", s.batterySoc >= cfg.batteryMaxSoc ? `Battery at ${cfg.batteryMaxSoc}% ceiling` : "Charging limited", "power")
      : act("charge", "Charge battery", "idle", "No renewable surplus", "power"),
    P.batteryDischargeKw > 0 ? act("discharge", "Discharge battery", "active", `${P.batteryDischargeKw} kW to loads`, "power")
      : P.renewableKw < P.demandKw ? act("discharge", "Discharge battery", "blocked", `State of charge at or below ${reserve}% reserve`, "power")
      : act("discharge", "Discharge battery", "idle", "Renewables cover the load", "power"),
    P.gridImportKw > 0 ? act("import", "Import from grid", "active", `${P.gridImportKw} kW supplement`, "power")
      : act("import", "Import from grid", !s.gridAvailable ? "blocked" : "idle", !s.gridAvailable ? "Grid unavailable" : "Not needed", "power"),
    P.gridExportKw > 0 ? act("export", "Export surplus", "active", `${P.gridExportKw} kW after battery`, "power")
      : P.curtailedKw > 0 ? act("export", "Export surplus", "blocked", `Grid lost: ${P.curtailedKw} kW curtailed`, "power")
      : act("export", "Export surplus", "idle", "No surplus after charging", "power"),
    P.loadShedKw > 0 ? act("shed", "Shed non-critical loads", "active", `${P.loadShedKw} kW unserved (simulated)`, "power") : act("shed", "Shed non-critical loads", "idle", "All loads served", "power"),
    O.windBrake ? act("brake", "Turbine brake", "active", s.windSpeedMs < cfg.windCutInMs ? `Below ${cfg.windCutInMs} m/s cut-in` : `At or above ${cfg.windCutOutMs} m/s cut-out`, "power")
      : act("brake", "Turbine brake", "idle", "Turbine generating", "power"),
    W.firstFlushActive ? act("flush", "Divert first flush", "active", `${W.rainEventMm.toFixed(2)} of ${cfg.firstFlushMm} mm diverted`, "water") : act("flush", "Divert first flush", "idle", s.rainfallMmHr > 0 ? "First flush complete" : "No rain", "water"),
    W.storageActive ? act("store", "Store rainwater", "active", `${W.captureRateLpm} L/min through filters`, "water")
      : s.rainfallMmHr >= cfg.rainCaptureStartMmHr ? act("store", "Store rainwater", "blocked", W.firstFlushActive ? "Waiting for first flush" : W.overflowActive ? "Tank full or quality unsafe" : "Held", "water")
      : act("store", "Store rainwater", "idle", "No rain", "water"),
    O.cleaningPump ? act("clean", "Rinse panels", "active", `Permitted · ${CLEAN_CYCLE.litres} L cycle (simulated)`, "water")
      : s.soilingIndex >= cfg.cleaningAutoThreshold ? act("clean", "Rinse panels", "blocked", R.cleaning.blockers.join(" · ") || "Mode precedence", "water")
      : act("clean", "Rinse panels", "idle", `Soiling below ${Math.round(cfg.cleaningAutoThreshold * 100)}% trigger`, "water"),
  ];
  return { checks, actions, decision: R.nextState.lastDecision, mode: R.mode };
}

/** Plain-language summary of the whole frame, for screen readers and the lab narrative. */
export function narrate(f) {
  const s = f.sensors, P = f.result.power;
  const parts = [`At ${f.clock} the controller is in ${modeLabel(f.mode).toLowerCase()}.`];
  parts.push(`The canopy makes ${P.pvKw.toFixed(2)} kW from ${s.solarIrradianceWm2} W/m² of sun${P.windKw > 0 ? ` and the turbine adds ${P.windKw.toFixed(2)} kW at ${s.windSpeedMs} m/s` : ""}.`);
  parts.push(`The home needs ${P.demandKw.toFixed(2)} kW. ${f.result.nextState.lastDecision}.`);
  if (f.soilingLossKw > 0.02) parts.push(`Dust is costing ${(f.soilingLossKw * 1000).toFixed(0)} W right now.`);
  if (s.rainfallMmHr > 0.1) parts.push(`It is raining ${s.rainfallMmHr} mm/h.`);
  return parts.join(" ");
}

export { MODES, DEFAULT_CONFIG };
