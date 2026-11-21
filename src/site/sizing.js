// WELOS site sizing engine.
//
// Deterministic: the same climate + tier + inputs always produce the same build
// and the same price. Every component carries a plain-language `why` and the
// threshold `rules` that selected it, so the numbers can be defended line by line.
// The AI advisor explains this result; it never changes it.
//
// All prices are indicative UAE market estimates in AED (2026) for concept
// planning only. Edit RATES to update them. They are not a quotation.

export const CURRENCY = "AED";

export const TIERS = Object.freeze({
  S: {
    id: "S", name: "Villa", audience: "Villas and townhouses",
    roofM2: 60, loadKwhDay: 45, waterLDay: 400, coolingTons: 8,
    hubHeightM: 12, turbineKw: 1, turbines: 1, batteryModuleKwh: 5, batteryShare: 0.4, treatmentLpm: 10,
  },
  M: {
    id: "M", name: "Residential", audience: "Apartment buildings and villa clusters",
    roofM2: 450, loadKwhDay: 350, waterLDay: 4000, coolingTons: 60,
    hubHeightM: 30, turbineKw: 3, turbines: 3, batteryModuleKwh: 15, batteryShare: 0.3, treatmentLpm: 40,
  },
  L: {
    id: "L", name: "Commercial", audience: "Offices, malls and campuses",
    roofM2: 2500, loadKwhDay: 2400, waterLDay: 25000, coolingTons: 400,
    hubHeightM: 45, turbineKw: 5, turbines: 8, batteryModuleKwh: 50, batteryShare: 0.2, treatmentLpm: 150,
  },
});

export const PACKAGES = Object.freeze({
  essential: {
    id: "essential", name: "Essential", blurb: "Lowest upfront cost. Covers the essentials, upgrade later.",
    coverage: 0.6, batteryShareFactor: 0.25, modules: "standard", cleaning: "alerts", waterLite: true, optionalDefault: "off",
  },
  recommended: {
    id: "recommended", name: "Recommended", blurb: "Sized to your load and climate. Best value over its life.",
    coverage: 1, batteryShareFactor: 1, modules: "climate", cleaning: "auto", waterLite: false, optionalDefault: "recommended",
  },
  max: {
    id: "max", name: "Max", blurb: "Fills the roof, deeper storage, every viable module.",
    coverage: Infinity, batteryShareFactor: 1.5, modules: "premium", cleaning: "auto", waterLite: false, optionalDefault: "viable",
  },
});

export const RATES = Object.freeze({
  moduleStandardPerW: 0.8,      // mono PERC module, AED/W
  modulePremiumPerW: 1.05,      // N-type bifacial glass-glass, AED/W
  canopyPerW: 0.45,             // canopy, racking and integrated rain gutter, AED/W
  reinforcedCanopyFactor: 1.15, // high-wind structure uplift
  inverterPerKw: 480,
  batteryPerKwh: 1050,          // LiFePO4 with BMS
  batteryCoolingFactor: 0.08,   // active-cooled enclosure as share of battery cost
  batteryCoolingMin: 2000,
  turbinePerKw: 9500,           // VAWT incl. mast, brake, rectifier and dump load
  stormRatedFactor: 1.1,
  tankPerL: 0.9,
  treatment: { S: 3800, M: 12000, L: 38000 },  // first flush, filters, UV, pump
  treatmentLite: { S: 1500, M: 5000, L: 16000 }, // first flush, sediment filter, pump
  condensate: { S: 1800, M: 6500, L: 22000 },
  robotPerKwp: 260, robotMin: 4500,             // waterless dry-brush robot
  rinsePerKwp: 90, rinseMin: 1500,              // rain-fed rinse rail
  controller: { S: 4500, M: 14000, L: 38000 },  // WELOS edge OS, sensors, metering
  installRate: { S: 0.15, M: 0.13, L: 0.12 },   // engineering, install, commissioning
  tariffPerKwh: 0.38,           // UAE upper-slab electricity incl. fuel surcharge
  waterPerL: 0.0095,            // UAE water + sewerage, AED per litre
  gridKgCo2PerKwh: 0.41,
  financeApr: 0.0499,           // illustrative green-finance rate
  financeYears: 10,
});

const MODULE_W = 550;
const MODULE_M2 = 2.6;
const ROOF_PACKING = 0.85;     // access paths, setbacks and spacing
const BOS_EFFICIENCY = 0.86;   // inverter, wiring, mismatch
const RUNOFF = 0.8;            // canopy runoff coefficient
const FIRST_FLUSH_KEEP = 0.9;  // share kept after first-flush diversion
const TANK_SIZES = [300, 500, 1000, 1500, 2000, 3000, 5000, 7500, 10000, 15000, 20000, 30000, 50000, 75000, 100000, 150000];

const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const pos = (value, fallback = 0) => Math.max(0, num(value, fallback));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const roundTo = (x, step) => Math.round(x / step) * step;
const ceilTo = (x, step) => Math.ceil(x / step) * step;
const tankSize = (litres) => TANK_SIZES.find((size) => size >= litres) ?? ceilTo(litres, 50000);
const fmt = (x, digits = 0) => Number(x).toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });

function rule(test, pass, effect) {
  return { test, pass: Boolean(pass), effect };
}

/** Wind at hub height from 10 m reference wind (urban power law, alpha = 0.25). */
export function hubWind(v10, hubHeightM) {
  return pos(v10) * Math.pow(Math.max(hubHeightM, 10) / 10, 0.25);
}

/** Annual energy of one VAWT, Rayleigh-distributed wind, kWh/yr. */
export function turbineYield(vMean, ratedKw) {
  const sweptM2 = (ratedKw * 1000) / (0.5 * 1.225 * 12 ** 3 * 0.3); // rated at 12 m/s, Cp 0.3
  const meanPowerW = 0.5 * 1.225 * 1.91 * vMean ** 3 * 0.25 * sweptM2; // Rayleigh cube factor 1.91, field Cp 0.25
  const kwh = (meanPowerW * 8760 * 0.92) / 1000; // 92% availability
  return Math.min(kwh, ratedKw * 8760 * 0.35);
}

export function resolveInputs(tierId, inputs = {}) {
  const tier = TIERS[tierId] || TIERS.S;
  return {
    roofM2: pos(inputs.roofM2, tier.roofM2) || tier.roofM2,
    loadKwhDay: pos(inputs.loadKwhDay, tier.loadKwhDay),
    waterLDay: pos(inputs.waterLDay, tier.waterLDay),
  };
}

/**
 * Size a WELOS build.
 * @param {object} climate { solarDailyKwhM2, windMs, rainMmYear, humidityPct, tempC }
 * @param {"S"|"M"|"L"} tierId
 * @param {object} inputs optional { roofM2, loadKwhDay, waterLDay }
 * @param {object} choices optional { [componentId]: boolean } user include/exclude overrides
 * @param {"essential"|"recommended"|"max"} packageId
 */
export function sizeSystem(climate, tierId = "S", inputs = {}, choices = {}, packageId = "recommended") {
  const tier = TIERS[tierId] || TIERS.S;
  const pkg = PACKAGES[packageId] || PACKAGES.recommended;
  const t = tier.id;
  const site = resolveInputs(t, inputs);
  const c = {
    solar: pos(climate?.solarDailyKwhM2, 4.5),
    wind: pos(climate?.windMs, 4),
    rain: pos(climate?.rainMmYear, 250),
    humidity: clamp(num(climate?.humidityPct, 50), 0, 100),
    temp: num(climate?.tempC, 25),
  };
  const components = [];

  // ---------- Solar canopy ----------
  const hot = c.temp >= 25 || c.solar >= 5.5;
  const dusty = c.rain < 300;
  const windy = c.wind >= 6;
  const tempCoef = hot ? 0.0029 : 0.0035;
  const cellTemp = c.temp + 22;
  const thermalDerate = 1 - tempCoef * Math.max(0, cellTemp - 25);
  const soilingRaw = dusty ? 0.08 : 0.03;
  const autoClean = pkg.cleaning === "auto";
  const soilingManaged = autoClean ? (dusty ? 0.025 : 0.01) : (dusty ? 0.045 : 0.018);
  const pr = BOS_EFFICIENCY * thermalDerate * (1 - soilingManaged);
  const maxModules = Math.max(1, Math.floor((site.roofM2 * ROOF_PACKING) / MODULE_M2));
  const neededKwp = site.loadKwhDay / Math.max(0.1, c.solar * pr);
  const fullModules = Math.max(1, Math.ceil((neededKwp * 1000) / MODULE_W));
  const loadModules = pkg.coverage === Infinity ? maxModules : Math.max(1, Math.ceil(fullModules * pkg.coverage));
  const modules = Math.min(maxModules, loadModules);
  const roofLimited = loadModules > maxModules;
  const premium = pkg.modules === "premium" || (pkg.modules === "climate" && hot);
  const pvKwp = (modules * MODULE_W) / 1000;
  const pvKwhYear = pvKwp * c.solar * pr * 365;
  const moduleRate = premium ? RATES.modulePremiumPerW : RATES.moduleStandardPerW;
  const canopyRate = RATES.canopyPerW * (windy ? RATES.reinforcedCanopyFactor : 1);
  components.push({
    id: "solar", group: "energy", name: "Solar canopy + rain catchment", core: true, recommended: true,
    capacity: { value: pvKwp, unit: "kWp", text: `${fmt(pvKwp, 1)} kWp · ${modules} × ${MODULE_W} W` },
    spec: `${premium ? "Heat-tolerant N-type bifacial glass-glass" : "Mono PERC"} modules${windy ? " on a reinforced canopy" : ""}`,
    output: `${fmt(pvKwhYear)} kWh/yr`,
    why: pkg.id === "essential"
      ? `Essential sizes the array to about ${Math.round(pkg.coverage * 100)}% of your ${fmt(site.loadKwhDay)} kWh/day (${modules} of the ${fullModules} modules a full system needs) with standard modules, to keep the upfront cost low. The canopy is designed to take the rest later.${hot ? " Heat-tolerant modules would yield a few percent more here." : ""}`
      : pkg.id === "max"
      ? `Max fills the usable roof with ${modules} heat-tolerant modules, so surplus can be exported or stored.`
      : roofLimited
      ? `Your roof fits ${maxModules} modules, fewer than the ${loadModules} needed to cover ${fmt(site.loadKwhDay)} kWh/day, so the array fills the roof. ${c.solar >= 5 ? "Strong sun makes every square metre count." : ""}`.trim()
      : `${modules} modules cover your ${fmt(site.loadKwhDay)} kWh/day at ${fmt(c.solar, 1)} kWh/m²/day of sun without oversizing the roof.`,
    rules: [
      rule(`Sun ≥ 5.5 kWh/m²/day or temperature ≥ 25 °C (site: ${fmt(c.solar, 1)}, ${fmt(c.temp, 1)} °C)`, hot, premium ? "Premium heat-tolerant modules: −0.29 %/°C instead of −0.35 %/°C" : hot ? `Premium modules advised, but ${pkg.name} uses standard ones` : "Standard modules are enough in this climate"),
      rule(`${pkg.name} package array target`, true, pkg.coverage === Infinity ? "Fill the usable roof" : `${Math.round(pkg.coverage * 100)}% of daily load`),
      rule(`Load-sized array (${loadModules} modules) > roof capacity (${maxModules})`, roofLimited, roofLimited ? "Array is roof-limited" : "Array is sized to the load"),
      rule(`Mean wind ≥ 6 m/s (site: ${fmt(c.wind, 1)} m/s)`, windy, windy ? "Reinforced canopy, +15% structure cost" : "Standard canopy structure"),
    ],
    metrics: { pvKwp, modules, maxModules, performanceRatio: pr, thermalDerate, cellTemp },
    costAed: pvKwp * 1000 * (moduleRate + canopyRate),
  });

  // ---------- Panel cleaning ----------
  const recovered = pvKwp * c.solar * BOS_EFFICIENCY * thermalDerate * (soilingRaw - soilingManaged) * 365;
  components.push({
    id: "cleaning", group: "energy", name: !autoClean ? "Soiling alerts + manual cleaning" : dusty ? "Waterless robotic cleaning" : "Rain-fed rinse rail", core: true, recommended: true,
    capacity: { value: recovered, unit: "kWh/yr", text: `Recovers ~${fmt(recovered)} kWh/yr` },
    spec: !autoClean ? "Soiling reference cell tells you when a manual clean pays off" : dusty ? "Dry microfibre brush robot, triggered by the soiling reference cell" : "Low-flow spray rail fed from the rain tank",
    output: `Soiling loss ${Math.round(soilingRaw * 100)}% → ${(soilingManaged * 100).toFixed(1)}%`,
    why: !autoClean
      ? `Essential skips the cleaning hardware. The controller still measures soiling and alerts you when output has dropped enough that a manual wash is worth it, recovering most of the loss.`
      : dusty
      ? `Low rain (${fmt(c.rain)} mm/yr) means dust builds up and is rarely washed off, and water is too scarce to spend on rinsing. A waterless robot keeps the array clean without using the tank.`
      : `Enough rain (${fmt(c.rain)} mm/yr) to refill the tank, so harvested water can rinse the panels whenever the soiling sensor crosses its threshold.`,
    rules: [
      rule(`Rain < 300 mm/yr (site: ${fmt(c.rain)})`, dusty, dusty ? "Waterless robot, 0 L of water used" : "Rinse rail using harvested rain"),
      rule("Soiling loss ≥ 15% on the reference cell", true, "Controller starts a cleaning cycle (18% forces one)"),
    ],
    metrics: { recoveredKwhYear: recovered, soilingRaw, soilingManaged },
    costAed: !autoClean ? 0 : dusty ? Math.max(RATES.robotMin, pvKwp * RATES.robotPerKwp) : Math.max(RATES.rinseMin, pvKwp * RATES.rinsePerKwp),
  });

  // ---------- Wind ----------
  const vHub = hubWind(c.wind, tier.hubHeightM);
  const windViable = vHub >= 4.5;
  const windMarginal = vHub >= 3.8 && vHub < 4.5;
  const turbines = vHub >= 5.5 ? tier.turbines : Math.max(1, Math.ceil(tier.turbines / 2));
  const stormRated = vHub >= 7;
  const windKwhYear = turbineYield(vHub, tier.turbineKw) * turbines;
  components.push({
    id: "wind", group: "energy", name: "Vertical-axis wind turbine", core: false, recommended: windViable,
    defaultOn: pkg.optionalDefault === "off" ? false : pkg.optionalDefault === "viable" ? windViable || windMarginal : windViable,
    capacity: { value: turbines * tier.turbineKw, unit: "kW", text: `${turbines} × ${tier.turbineKw} kW VAWT` },
    spec: `Helical hybrid rotor at ~${tier.hubHeightM} m${stormRated ? ", storm-rated" : ""}, independent brake`,
    output: `${fmt(windKwhYear)} kWh/yr`,
    why: windViable
      ? `At your ~${tier.hubHeightM} m rooftop height the wind averages ${fmt(vHub, 1)} m/s, above the 4.5 m/s threshold where a VAWT produces useful energy. It costs more per kWh than solar, but it generates at night and in dusty or cloudy weather, which means less battery is needed.`
      : windMarginal
        ? `Wind at ~${tier.hubHeightM} m averages only ${fmt(vHub, 1)} m/s, which is marginal. Add it only after a 3-month on-site anemometer measurement confirms a better local resource.`
        : `Wind at ~${tier.hubHeightM} m averages ${fmt(vHub, 1)} m/s, below the 3.8 m/s minimum. A turbine here would cost more than the energy it makes, so the budget goes to solar and storage instead.`,
    rules: [
      rule(`Hub-height wind ≥ 4.5 m/s (site: ${fmt(c.wind, 1)} m/s at 10 m → ${fmt(vHub, 1)} m/s at ${tier.hubHeightM} m)`, windViable, windViable ? "Recommended" : "Not recommended by default"),
      rule("Hub-height wind ≥ 5.5 m/s", vHub >= 5.5, vHub >= 5.5 ? `Full set of ${tier.turbines} turbines` : `Reduced to ${turbines} turbine${turbines > 1 ? "s" : ""}`),
      rule("Hub-height wind ≥ 7 m/s", stormRated, stormRated ? "Storm-rated rotor, +10% cost" : "Standard rotor"),
    ],
    metrics: { hubWindMs: vHub, turbines, windKwhYear },
    costAed: turbines * tier.turbineKw * RATES.turbinePerKw * (stormRated ? RATES.stormRatedFactor : 1),
  });

  // ---------- Battery ----------
  const pvKwhDay = pvKwhYear / 365;
  const share = tier.batteryShare * pkg.batteryShareFactor;
  const nightKwh = Math.min(site.loadKwhDay * share, pvKwhDay * 0.6);
  const batteryKwh = Math.max(tier.batteryModuleKwh, ceilTo(nightKwh, tier.batteryModuleKwh));
  const coolBattery = c.temp >= 27;
  const batteryBase = batteryKwh * RATES.batteryPerKwh;
  components.push({
    id: "battery", group: "energy", name: "LiFePO4 storage", core: true, recommended: true,
    capacity: { value: batteryKwh, unit: "kWh", text: `${fmt(batteryKwh)} kWh` },
    spec: `48 V LiFePO4 with BMS${coolBattery ? ", active-cooled enclosure" : ""}`,
    output: `Covers ~${fmt(Math.min(100, (batteryKwh / Math.max(1, site.loadKwhDay)) * 100))}% of a day's load after dark`,
    why: `Sized to shift about ${Math.round(share * 100)}% of daily use into the evening${t === "L" ? " and shave daytime peaks" : ""}, limited by what the array can actually refill (${fmt(pvKwhDay)} kWh/day). Rounded up to ${tier.batteryModuleKwh} kWh modules.${coolBattery ? ` At ${fmt(c.temp, 1)} °C average, an active-cooled enclosure protects cycle life, which roughly halves for every 10 °C of sustained heat.` : ""}`,
    rules: [
      rule(`${Math.round(share * 100)}% of load (${fmt(site.loadKwhDay * share)} kWh) vs 60% of solar (${fmt(pvKwhDay * 0.6)} kWh)`, true, `Takes the smaller: ${fmt(nightKwh)} kWh → ${fmt(batteryKwh)} kWh installed`),
      rule(`Average temperature ≥ 27 °C (site: ${fmt(c.temp, 1)} °C)`, coolBattery, coolBattery ? "Active-cooled enclosure added" : "Passive enclosure"),
      rule("Storm or grid outage", true, "Controller holds a 35% reserve (20% in normal operation)"),
    ],
    metrics: { batteryKwh, nightKwh },
    costAed: batteryBase + (coolBattery ? Math.max(RATES.batteryCoolingMin, batteryBase * RATES.batteryCoolingFactor) : 0),
  });

  // ---------- Hybrid inverter ----------
  const peakKw = (site.loadKwhDay / 24) * 2.5;
  const inverterKw = Math.max(3, ceilTo(Math.max(pvKwp * 0.85, peakKw), t === "S" ? 1 : 5));
  components.push({
    id: "inverter", group: "energy", name: "Hybrid inverter", core: true, recommended: true,
    capacity: { value: inverterKw, unit: "kW", text: `${fmt(inverterKw)} kW` },
    spec: "Grid-interactive hybrid inverter with anti-islanding and backup output",
    output: "Solar, wind, battery and grid on one protected 48 V DC bus",
    why: `Must carry the larger of 85% of the array (${fmt(pvKwp * 0.85, 1)} kW) and estimated peak demand (${fmt(peakKw, 1)} kW, 2.5 × average).`,
    rules: [rule(`Array × 0.85 vs peak demand`, pvKwp * 0.85 >= peakKw, pvKwp * 0.85 >= peakKw ? "Sized to the array" : "Sized to peak demand")],
    metrics: { inverterKw, peakKw },
    costAed: inverterKw * RATES.inverterPerKw,
  });

  // ---------- Condensate recovery ----------
  const condensateViable = c.humidity >= 45 && c.temp >= 24;
  const litresPerTonDay = clamp((c.humidity - 30) * 0.25, 0, 15);
  const condensateLDay = condensateViable ? tier.coolingTons * litresPerTonDay : 0;
  const condensateLYear = condensateLDay * 365 * 0.75; // cooling season share
  components.push({
    id: "condensate", group: "water", name: "AC condensate recovery", core: false, recommended: condensateViable,
    defaultOn: pkg.optionalDefault === "off" ? false : condensateViable,
    capacity: { value: condensateLDay, unit: "L/day", text: condensateViable ? `~${fmt(condensateLDay)} L/day` : "Not viable here" },
    spec: "Collects air-conditioning condensate into the WELOS tank",
    output: `${fmt(condensateLYear)} L/yr`,
    why: condensateViable
      ? `Hot (${fmt(c.temp, 1)} °C) and humid (${fmt(c.humidity)}% RH): your air-conditioning pulls about ${fmt(litresPerTonDay, 1)} L/day of clean water out of the air per ton of cooling. That water normally goes down the drain. Here it is a steadier source than rain.`
      : `Needs humidity ≥ 45% and temperature ≥ 24 °C to produce meaningful water. Site: ${fmt(c.humidity)}% RH, ${fmt(c.temp, 1)} °C.`,
    rules: [rule(`Humidity ≥ 45% and temperature ≥ 24 °C (site: ${fmt(c.humidity)}%, ${fmt(c.temp, 1)} °C)`, condensateViable, condensateViable ? "Recommended" : "Not recommended")],
    metrics: { condensateLDay, condensateLYear },
    costAed: RATES.condensate[t],
  });

  // ---------- Rain storage + treatment ----------
  const designEventMm = clamp(c.rain * 0.06, 6, 40);
  const eventCaptureL = site.roofM2 * designEventMm * RUNOFF * FIRST_FLUSH_KEEP;
  const condensateIncluded = choices.condensate ?? (pkg.optionalDefault === "off" ? false : condensateViable);
  const condensateBufferL = condensateIncluded ? condensateLDay * 3 : 0;
  const tankTarget = Math.min(Math.max(eventCaptureL, condensateBufferL), Math.max(site.waterLDay * 7, 300));
  const tankL = tankSize(Math.max(300, tankTarget));
  const rainLYear = c.rain * site.roofM2 * RUNOFF * FIRST_FLUSH_KEEP;
  const lowRain = c.rain < 120;
  const highRain = c.rain >= 800;
  components.push({
    id: "water", group: "water", name: "Rain storage + treatment", core: true, recommended: true,
    capacity: { value: tankL, unit: "L", text: `${fmt(tankL)} L tank · ${tier.treatmentLpm} L/min treatment` },
    spec: pkg.waterLite ? "First flush → sediment filter → pump (irrigation and flushing only)" : "First flush → sediment + carbon filters → UV-C → variable-speed pump (non-potable)",
    output: `${fmt(rainLYear)} L/yr of rain${condensateIncluded ? ` + ${fmt(condensateLYear)} L/yr condensate` : ""}`,
    why: lowRain
      ? `Only ${fmt(c.rain)} mm/yr of rain, arriving in a few short storms. The tank is kept small (${fmt(tankL)} L) to catch one design storm${condensateIncluded ? " and buffer three days of AC condensate" : ""}, instead of paying for a large tank that would sit empty.`
      : highRain
        ? `Heavy rain (${fmt(c.rain)} mm/yr). The tank is sized to capture a ${fmt(designEventMm)} mm storm off your ${fmt(site.roofM2)} m² canopy, capped at 7 days of demand so the water keeps turning over.`
        : `Moderate rain (${fmt(c.rain)} mm/yr). The tank catches a ${fmt(designEventMm)} mm storm off the canopy, capped at 7 days of your ${fmt(site.waterLDay)} L/day demand.`,
    rules: [
      rule(`Rain < 120 mm/yr (site: ${fmt(c.rain)})`, lowRain, lowRain ? "Compact tank, sized to one storm" : "Storm-capture sizing"),
      rule(`Design storm = 6% of annual rain, clamped 6–40 mm (site: ${fmt(designEventMm)} mm)`, true, `Captures ${fmt(eventCaptureL)} L per storm`),
      rule(`Tank ≤ 7 days of demand (${fmt(site.waterLDay * 7)} L)`, tankTarget >= site.waterLDay * 7, tankTarget >= site.waterLDay * 7 ? "Capped by demand" : "Below the demand cap"),
      rule("Condensate recovery included", condensateIncluded, condensateIncluded ? `Tank also buffers 3 days of condensate (${fmt(condensateBufferL)} L)` : "Rain only"),
    ],
    metrics: { tankL, rainLYear, designEventMm, eventCaptureL },
    costAed: (pkg.waterLite ? RATES.treatmentLite[t] : RATES.treatment[t]) + tankL * RATES.tankPerL,
  });

  // ---------- Control core ----------
  components.push({
    id: "controller", group: "control", name: "WELOS OS edge controller", core: true, recommended: true,
    capacity: { value: 1, unit: "unit", text: t === "S" ? "1 controller" : t === "M" ? "1 controller + metering hub" : "Redundant controller pair + BMS gateway" },
    spec: "Offline-first control, safety interlocks, soiling reference cell, energy and water metering",
    output: "Runs every 250 ms. Works with no internet.",
    why: "Coordinates every subsystem: when to charge, export, clean, divert first flush or hold storm reserve. Hard-wired protections stay independent of it.",
    rules: [rule("Always included", true, "The WELOS operating layer is the product")],
    metrics: {},
    costAed: RATES.controller[t],
  });

  // ---------- Apply user choices ----------
  for (const part of components) {
    const choice = choices[part.id];
    const byDefault = part.defaultOn ?? part.recommended;
    part.included = part.core ? true : typeof choice === "boolean" ? choice : byDefault;
    part.overridden = !part.core && typeof choice === "boolean" && choice !== byDefault;
    part.costAed = roundTo(part.costAed, 10);
  }

  const included = (id) => components.find((p) => p.id === id)?.included;
  const hardwareAed = components.filter((p) => p.included).reduce((sum, p) => sum + p.costAed, 0);
  const installAed = roundTo(hardwareAed * RATES.installRate[t], 10);
  const totalAed = hardwareAed + installAed;
  const energyKwhYear = pvKwhYear + (included("wind") ? windKwhYear : 0);
  const waterLYear = rainLYear + (included("condensate") ? condensateLYear : 0);
  const annualSavingsAed = energyKwhYear * RATES.tariffPerKwh + Math.min(waterLYear, site.waterLDay * 365) * RATES.waterPerL;

  const monthlyRate = RATES.financeApr / 12;
  const months = RATES.financeYears * 12;
  const monthlyAed = (totalAed * monthlyRate) / (1 - (1 + monthlyRate) ** -months);

  return {
    tier,
    package: pkg,
    request: { climate, tierId: t, inputs, choices, packageId: pkg.id },
    site,
    climate: c,
    components,
    totals: {
      hardwareAed,
      installAed,
      totalAed,
      energyKwhYear,
      waterLYear,
      annualSavingsAed,
      paybackYears: annualSavingsAed > 0 ? totalAed / annualSavingsAed : null,
      monthlyAed,
      monthlySavingsAed: annualSavingsAed / 12,
      energyCoveragePct: (energyKwhYear / Math.max(1, site.loadKwhDay * 365)) * 100,
      waterCoveragePct: (waterLYear / Math.max(1, site.waterLDay * 365)) * 100,
      co2TonnesYear: (energyKwhYear * RATES.gridKgCo2PerKwh) / 1000,
    },
  };
}

/** Starting price per tier for a reference climate, used on the tier cards. */
export function tierFromPrice(tierId, climate) {
  return sizeSystem(climate, tierId).totals.totalAed;
}

/**
 * Rule-based advisor. Used instantly in the browser, and as the fallback when the
 * AI advisor is unreachable. Same shape as the AI response.
 */
export function ruleAdvice(result, placeName = "your site") {
  const { components, climate: c, totals, tier } = result;
  const by = Object.fromEntries(components.map((p) => [p.id, p]));
  const lead = c.solar >= 5 ? "sun-first" : c.rain >= 800 ? "water-rich" : by.wind.recommended ? "wind-assisted" : "balanced";
  const headline = {
    "sun-first": `${placeName}: a sun-first build with a lean water system`,
    "water-rich": `${placeName}: rain is your second power plant`,
    "wind-assisted": `${placeName}: solar by day, wind after dark`,
    balanced: `${placeName}: a balanced ${tier.name.toLowerCase()} build`,
  }[lead];
  const reasons = [
    { component: "Solar", text: by.solar.why },
    { component: "Water", text: by.water.why },
    { component: "Wind", text: by.wind.why },
    { component: "Cleaning", text: by.cleaning.why },
  ];
  const upgrades = [];
  if (by.condensate.recommended && !by.condensate.included) upgrades.push({ title: "Add AC condensate recovery", text: `Adds about ${fmt(by.condensate.metrics.condensateLYear)} L/yr of water for AED ${fmt(by.condensate.costAed)}.`, impact: "water" });
  if (by.wind.recommended && !by.wind.included) upgrades.push({ title: "Turn the wind turbine back on", text: `Your hub-height wind supports ${fmt(by.wind.metrics.windKwhYear)} kWh/yr of night-time generation.`, impact: "energy" });
  if (by.solar.metrics.modules >= by.solar.metrics.maxModules && totals.energyCoveragePct < 95) upgrades.push({ title: "Extend the canopy over parking or terraces", text: "The array already fills the roof. Each extra 10 m² adds about 2.2 kWp of capacity.", impact: "energy" });
  if (totals.energyCoveragePct < 60) upgrades.push({ title: "Cut the load before adding hardware", text: "Efficient cooling and smart scheduling through WELOS OS are usually cheaper per kWh than more panels.", impact: "cost" });
  if (result.package.id !== "essential") {
    const r = result.request;
    const lean = sizeSystem(r.climate, r.tierId, r.inputs, r.choices, "essential");
    upgrades.unshift({ title: `Start with Essential at ${CURRENCY} ${fmt(lean.totals.totalAed)}`, text: `Same site, ${CURRENCY} ${fmt(totals.totalAed - lean.totals.totalAed)} less upfront: about ${fmt(Math.min(lean.totals.energyCoveragePct, 100))}% of your electricity now, with the canopy and controller ready to expand later.`, impact: "cost" });
  }
  if (upgrades.length < 2) upgrades.push({ title: "Enable demand-aware scheduling", text: "Let WELOS OS run pumps, water heating and EV charging at solar peak to raise self-consumption.", impact: "cost" });
  const questions = [
    "Measure rooftop wind for three months before committing to a turbine.",
    "Confirm roof structural capacity for the canopy and a full tank.",
    "Check local net-metering and connection rules with your utility.",
  ];
  return {
    source: "rules",
    headline,
    summary: `${fmt(by.solar.metrics.pvKwp, 1)} kWp of solar, ${fmt(by.battery.metrics.batteryKwh)} kWh of storage and a ${fmt(by.water.metrics.tankL)} L water system, covering about ${fmt(Math.min(totals.energyCoveragePct, 100))}% of your electricity and ${fmt(Math.min(totals.waterCoveragePct, 100))}% of your non-potable water. Indicative payback is ${totals.paybackYears ? fmt(totals.paybackYears, 1) : "—"} years at UAE tariffs.`,
    reasons,
    upgrades: upgrades.slice(0, 3),
    questions,
  };
}

/** Suggested questions with deterministic answers, used when the AI is unavailable. */
export const PRESET_QUESTIONS = [
  { id: "cheaper", text: "How can I bring the price down?" },
  { id: "water", text: "Why is the water tank this size?" },
  { id: "wind", text: "Should I add the wind turbine?" },
  { id: "payback", text: "How fast does it pay back?" },
];

export function ruleAnswer(result, presetId) {
  const by = Object.fromEntries(result.components.map((p) => [p.id, p]));
  const t = result.totals;
  const r = result.request;
  switch (presetId) {
    case "cheaper": {
      if (result.package.id === "essential") return `You're already on Essential at ${CURRENCY} ${fmt(t.totalAed)}. To go lower, reduce the daily electricity target or roof area. The array and battery scale down with them, and the canopy stays ready to expand.`;
      const lean = sizeSystem(r.climate, r.tierId, r.inputs, r.choices, "essential");
      return `Switch to Essential: ${CURRENCY} ${fmt(lean.totals.totalAed)} instead of ${CURRENCY} ${fmt(t.totalAed)}. It sizes solar to about 60% of your load with standard modules, keeps one battery module, replaces the cleaning robot with soiling alerts and uses a lighter water kit. That covers about ${fmt(Math.min(lean.totals.energyCoveragePct, 100))}% of your electricity, at roughly ${CURRENCY} ${fmt(lean.totals.monthlyAed)}/month financed against ${CURRENCY} ${fmt(lean.totals.monthlySavingsAed)}/month saved.`;
    }
    case "water":
      return by.water.why;
    case "wind":
      return `${by.wind.why} ${by.wind.included ? `It adds ${by.wind.output} for ${CURRENCY} ${fmt(by.wind.costAed)}.` : `If you add it anyway it costs ${CURRENCY} ${fmt(by.wind.costAed)} for about ${by.wind.output}.`}`;
    case "payback":
      return `About ${t.paybackYears ? fmt(t.paybackYears, 1) : "—"} years: ${CURRENCY} ${fmt(t.totalAed)} installed against ${CURRENCY} ${fmt(t.annualSavingsAed)} a year in electricity and water at UAE tariffs. Financed over ${RATES.financeYears} years at ${(RATES.financeApr * 100).toFixed(2)}% that is roughly ${CURRENCY} ${fmt(t.monthlyAed)}/month, against ${CURRENCY} ${fmt(t.monthlySavingsAed)}/month saved.`;
    default:
      return null;
  }
}
