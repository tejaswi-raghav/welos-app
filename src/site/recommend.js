// Building-type suggestions. Every number comes from the sizing engine on the chosen
// location's real tariff; the text only explains the numbers and states the criteria.
//
// Criteria (shown on the page next to the suggestion):
//   Package  — of the integrated packages (Essential, Complete, Max: the ones that include the
//              water system), the one with the highest modelled 25-year net savings. Solar-first
//              is compared alongside it, not hidden: if it nets more, the reasons say so.
//   Battery  — suggested when you ask for outage backup, or when it pays for itself on bill
//              savings within 10 years.
import { sizeSystem, CURRENCY, PACKAGES } from "./sizing.js";
import { regionById, DEFAULT_REGION } from "./regions.js";

export const BUILDING_TYPES = Object.freeze([
  { id: "villa", tier: "S", label: "Villa", sub: "Villas and townhouses", defaultLoad: 45 },
  { id: "residential", tier: "M", label: "Residential building", sub: "Apartment buildings and compounds", defaultLoad: 350 },
  { id: "commercial", tier: "L", label: "Commercial", sub: "Offices, retail and warehouses", defaultLoad: 2400 },
]);
export const buildingById = Object.fromEntries(BUILDING_TYPES.map((b) => [b.id, b]));
export const INTEGRATED = ["essential", "complete", "max"];
export const SUGGESTION_CRITERIA = {
  package: "Highest modelled 25-year net savings among the integrated packages (the ones with the water system).",
  battery: "Suggested if you need outage backup, or if it pays for itself on bill savings within 10 years.",
};
const fmt = (x, d = 0) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d });
const money = (x) => `${CURRENCY} ${fmt(x)}`;

export function contextFor(regionId, { customer = "expat", backup = false, waterSavings = true } = {}) {
  const region = regionById[regionId] || DEFAULT_REGION;
  return { region, context: { utilityId: region.utility, customer, backup, waterSavings } };
}

/**
 * Suggested configuration for a building type at a location.
 * Returns the suggested package and battery, the builds behind them, and plain reasons.
 */
export function recommend(regionId, buildingId, { customer = "expat", backup = false, inputs = {}, waterSavings = true } = {}) {
  const b = buildingById[buildingId] || BUILDING_TYPES[0];
  const { region, context } = contextFor(regionId, { customer, backup, waterSavings });
  const run = (pkg, battery) => sizeSystem(region.climate, b.tier, inputs, { battery }, pkg, context);

  // battery: decided on the Complete build's economics (backup request or ≤ 10-year battery payback)
  const probe = run("complete", false);
  const batt = probe.components.find((c) => c.id === "battery");
  const battery = backup || batt.recommended;

  const options = Object.fromEntries(Object.keys(PACKAGES).map((id) => [id, run(id, battery)]));
  const packageId = INTEGRATED.reduce((best, id) => (options[id].totals.lifetimeNetAed > options[best].totals.lifetimeNetAed ? id : best), INTEGRATED[0]);
  const chosen = options[packageId];
  const solarFirst = options["solar-first"];
  const without = run(packageId, false), withB = run(packageId, true);

  const u = chosen.utility, net = u.netMetering === "yes";
  const reasons = [];
  reasons.push(`${PACKAGES[packageId].name} has the highest modelled 25-year net savings of the integrated packages here (${money(chosen.totals.lifetimeNetAed)}${chosen.totals.lifetimeNetAed < 0 ? ", which is still a net cost" : ""}).`);
  const sfGain = solarFirst.totals.lifetimeNetAed - chosen.totals.lifetimeNetAed;
  reasons.push(sfGain > 0
    ? `If you don't need the water system, Solar-first nets ${money(sfGain)} more over 25 years (${money(solarFirst.totals.totalAed)} installed, payback ${solarFirst.totals.paybackYears ? fmt(solarFirst.totals.paybackYears, 1) : "—"} yrs). Its savings are electricity only.`
    : `Solar-first would net ${money(-sfGain)} less over 25 years here, so the water system earns its place.`);
  if (b.id === "villa") reasons.push(`A villa uses most of its power in the evening and at night. ${net ? `${u.name} nets your solar against that use month by month, so the timing doesn't cost you.` : "Without a verified export credit, daytime surplus is only worth something if you use or store it."}`);
  if (b.id === "residential") reasons.push(`Solar on an apartment building offsets the owners' association account (common areas, pumps, lifts, chillers). ${net ? "Net metering credits any surplus to that account." : "Size close to daytime common-area demand so little is exported unpaid."}`);
  if (b.id === "commercial") reasons.push(`About 72% of commercial use happens in daylight, so most solar is used directly. Each kWh offset is worth up to ${fmt(chosen.totals.marginalRate * 100, 1)} fils at your consumption level.`);
  reasons.push(net
    ? `Battery: ${backup ? "included because you asked for outage backup" : "not suggested"}. Under net metering it adds about ${fmt(withB.totals.backupHours)} h of backup for ${money(withB.totals.totalAed - without.totals.totalAed)}, but almost nothing to the bill saving.`
    : `Battery: ${battery ? "suggested" : "optional"}. It raises the electricity saving by ${money(withB.totals.electricitySavingsAed - without.totals.electricitySavingsAed)}/yr${batt.metrics.batteryPayback ? ` and pays for itself in about ${fmt(batt.metrics.batteryPayback, 1)} years` : ""}.`);
  return { building: b, region, packageId, battery, result: chosen, options, solarFirst, without, withBattery: withB, reasons, criteria: SUGGESTION_CRITERIA };
}
