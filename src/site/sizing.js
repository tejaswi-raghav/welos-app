// WELOS site sizing engine.
//
// Deterministic: the same climate + tier + inputs always produce the same build
// and the same price. Every component carries a plain-language `why` and the
// threshold `rules` that selected it, so the numbers can be defended line by line.
// The AI advisor explains this result; it never changes it.
//
// All prices are indicative UAE market estimates in AED (2026) for concept
// planning only. Edit RATES to update them. They are not a quotation.
//
// Calibration (checked 22 Nov 2026): UAE installer guides put a 10 kW villa system at
// AED 40,000–55,000 installed (5 kW at 20,000–30,000); panels sell at AED 0.85–1.45/W;
// LiFePO4 battery modules retail at about AED 410–530/kWh before installation.
// Electricity savings use the utility's real slab tariff, fuel surcharge, VAT and
// net-metering rules (see economics.js and regions.js), not a flat rate.

import { annualEconomics, LOAD_SHAPE, monthlySun, marginalRate } from "./economics.js";
import { UTILITIES, DAYS } from "./regions.js";

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

// Packages. `water: false` (Solar-first) removes every water part and every water saving;
// the electrical safety chain (inverter, protection, metering, utility connection) and the
// controller stay in every package.
export const PACKAGES = Object.freeze({
  "solar-first": {
    id: "solar-first", name: "Solar-first", water: false,
    blurb: "Solar sized to 100% of your electricity, without the water system. Inverter, grid protection and the WELOS controller stay included.",
    coverage: 1, batteryShareFactor: 1, modules: "climate", cleaning: "auto", waterLite: false, optionalDefault: "recommended",
  },
  essential: {
    id: "essential", name: "Essential", water: true,
    blurb: "Lowest-cost integrated build: solar for about 60% of your electricity with standard modules, plus the lighter water kit.",
    coverage: 0.6, batteryShareFactor: 0.25, modules: "standard", cleaning: "alerts", waterLite: true, optionalDefault: "off",
  },
  complete: {
    id: "complete", name: "Complete", water: true, formerly: "Recommended",
    blurb: "Integrated build: solar sized to 100% of your electricity, automatic cleaning and full water treatment. (This package was called “Recommended” until 22 Nov 2026.)",
    coverage: 1, batteryShareFactor: 1, modules: "climate", cleaning: "auto", waterLite: false, optionalDefault: "recommended",
  },
  max: {
    id: "max", name: "Max", water: true,
    blurb: "Integrated build that fills the usable roof, with deeper storage and every viable module.",
    coverage: Infinity, batteryShareFactor: 1.5, modules: "premium", cleaning: "auto", waterLite: false, optionalDefault: "viable",
  },
});
/** Old package ids that saved builds and links may still carry. */
export const PACKAGE_ALIASES = Object.freeze({ recommended: "complete" });
export const packageKey = (id) => (PACKAGES[id] ? id : PACKAGE_ALIASES[id] || "complete");

export const RATES = Object.freeze({
  moduleStandardPerW: 0.85,     // mono PERC module, AED/W (market 0.85–1.45)
  modulePremiumPerW: 1.1,       // N-type bifacial glass-glass, AED/W
  canopyPerW: 1.48,             // elevated canopy structure and racking, AED/W (was 1.6 incl. gutter; gutter split out below)
  gutterPerW: 0.12,             // integrated perimeter rain gutter + downpipes, AED/W (ASSUMPTION; part of the water system)
  electricalPerW: 0.45,         // DC/AC cabling, isolation, surge/earth-fault protection, utility NOC and bidirectional meter, AED/W
  reinforcedCanopyFactor: 1.15, // high-wind structure uplift
  inverterPerKw: 480,           // hybrid (battery-ready) inverter
  gridTieInverterPerKw: 380,    // string inverter without battery port (ASSUMPTION: ~20% below hybrid)
  batteryPerKwh: 750,           // LiFePO4 with BMS, rack, cabling and commissioning (retail modules ~AED 410–530/kWh)
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
  degradation: 0.005,           // module output loss per year
  lifeYears: 25,
  // Value of a litre of captured water that replaces metered utility water: DEWA residential green
  // slab AED 7.70/m³ + water fuel surcharge AED 1.10/m³, + 5% VAT = AED 9.24/m³ (checked 22 Nov 2026).
  // Sewerage fees are excluded (they are not charged on every account). Used as a proxy outside Dubai.
  waterPerL: 0.00924,
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
 * @param {"solar-first"|"essential"|"complete"|"max"} packageId ("recommended" is accepted as the old name of "complete")
 * @param {object} context { utilityId, customer, backup, waterSavings } — waterSavings: false when captured water
 *   would not replace water you pay the utility for (then it is shown in litres but valued at AED 0)
 */
export function sizeSystem(climate, tierId = "S", inputs = {}, choices = {}, packageId = "complete", context = {}) {
  const utility = UTILITIES[context.utilityId] || UTILITIES.dewa;
  const customer = context.customer === "national" ? "national" : "expat";
  const wantsBackup = !!context.backup;
  const tier = TIERS[tierId] || TIERS.S;
  const pkg = PACKAGES[packageKey(packageId)];
  const hasWater = pkg.water !== false;
  const countWater = context.waterSavings !== false;
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
  const autoClean = typeof choices.cleaning === "boolean" ? choices.cleaning : pkg.cleaning === "auto";
  const fullTreatment = hasWater && (typeof choices.treatment === "boolean" ? choices.treatment : !pkg.waterLite);
  const useRobot = dusty || !hasWater; // the rinse rail needs the rain tank
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
    id: "solar", group: "energy", name: "Solar canopy", core: true, recommended: true,
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

  // ---------- Grid connection + protection (required in every package) ----------
  components.push({
    id: "grid", group: "energy", name: "Grid connection + protection", core: true, required: true, recommended: true,
    capacity: { value: pvKwp, unit: "kWp", text: `Rated for ${fmt(pvKwp, 1)} kWp` },
    spec: "DC and AC isolators, surge and earth-fault protection, cabling, bidirectional utility meter and connection approval (NOC)",
    output: "Safe, approved connection to the building and the grid",
    why: "Required for any grid-connected solar system and by the utility's connection rules. It is never optional and stays in every package, including Solar-first.",
    rules: [rule("Grid-connected array", true, "Protection, isolation and metering included")],
    metrics: {},
    costAed: pvKwp * 1000 * RATES.electricalPerW,
  });

  // ---------- Panel cleaning ----------
  const recovered = pvKwp * c.solar * BOS_EFFICIENCY * thermalDerate * (soilingRaw - soilingManaged) * 365;
  components.push({
    id: "cleaning", group: "energy", name: !autoClean ? "Soiling alerts + manual cleaning" : useRobot ? "Waterless robotic cleaning" : "Rain-fed rinse rail", core: true, recommended: true,
    capacity: { value: recovered, unit: "kWh/yr", text: `Recovers ~${fmt(recovered)} kWh/yr` },
    spec: !autoClean ? "Soiling reference cell tells you when a manual clean pays off" : useRobot ? "Dry microfibre brush robot, triggered by the soiling reference cell" : "Low-flow spray rail fed from the rain tank",
    output: `Soiling loss ${Math.round(soilingRaw * 100)}% → ${(soilingManaged * 100).toFixed(1)}%`,
    why: !autoClean
      ? `Automatic cleaning hardware is excluded. The controller still measures soiling and alerts you when a manual clean is worthwhile. The output estimate assumes those manual cleans happen.`
      : dusty
      ? `Low rain (${fmt(c.rain)} mm/yr) means dust builds up and is rarely washed off, and water is too scarce to spend on rinsing. A waterless robot keeps the array clean without using the tank.`
      : !hasWater
      ? "Solar-first has no rain tank, so panel rinsing is not available; a waterless robot cleans the array instead."
      : `Enough rain (${fmt(c.rain)} mm/yr) to refill the tank, so harvested water can rinse the panels whenever the soiling sensor crosses its threshold.`,
    rules: [
      rule(`Rain < 300 mm/yr (site: ${fmt(c.rain)})`, dusty, dusty ? "Waterless robot, 0 L of water used" : "Rinse rail using harvested rain"),
      rule("Automatic cleaning selected", autoClean, autoClean ? "Controller schedules cleaning within its safe operating limits" : "Soiling alerts remain; cleaning is manual"),
    ],
    metrics: { recoveredKwhYear: recovered, soilingRaw, soilingManaged, autoClean },
    costAed: !autoClean ? 0 : useRobot ? Math.max(RATES.robotMin, pvKwp * RATES.robotPerKwp) : Math.max(RATES.rinseMin, pvKwp * RATES.rinsePerKwp),
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

  // ---------- Battery (optional) ----------
  const pvKwhDay = pvKwhYear / 365;
  const share = tier.batteryShare * pkg.batteryShareFactor;
  const nightKwh = Math.min(site.loadKwhDay * share, pvKwhDay * 0.6);
  const batteryKwh = Math.max(tier.batteryModuleKwh, ceilTo(nightKwh, tier.batteryModuleKwh));
  const coolBattery = c.temp >= 27;
  const batteryBase = batteryKwh * RATES.batteryPerKwh;
  const batteryCost = batteryBase + (coolBattery ? Math.max(RATES.batteryCoolingMin, batteryBase * RATES.batteryCoolingFactor) : 0);
  // monthly economics with and without the battery, on this utility's real tariff
  const sun = monthlySun(climate);
  const sunMean = sun.reduce((a, b) => a + b, 0) / 12;
  const pvMonthly = sun.map((x, m) => pvKwp * pr * x * DAYS[m] * (c.solar / Math.max(0.1, sunMean)));
  const loadMonthly = LOAD_SHAPE.map((k, m) => site.loadKwhDay * k * DAYS[m]);
  const dwelling = t === "S" ? "villa" : "villa";
  const econArgs = { utility, customer, dwelling, tierId: t };
  const econNo = annualEconomics({ ...econArgs, pvMonthly, loadMonthly, batteryKwh: 0 });
  const econYes = annualEconomics({ ...econArgs, pvMonthly, loadMonthly, batteryKwh });
  const batteryAnnualValue = econYes.saving - econNo.saving;
  const batteryPayback = batteryAnnualValue > 1 ? (batteryCost * (1 + RATES.installRate[t])) / batteryAnnualValue : null;
  const batteryPays = batteryPayback != null && batteryPayback <= 10;
  const criticalKw = (site.loadKwhDay / 24) * 0.4; // fridge, lights, network, a little cooling (ASSUMPTION)
  const backupHours = (batteryKwh * 0.8) / Math.max(0.1, criticalKw);
  const netMetered = utility.netMetering === "yes";
  components.push({
    id: "battery", group: "energy", name: "LiFePO4 battery storage", core: false,
    recommended: wantsBackup || batteryPays,
    defaultOn: wantsBackup || batteryPays || pkg.id === "max",
    capacity: { value: batteryKwh, unit: "kWh", text: `${fmt(batteryKwh)} kWh` },
    spec: `48 V LiFePO4 with BMS${coolBattery ? ", active-cooled enclosure" : ""} · about ${fmt(backupHours)} h of essential-load backup`,
    output: netMetered ? `Backup ~${fmt(backupHours)} h · bill saving ≈ ${CURRENCY} ${fmt(Math.max(0, batteryAnnualValue))}/yr` : `Shifts ${fmt(econYes.selfUsed - econNo.selfUsed)} kWh/yr into the evening · ≈ ${CURRENCY} ${fmt(batteryAnnualValue)}/yr`,
    why: netMetered
      ? `${utility.name} credits exported solar at the same rate you pay for imports, so storing solar in a battery saves almost nothing on the bill (≈ ${CURRENCY} ${fmt(Math.max(0, batteryAnnualValue))}/yr). Its value is backup: about ${fmt(backupHours)} hours of essential loads during an outage. ${wantsBackup ? "You asked for backup, so it is included." : "Leave it out unless outages matter to you; the grid is the cheaper battery."}`
      : `${utility.name} export credit is not verified, so surplus solar is worth nothing unless you use it. The battery moves ${fmt(econYes.selfUsed - econNo.selfUsed)} kWh/yr of daytime surplus into the evening, worth ≈ ${CURRENCY} ${fmt(batteryAnnualValue)}/yr${batteryPayback ? `, paying back in about ${fmt(batteryPayback, 1)} years` : ""}.`,
    rules: [
      rule(`Net metering available with ${utility.name}`, netMetered, netMetered ? "Battery adds backup, not bill savings" : "Battery raises self-consumption"),
      rule(`Battery pays back within 10 years`, batteryPays, batteryPayback ? `${fmt(batteryPayback, 1)} years` : "Does not pay back on bill savings"),
      rule("You need backup during outages", wantsBackup, wantsBackup ? "Included for resilience" : "Not requested"),
      rule(`${Math.round(share * 100)}% of load (${fmt(site.loadKwhDay * share)} kWh) vs 60% of solar (${fmt(pvKwhDay * 0.6)} kWh)`, true, `Sized at ${fmt(batteryKwh)} kWh in ${tier.batteryModuleKwh} kWh modules`),
      rule(`Average temperature ≥ 27 °C (site: ${fmt(c.temp, 1)} °C)`, coolBattery, coolBattery ? "Active-cooled enclosure added" : "Passive enclosure"),
    ],
    metrics: { batteryKwh, nightKwh, backupHours, batteryAnnualValue, batteryPayback },
    costAed: batteryCost,
  });

  // ---------- Hybrid inverter ----------
  const peakKw = (site.loadKwhDay / 24) * 2.5;
  const inverterKw = Math.max(3, ceilTo(Math.max(pvKwp * 0.85, peakKw), t === "S" ? 1 : 5));
  components.push({
    id: "inverter", group: "energy", name: "Hybrid inverter", core: true, recommended: true,
    capacity: { value: inverterKw, unit: "kW", text: `${fmt(inverterKw)} kW` },
    spec: "Grid-interactive inverter with anti-islanding",
    output: "Solar, wind and grid on one protected bus",
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
    id: "condensate", group: "water", name: "AC condensate recovery", core: false, recommended: hasWater && condensateViable,
    available: hasWater, unavailableWhy: hasWater ? null : "Needs the WELOS water system, which Solar-first does not include.",
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
  const condensateIncluded = hasWater && (choices.condensate ?? (pkg.optionalDefault === "off" ? false : condensateViable));
  const condensateBufferL = condensateIncluded ? condensateLDay * 3 : 0;
  const tankTarget = Math.min(Math.max(eventCaptureL, condensateBufferL), Math.max(site.waterLDay * 7, 300));
  const tankL = tankSize(Math.max(300, tankTarget));
  const rainLYear = c.rain * site.roofM2 * RUNOFF * FIRST_FLUSH_KEEP;
  const lowRain = c.rain < 120;
  const highRain = c.rain >= 800;
  components.push({
    id: "water", group: "water", name: "Rain catchment, storage + treatment", core: hasWater, recommended: hasWater,
    available: hasWater, unavailableWhy: hasWater ? null : "Not in Solar-first: no rain gutter, tank, first flush, filters, pump or water routing.",
    capacity: { value: tankL, unit: "L", text: `${fmt(tankL)} L tank · ${tier.treatmentLpm} L/min treatment` },
    spec: !fullTreatment ? "First flush → sediment filter → pump (suitable non-potable uses only; not drinking water)" : "First flush → sediment + carbon filters → UV-C → variable-speed pump (non-potable)",
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
      rule("Advanced treatment selected", fullTreatment, fullTreatment ? "Carbon filtration and UV-C added; non-potable use only" : "First flush, tank, sediment filter and pump retained; intended use must suit the lighter treatment"),
    ],
    metrics: { tankL, rainLYear, designEventMm, eventCaptureL, fullTreatment },
    // includes the canopy's rain gutter and downpipes
    costAed: (fullTreatment ? RATES.treatment[t] : RATES.treatmentLite[t]) + tankL * RATES.tankPerL + pvKwp * 1000 * RATES.gutterPerW,
  });

  // ---------- Control core ----------
  components.push({
    id: "controller", group: "control", name: "WELOS OS edge controller", core: true, recommended: true,
    capacity: { value: 1, unit: "unit", text: t === "S" ? "1 controller" : t === "M" ? "1 controller + metering hub" : "Redundant controller pair + BMS gateway" },
    spec: hasWater
      ? "Offline-first control, safety interlocks, soiling reference cell, energy and water metering"
      : "Offline-first control, soiling reference cell and energy metering. Water functions are inactive: there is no water hardware to monitor or route",
    output: "Runs every 250 ms. Works with no internet.",
    why: hasWater
      ? "Coordinates every subsystem: when to charge, export, clean, divert first flush or hold storm reserve. Hard-wired protections stay independent of it."
      : "Kept in Solar-first because it runs the energy side: solar and battery monitoring, charge and export decisions, soiling alerts and automatic cleaning, and the welOS owner app. Rain capture, first-flush diversion, storage, treatment and water routing are not available. The inverter and hard-wired protections operate safely without it. Priced the same as in the integrated packages (conservative).",
    rules: [rule("Always included", true, hasWater ? "The WELOS operating layer is the product" : "Energy functions only in Solar-first")],
    metrics: {},
    costAed: RATES.controller[t],
  });

  // ---------- Apply user choices ----------
  for (const part of components) {
    const choice = choices[part.id];
    const byDefault = part.defaultOn ?? part.recommended;
    part.available = part.available !== false;
    part.included = !part.available ? false : part.core ? true : typeof choice === "boolean" ? choice : byDefault;
    part.overridden = part.available && !part.core && typeof choice === "boolean" && choice !== byDefault;
    part.costAed = roundTo(part.costAed, 10);
  }

  const included = (id) => components.find((p) => p.id === id)?.included;
  // inverter type follows the battery choice
  const inv = components.find((p) => p.id === "inverter");
  const withBattery = included("battery");
  inv.name = withBattery ? "Hybrid inverter" : "Grid-tie inverter";
  inv.spec = withBattery ? "Hybrid inverter with battery port, anti-islanding and backup output" : "String inverter with anti-islanding (no battery port; swap to hybrid to add storage later)";
  inv.output = withBattery ? "Solar, wind, battery and grid on one protected 48 V DC bus" : "Solar and wind straight to the building and grid";
  inv.costAed = roundTo(inverterKw * (withBattery ? RATES.inverterPerKw : RATES.gridTieInverterPerKw), 10);
  const econ = withBattery ? econYes : econNo;
  const hardwareAed = components.filter((p) => p.included).reduce((sum, p) => sum + p.costAed, 0);
  const installAed = roundTo(hardwareAed * RATES.installRate[t], 10);
  const totalAed = hardwareAed + installAed;
  const energyKwhYear = pvKwhYear + (included("wind") ? windKwhYear : 0);
  const waterLYear = hasWater ? rainLYear + (included("condensate") ? condensateLYear : 0) : 0;
  // electricity: real bills before and after (wind adds a flat monthly share)
  const windMonthly = included("wind") ? windKwhYear / 12 : 0;
  const econFinal = windMonthly ? annualEconomics({ ...econArgs, pvMonthly: pvMonthly.map((x) => x + windMonthly), loadMonthly, batteryKwh: withBattery ? batteryKwh : 0 }) : econ;
  // Every displayed money figure is a whole dirham, and the totals are sums of the displayed parts,
  // so the arithmetic on the page adds up exactly.
  const billBeforeAed = Math.round(econFinal.billBefore);
  const billAfterAed = Math.round(econFinal.billAfter);
  const electricitySavingsAed = billBeforeAed - billAfterAed;
  // water only counts where it replaces metered utility water, and only up to the building's use
  const waterUsedLYear = hasWater ? Math.min(waterLYear, site.waterLDay * 365) : 0;
  const waterSavingsAed = countWater ? Math.round(waterUsedLYear * RATES.waterPerL) : 0;
  const annualSavingsAed = electricitySavingsAed + waterSavingsAed;
  let lifeElec = 0;
  for (let y = 0; y < RATES.lifeYears; y++) lifeElec += electricitySavingsAed * (1 - RATES.degradation) ** y;
  const lifetimeElectricityAed = Math.round(lifeElec);
  const lifetimeWaterAed = waterSavingsAed * RATES.lifeYears;
  const lifetimeSavingsAed = lifetimeElectricityAed + lifetimeWaterAed;
  const avgLoadMonth = (site.loadKwhDay * 365) / 12;

  const monthlyRate = RATES.financeApr / 12;
  const months = RATES.financeYears * 12;
  const monthlyAed = Math.round((totalAed * monthlyRate) / (1 - (1 + monthlyRate) ** -months));

  return {
    tier,
    package: pkg,
    hasWater,
    request: { climate, tierId: t, inputs, choices, packageId: pkg.id, context },
    utility,
    customer,
    monthly: econFinal.months,
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
      electricitySavingsAed,
      waterSavingsAed,
      waterUsedLYear,
      waterCounted: hasWater && countWater,
      waterRatePerL: RATES.waterPerL,
      waterRateBasis: utility.id === "dewa" ? "DEWA residential water, green slab incl. fuel surcharge and VAT" : `DEWA water rate used as a proxy; ${utility.name} water tariff not checked`,
      billBeforeAed,
      billAfterAed,
      exportKwh: econFinal.exported,
      importKwh: econFinal.imported,
      selfSufficiencyPct: (1 - econFinal.imported / Math.max(1, econFinal.load)) * 100,
      lifetimeElectricityAed,
      lifetimeWaterAed,
      lifetimeSavingsAed,
      lifetimeNetAed: lifetimeSavingsAed - totalAed,
      marginalRate: marginalRate(avgLoadMonth, utility, { customer, dwelling, days: 30 }),
      withBattery: !!withBattery,
      backupHours: withBattery ? backupHours : 0,
      paybackYears: annualSavingsAed > 0 ? totalAed / annualSavingsAed : null,
      electricityPaybackYears: electricitySavingsAed > 0 ? totalAed / electricitySavingsAed : null,
      monthlyAed,
      financeTotalAed: monthlyAed * months,
      monthlySavingsAed: Math.round(annualSavingsAed / 12),
      energyCoveragePct: (energyKwhYear / Math.max(1, site.loadKwhDay * 365)) * 100,
      waterCoveragePct: (waterLYear / Math.max(1, site.waterLDay * 365)) * 100,
      co2TonnesYear: (energyKwhYear * RATES.gridKgCo2PerKwh) / 1000,
    },
  };
}

/**
 * The money story of one build, as numbers and as the exact sentences shown on the product page,
 * in the downloaded summary and by the advisor. Every figure is taken from `result.totals`.
 */
export const EXCLUSIONS = "Excludes maintenance, inverter and battery replacement, future tariff changes, financing interest and discounting.";
export function explainSavings(result) {
  const t = result.totals, u = result.utility;
  const m = (x) => `${CURRENCY} ${fmt(x)}`;
  const water = !result.hasWater
    ? { counted: false, text: "No water system in this package, so no water savings." }
    : !t.waterCounted
      ? { counted: false, text: `${fmt(t.waterLYear)} L/yr captured, valued at ${CURRENCY} 0: you said it would not replace water you pay the utility for.` }
      : { counted: true, text: `${fmt(t.waterUsedLYear)} L/yr used in place of metered water × ${CURRENCY} ${t.waterRatePerL.toFixed(5)}/L = ${m(t.waterSavingsAed)}/yr (${t.waterRateBasis}).` };
  return {
    price: t.totalAed,
    electricity: { before: t.billBeforeAed, after: t.billAfterAed, saving: t.electricitySavingsAed,
      text: `${u.name} bill ${m(t.billBeforeAed)} → ${m(t.billAfterAed)} a year = ${m(t.electricitySavingsAed)}/yr electricity saving.` },
    water: { ...water, saving: t.waterSavingsAed, litres: t.waterUsedLYear, ratePerL: t.waterRatePerL, basis: t.waterRateBasis },
    annual: { total: t.annualSavingsAed,
      text: result.hasWater && t.waterCounted ? `${m(t.electricitySavingsAed)} electricity + ${m(t.waterSavingsAed)} water = ${m(t.annualSavingsAed)}/yr` : `${m(t.annualSavingsAed)}/yr (electricity only)` },
    payback: { years: t.paybackYears, electricityOnlyYears: t.electricityPaybackYears,
      text: t.paybackYears ? `${m(t.totalAed)} ÷ ${m(t.annualSavingsAed)}/yr = ${t.paybackYears.toFixed(1)} years (simple payback, first-year savings)` : "No payback: the build saves nothing on this tariff." },
    lifetime: { electricity: t.lifetimeElectricityAed, water: t.lifetimeWaterAed, net: t.lifetimeNetAed,
      text: `${RATES.lifeYears} years: ${m(t.lifetimeElectricityAed)} electricity (output ageing ${RATES.degradation * 100}%/yr)${t.lifetimeWaterAed ? ` + ${m(t.lifetimeWaterAed)} water` : ""} − ${m(t.totalAed)} price = ${m(t.lifetimeNetAed)}.` },
    finance: { monthly: t.monthlyAed, total: t.financeTotalAed,
      text: `Illustrative only: ${m(t.monthlyAed)}/month for ${RATES.financeYears} years at ${(RATES.financeApr * 100).toFixed(2)}% APR (${m(t.financeTotalAed)} repaid in total). Not a lender offer.` },
    exclusions: EXCLUSIONS,
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
    { component: "Water", text: result.hasWater ? by.water.why : by.water.unavailableWhy },
    { component: "Wind", text: by.wind.why },
    { component: "Cleaning", text: by.cleaning.why },
  ];
  const upgrades = [];
  if (by.condensate.recommended && !by.condensate.included) upgrades.push({ title: "Add AC condensate recovery", text: `Adds about ${fmt(by.condensate.metrics.condensateLYear)} L/yr of water for AED ${fmt(by.condensate.costAed)}.`, impact: "water" });
  if (by.wind.recommended && !by.wind.included) upgrades.push({ title: "Turn the wind turbine back on", text: `Your hub-height wind supports ${fmt(by.wind.metrics.windKwhYear)} kWh/yr of night-time generation.`, impact: "energy" });
  if (by.solar.metrics.modules >= by.solar.metrics.maxModules && totals.energyCoveragePct < 95) upgrades.push({ title: "Extend the canopy over parking or terraces", text: "The array already fills the roof. Each extra 10 m² adds about 2.2 kWp of capacity.", impact: "energy" });
  if (totals.energyCoveragePct < 60) upgrades.push({ title: "Cut the load before adding hardware", text: "Efficient cooling and smart scheduling through WELOS OS are usually cheaper per kWh than more panels.", impact: "cost" });
  if (result.package.id !== "essential" && result.hasWater) {
    const r = result.request;
    const lean = sizeSystem(r.climate, r.tierId, r.inputs, r.choices, "essential", r.context);
    upgrades.unshift({ title: `Start with Essential at ${CURRENCY} ${fmt(lean.totals.totalAed)}`, text: `Same site, ${CURRENCY} ${fmt(totals.totalAed - lean.totals.totalAed)} less upfront: about ${fmt(Math.min(lean.totals.energyCoveragePct, 100))}% of your electricity now, with the canopy and controller ready to expand later.`, impact: "cost" });
  }
  if (result.hasWater) {
    const r = result.request;
    const sf = sizeSystem(r.climate, r.tierId, r.inputs, r.choices, "solar-first", r.context);
    upgrades.push({ title: `Solar-first at ${CURRENCY} ${fmt(sf.totals.totalAed)} if you don't need water`, text: `Drops the rain catchment, tank, treatment and condensate recovery (and their ${CURRENCY} ${fmt(totals.waterSavingsAed)}/yr water saving). Payback ${sf.totals.paybackYears ? fmt(sf.totals.paybackYears, 1) : "—"} years on electricity alone.`, impact: "cost" });
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
    summary: `${fmt(by.solar.metrics.pvKwp, 1)} kWp of solar, ${by.battery.included ? `${fmt(by.battery.metrics.batteryKwh)} kWh of storage` : "no battery (the grid stores your surplus)"}${result.hasWater ? ` and a ${fmt(by.water.metrics.tankL)} L water system, covering about ${fmt(Math.min(totals.energyCoveragePct, 100))}% of your electricity and ${fmt(Math.min(totals.waterCoveragePct, 100))}% of your non-potable water` : `, no water system (Solar-first), covering about ${fmt(Math.min(totals.energyCoveragePct, 100))}% of your electricity`}. Estimated simple payback ${totals.paybackYears ? fmt(totals.paybackYears, 1) : "—"} years on ${result.utility.name} tariffs, on ${explainSavings(result).annual.text}.`,
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
      if (result.package.id === "solar-first") return `You're on Solar-first at ${CURRENCY} ${fmt(t.totalAed)}, the build without the water system. To spend less, drop automatic cleaning (soiling alerts stay) or compare Essential, which targets about 60% of your electricity.`;
      if (result.package.id === "essential") return `You're on Essential at ${CURRENCY} ${fmt(t.totalAed)}. Review any selected add-ons on the product page before reducing the solar target. Automatic cleaning can be replaced by soiling alerts and manual cleaning; the lighter water kit retains first flush, storage and pumping for suitable non-potable uses.`;
      const lean = sizeSystem(r.climate, r.tierId, r.inputs, r.choices, "essential", r.context);
      const leanParts = Object.fromEntries(lean.components.map((p) => [p.id, p]));
      return `Essential with your current add-on choices: ${CURRENCY} ${fmt(lean.totals.totalAed)} instead of ${CURRENCY} ${fmt(t.totalAed)}. It targets about 60% of daily electricity use with standard modules. ${leanParts.cleaning.metrics.autoClean ? "Automatic cleaning stays selected." : "Soiling alerts stay included; cleaning is manual."} ${leanParts.water.metrics.fullTreatment ? "Advanced treatment stays selected." : "It uses the lighter non-potable water kit."} Modelled annual electricity coverage is ${fmt(lean.totals.energyCoveragePct)}%. Compare the add-ons on the product page to reduce cost without changing the package.`;
    }
    case "water":
      return result.hasWater ? by.water.why : `${by.water.unavailableWhy} Choose Essential, Complete or Max to add the water system.`;
    case "wind":
      return `${by.wind.why} ${by.wind.included ? `It adds ${by.wind.output} for ${CURRENCY} ${fmt(by.wind.costAed)}.` : `If you add it anyway it costs ${CURRENCY} ${fmt(by.wind.costAed)} for about ${by.wind.output}.`}`;
    case "payback":
    {
      const e = explainSavings(result);
      return `About ${t.paybackYears ? t.paybackYears.toFixed(1) : "—"} years, as an estimate: ${CURRENCY} ${fmt(t.totalAed)} installed ÷ ${e.annual.text} on ${result.utility.name} tariffs. On electricity alone it is ${t.electricityPaybackYears ? t.electricityPaybackYears.toFixed(1) : "—"} years. Financed over ${RATES.financeYears} years at ${(RATES.financeApr * 100).toFixed(2)}% APR (illustrative) that is about ${CURRENCY} ${fmt(t.monthlyAed)}/month, against ${CURRENCY} ${fmt(t.monthlySavingsAed)}/month saved.`;
    }
    default:
      return null;
  }
}
