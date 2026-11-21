// One reference build for the marketing site, computed by the sizing engine so
// the hero, the day simulation and the scale table can never disagree.
// WELOS S · Villa · Recommended package · Dubai preset climate.
import { sizeSystem } from "../site/sizing.js";
import { DEFAULT_PRESET } from "../site/presets.js";
import { DEFAULT_CONFIG } from "../control/engine.js";

export const REFERENCE = Object.freeze({ place: DEFAULT_PRESET.name, climate: DEFAULT_PRESET.climate, tier: "S", package: "recommended" });

/** sizeSystem() result for the reference build. `withWind` fits the optional turbine. */
export function referenceBuild({ withWind = false } = {}) {
  return sizeSystem(REFERENCE.climate, REFERENCE.tier, {}, withWind ? { wind: true } : {}, REFERENCE.package);
}

/** Pull the figures the control engine needs out of a sizing result. */
export function plantFromBuild(build) {
  const by = Object.fromEntries(build.components.map((c) => [c.id, c]));
  const batteryKwh = by.battery.metrics.batteryKwh;
  const inverterKw = by.inverter.metrics.inverterKw;
  return {
    pvKwp: by.solar.metrics.pvKwp,
    performanceRatio: by.solar.metrics.performanceRatio,
    windKw: by.wind.included ? by.wind.capacity.value : 0,
    batteryKwh,
    inverterKw,
    tankL: by.water.metrics.tankL,
    loadKwhDay: build.site.loadKwhDay,
  };
}

/** Control-engine configuration scaled to a plant (0.5 C, limited by the inverter). */
export function configForPlant(plant) {
  const limit = Math.max(1, Math.min(plant.inverterKw, plant.batteryKwh * 0.5));
  return { ...DEFAULT_CONFIG, batteryCapacityKwh: plant.batteryKwh, batteryMaxChargeKw: limit, batteryMaxDischargeKw: limit };
}

/** PV output with the same soiling and heat derate as src/control/simulator.js. */
export function pvKw(plant, irradianceWm2, panelTempC, soilingIndex) {
  const eff = Math.max(0.55, 1 - soilingIndex * 1.45 - Math.max(0, panelTempC - 25) * 0.0035);
  return Math.max(0, (irradianceWm2 / 1000) * plant.pvKwp * eff);
}

/** VAWT output: the simulator's cubic curve, capped at the turbine rating. */
export function windKw(plant, speedMs, config = DEFAULT_CONFIG) {
  if (!plant.windKw || speedMs < config.windCutInMs || speedMs >= config.windCutOutMs) return 0;
  return Math.min(plant.windKw, 0.011 * speedMs ** 3);
}
