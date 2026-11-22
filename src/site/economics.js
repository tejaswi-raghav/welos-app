// Monthly bill and net-metering model. Deterministic; every assumption is named here.
import { UTILITIES, VAT, DAYS, DUBAI_SUN } from "./regions.js";

/** Seasonal load shape for UAE buildings (air-conditioning driven). Normalised to mean 1. ASSUMPTION. */
const RAW_LOAD_SHAPE = [0.72, 0.74, 0.86, 1.0, 1.16, 1.27, 1.34, 1.34, 1.22, 1.04, 0.83, 0.76];
const mean = RAW_LOAD_SHAPE.reduce((a, b) => a + b, 0) / 12;
export const LOAD_SHAPE = RAW_LOAD_SHAPE.map((x) => x / mean);

/** Share of consumption that happens while the sun is up. ASSUMPTION, used only where exports earn nothing. */
export const DAYTIME_SHARE = { S: 0.42, M: 0.5, L: 0.72 };

/** Monthly solar resource: the region's NASA monthly values, or Dubai's seasonal shape scaled to the annual mean. */
export function monthlySun(climate) {
  if (Array.isArray(climate?.monthly) && climate.monthly.length === 12) return climate.monthly.map(Number);
  const annual = Number(climate?.solarDailyKwhM2) || 5;
  const m = DUBAI_SUN.reduce((a, b) => a + b, 0) / 12;
  return DUBAI_SUN.map((x) => (x / m) * annual);
}

/**
 * Electricity bill for one month, AED including fuel surcharge and VAT.
 * @param {number} kwh monthly consumption billed
 * @param {object} utility from UTILITIES
 * @param {object} opts { customer: 'expat'|'national', dwelling: 'villa'|'flat', days }
 */
export function monthlyBill(kwh, utility = UTILITIES.dewa, { customer = "expat", dwelling = "villa", days = 30 } = {}) {
  const k = Math.max(0, kwh);
  let bands;
  if (utility.basis === "daily") {
    const set = utility.daily[customer] || utility.daily.expat;
    bands = (set[dwelling] || set.villa).map(([limit, rate]) => [limit === Infinity ? Infinity : limit * days, rate]);
  } else bands = utility.slabs;
  let rest = k, prev = 0, energy = 0;
  for (const [limit, rate] of bands) {
    const take = Math.min(rest, limit - prev);
    if (take <= 0) break;
    energy += take * rate;
    rest -= take; prev = limit;
  }
  return (energy + k * utility.fuelSurcharge) * (1 + VAT);
}

/** Marginal price of the last kWh in a month, AED incl. surcharge and VAT. */
export function marginalRate(kwh, utility, opts) {
  return monthlyBill(kwh + 1, utility, opts) - monthlyBill(kwh, utility, opts);
}

/**
 * Twelve months of bills before and after solar, in steady state (credits carried from a
 * previous year where net metering allows).
 */
export function annualEconomics({ pvMonthly, loadMonthly, utility = UTILITIES.dewa, customer = "expat", dwelling = "villa", tierId = "S", batteryKwh = 0 }) {
  const net = utility.netMetering === "yes";
  const dayShare = DAYTIME_SHARE[tierId] ?? 0.45;
  const months = [];
  let bank = 0;
  const run = (record) => {
    for (let m = 0; m < 12; m++) {
      const days = DAYS[m], pv = pvMonthly[m], load = loadMonthly[m];
      const before = monthlyBill(load, utility, { customer, dwelling, days });
      let imported, exported = 0, used = 0, selfUsed, batteryShift = 0;
      if (net) {
        // monthly netting: solar offsets the month's consumption, surplus becomes a kWh credit
        selfUsed = Math.min(pv, load);
        let deficit = load - pv;
        if (deficit < 0) { exported = -deficit; bank += exported; deficit = 0; }
        used = Math.min(bank, deficit); bank -= used; deficit -= used;
        imported = deficit;
      } else {
        // no export credit: only what is consumed on site counts; a battery shifts surplus into the evening
        selfUsed = Math.min(pv, load * dayShare);
        const surplus = pv - selfUsed;
        batteryShift = Math.min(surplus, batteryKwh * 0.9 * days, load * (1 - dayShare));
        exported = surplus - batteryShift;
        imported = load - selfUsed - batteryShift;
      }
      const after = monthlyBill(imported, utility, { customer, dwelling, days });
      if (record) months.push({ m, days, pv, load, imported, exported, creditUsed: used, creditBank: bank, selfUsed, batteryShift, billBefore: before, billAfter: after, saving: before - after });
    }
  };
  if (net) run(false); // warm-up year so winter can draw on last summer's credit
  run(true);
  const sum = (k) => months.reduce((a, x) => a + x[k], 0);
  return {
    netMetering: utility.netMetering,
    months,
    billBefore: sum("billBefore"),
    billAfter: sum("billAfter"),
    saving: sum("saving"),
    pv: sum("pv"),
    load: sum("load"),
    exported: sum("exported"),
    imported: sum("imported"),
    selfUsed: sum("selfUsed") + sum("batteryShift"),
    creditBankEnd: bank,
  };
}

export { UTILITIES };
