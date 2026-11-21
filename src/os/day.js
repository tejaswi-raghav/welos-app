// One day on a roof: drives the real control engine through 24 hours.
// The hourly SHAPES are illustrative (half-sine sun scaled to the climate's
// daily kWh/m²; an AC-led villa load curve scaled to the daily load). Every
// routing decision and the battery state come from src/control/engine.js.
import { createControllerState, evaluateController, projectBatterySoc } from "../control/engine.js";
import { createInitialSensors } from "../control/simulator.js";
import { plantFromBuild, configForPlant, pvKw, windKw } from "./reference.js";

const SUNRISE = 6.0, DAYLEN = 12.6;
// Relative load by hour for a UAE villa: cooling-led afternoon and evening peak.
const LOAD_SHAPE = [0.78, 0.72, 0.68, 0.66, 0.66, 0.7, 0.78, 0.86, 0.9, 0.95, 1.02, 1.1, 1.18, 1.26, 1.33, 1.38, 1.42, 1.46, 1.5, 1.48, 1.38, 1.22, 1.04, 0.88];
const LOAD_NORM = LOAD_SHAPE.reduce((a, b) => a + b, 0);

const lerpShape = (h) => {
  const i = Math.floor(h) % 24, f = h - Math.floor(h);
  return LOAD_SHAPE[i] * (1 - f) + LOAD_SHAPE[(i + 1) % 24] * f;
};

/** Irradiance (W/m²) at hour h, so the day integrates to solarDailyKwhM2. */
export function irradianceAt(h, solarDailyKwhM2) {
  const x = (h - SUNRISE) / DAYLEN;
  if (x <= 0 || x >= 1) return 0;
  const peak = (solarDailyKwhM2 * 1000 * Math.PI) / (2 * DAYLEN);
  return peak * Math.sin(Math.PI * x);
}

/** 10 m wind scaled to roof height, with an afternoon sea-breeze swing of ±25%. */
export function windAt(h, hubMs) {
  return Math.max(0, hubMs * (1 + 0.25 * Math.sin((2 * Math.PI * (h - 9)) / 24)));
}

export function loadAt(h, loadKwhDay) {
  return (loadKwhDay / LOAD_NORM) * lerpShape(h);
}

/**
 * @param build sizeSystem() result
 * @param stepMin simulation step in minutes
 * @returns {{ steps: object[], totals: object, insight: string[], plant: object }}
 */
export function simulateDay(build, { stepMin = 10, startSoc = 60 } = {}) {
  const plant = plantFromBuild(build);
  const config = configForPlant(plant);
  const by = Object.fromEntries(build.components.map((c) => [c.id, c]));
  const hubMs = by.wind.metrics.hubWindMs;
  const c = build.climate;
  const dt = stepMin * 60;
  const perDay = Math.round((24 * 60) / stepMin);
  let sensors = { ...createInitialSensors(), batterySoc: startSoc, soilingIndex: 0.05, tankLevelPct: 60, batteryTempC: 30, rainfallMmHr: 0 };
  let state = { ...createControllerState(), uptimeSeconds: 600 };
  const steps = [];

  // run two days; keep the second so the battery starts the day in steady state
  for (let i = 0; i < perDay * 2; i++) {
    const h = ((i % perDay) * stepMin) / 60;
    const irr = irradianceAt(h, c.solar);
    const ambient = c.temp + 5 * Math.sin((2 * Math.PI * (h - 9)) / 24);
    const panelTempC = ambient + irr * 0.024;
    const wind = windAt(h, hubMs);
    sensors = {
      ...sensors,
      solarIrradianceWm2: irr, ambientTempC: ambient, panelTempC,
      pvPowerKw: pvKw(plant, irr, panelTempC, sensors.soilingIndex),
      windSpeedMs: wind, windPowerKw: windKw(plant, wind, config),
      loadPowerKw: loadAt(h, plant.loadKwhDay),
      humidityPct: c.humidity,
    };
    const r = evaluateController({ sensors, previousState: state, config, dtSeconds: dt });
    state = r.nextState;
    if (i >= perDay) {
      const p = r.power;
      const used = Math.min(p.renewableKw, p.servedLoadKw);
      steps.push({
        h, mode: r.mode, soc: sensors.batterySoc,
        pv: p.pvKw, wind: p.windKw, load: p.demandKw,
        direct: used, // renewables straight to the home
        fromBattery: p.batteryDischargeKw, fromGrid: p.gridImportKw,
        toBattery: p.batteryChargeKw, toGrid: p.gridExportKw, curtailed: p.curtailedKw,
        decision: state.lastDecision,
      });
    }
    sensors = { ...sensors, batterySoc: projectBatterySoc(sensors.batterySoc, r.power, dt, config) };
  }

  const kwh = (k) => steps.reduce((s, x) => s + x[k], 0) * (stepMin / 60);
  const totals = {
    solarKwh: kwh("pv"), windKwh: kwh("wind"), loadKwh: kwh("load"),
    directKwh: kwh("direct"), batteryKwh: kwh("fromBattery"), gridKwh: kwh("fromGrid"),
    chargedKwh: kwh("toBattery"), exportKwh: kwh("toGrid"),
  };
  totals.selfSufficiencyPct = totals.loadKwh > 0 ? (1 - totals.gridKwh / totals.loadKwh) * 100 : 0;
  return { steps, totals, insight: describeDay(steps, totals, plant, config), plant, config, stepMin };
}

export const clock = (h) => {
  const m = Math.round(h * 60) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const r1 = (x) => (Math.round(x * 10) / 10).toLocaleString("en-US");

/** Plain-English reading of the day, derived only from the simulated steps. */
export function describeDay(steps, totals, plant, config) {
  const out = [];
  const covered = steps.filter((s) => s.pv + s.wind >= s.load - 1e-6);
  if (covered.length) {
    out.push(`Solar${plant.windKw ? " and wind" : ""} carried the whole home from ${clock(covered[0].h)} to ${clock(covered[covered.length - 1].h)}.`);
  } else {
    out.push(`Solar never fully covered the home on its own; it supplied ${r1(totals.directKwh)} kWh directly.`);
  }
  const full = steps.find((s) => s.soc >= config.batteryMaxSoc - 0.5);
  const peakSoc = Math.max(...steps.map((s) => s.soc));
  if (full) out.push(`The battery was full by ${clock(full.h)}${totals.exportKwh > 0.05 ? `, so ${r1(totals.exportKwh)} kWh of surplus went to the grid` : ""}.`);
  else out.push(`Surplus filled the battery to ${Math.round(peakSoc)}%; nothing was left to export.`);
  const firstGrid = steps.findIndex((s, i) => s.fromGrid > 0.01 && steps[i - 1]?.fromBattery > 0.01);
  if (totals.batteryKwh > 0.1) {
    out.push(firstGrid > 0
      ? `After sunset the battery supplied ${r1(totals.batteryKwh)} kWh until it reached its ${config.batteryMinSoc}% reserve at ${clock(steps[firstGrid].h)}; the grid covered the rest.`
      : `After sunset the battery supplied ${r1(totals.batteryKwh)} kWh${totals.gridKwh < 0.1 ? " and the home never needed the grid" : ""}.`);
  }
  out.push(`Over the day the grid supplied ${r1(totals.gridKwh)} of ${r1(totals.loadKwh)} kWh: ${Math.round(totals.selfSufficiencyPct)}% self-sufficient.`);
  return out;
}
