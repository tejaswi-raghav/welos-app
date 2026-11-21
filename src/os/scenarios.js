// Hero conditions: hand-set sensor snapshots for the reference villa (with the
// optional 1 kW wind module fitted). Everything shown about routing, mode and
// alarms is computed by the real control engine from these inputs.
import { createControllerState, evaluateController, MODES } from "../control/engine.js";
import { createInitialSensors } from "../control/simulator.js";
import { referenceBuild, plantFromBuild, configForPlant, pvKw, windKw } from "./reference.js";

export const CONDITIONS = [
  { id: "noon", label: "Midday sun", clock: "12:30",
    env: { solarIrradianceWm2: 930, ambientTempC: 36, windSpeedMs: 3.4, loadPowerKw: 2.6, batterySoc: 58, soilingIndex: 0.04, tankLevelPct: 60 } },
  { id: "evening", label: "Evening", clock: "20:00",
    env: { solarIrradianceWm2: 0, ambientTempC: 31, windSpeedMs: 5.8, loadPowerKw: 3.4, batterySoc: 82, soilingIndex: 0.06, tankLevelPct: 60 } },
  { id: "dust", label: "Dusty panels", clock: "16:40",
    env: { solarIrradianceWm2: 230, ambientTempC: 38, windSpeedMs: 3.0, loadPowerKw: 2.9, batterySoc: 71, soilingIndex: 0.21, tankLevelPct: 64 } },
  { id: "storm", label: "Storm", clock: "15:10",
    env: { solarIrradianceWm2: 90, ambientTempC: 25, windSpeedMs: 15.6, rainfallMmHr: 9, humidityPct: 91, loadPowerKw: 1.6, batterySoc: 55, soilingIndex: 0.12, tankLevelPct: 48, waterTurbidityNtu: 2.8 },
    previous: { rainEventMm: 2.4 } },
  { id: "outage", label: "Grid outage", clock: "21:30",
    env: { solarIrradianceWm2: 0, ambientTempC: 30, windSpeedMs: 2.8, loadPowerKw: 2.6, batterySoc: 48, soilingIndex: 0.07, tankLevelPct: 58, gridAvailable: false } },
];

export const MODE_LABEL = {
  [MODES.STARTUP]: "Starting up",
  [MODES.NORMAL]: "Normal",
  [MODES.CONSERVE]: "Protecting reserve",
  [MODES.STORM]: "Storm",
  [MODES.CLEANING]: "Cleaning panels",
  [MODES.MANUAL]: "Manual",
  [MODES.FAULT]: "Safety isolation",
};

let cache;
export function referencePlant() {
  if (!cache) {
    const build = referenceBuild({ withWind: true });
    const plant = plantFromBuild(build);
    cache = { build, plant, config: configForPlant(plant) };
  }
  return cache;
}

/** Evaluate one condition through the control engine. */
export function runCondition(id) {
  const cond = CONDITIONS.find((c) => c.id === id) || CONDITIONS[0];
  const { plant, config, build } = referencePlant();
  const e = cond.env;
  const panelTempC = e.ambientTempC + e.solarIrradianceWm2 * 0.024;
  const sensors = {
    ...createInitialSensors(),
    rainfallMmHr: 0, humidityPct: 48, waterTurbidityNtu: 1.4, gridAvailable: true,
    ...e,
    panelTempC,
    pvPowerKw: pvKw(plant, e.solarIrradianceWm2, panelTempC, e.soilingIndex),
    windPowerKw: windKw(plant, e.windSpeedMs, config),
    batteryTempC: 31,
  };
  const previousState = { ...createControllerState(), uptimeSeconds: 600, ...(cond.previous || {}) };
  const result = evaluateController({ sensors, previousState, config, dtSeconds: 60 });
  return { cond, sensors, result, plant, build, config };
}
