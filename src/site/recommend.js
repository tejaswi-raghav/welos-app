// Building-type recommendations. Every recommendation is computed by the sizing engine on
// the chosen location's real tariff; the text only explains the numbers.
import { sizeSystem, CURRENCY } from "./sizing.js";
import { regionById, DEFAULT_REGION } from "./regions.js";

export const BUILDING_TYPES = Object.freeze([
  { id: "villa", tier: "S", label: "Villa", sub: "Villas and townhouses", defaultLoad: 45 },
  { id: "residential", tier: "M", label: "Residential building", sub: "Apartment buildings and compounds", defaultLoad: 350 },
  { id: "commercial", tier: "L", label: "Commercial", sub: "Offices, retail and warehouses", defaultLoad: 2400 },
]);
export const buildingById = Object.fromEntries(BUILDING_TYPES.map((b) => [b.id, b]));
const fmt = (x, d = 0) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d });

export function contextFor(regionId, { customer = "expat", backup = false } = {}) {
  const region = regionById[regionId] || DEFAULT_REGION;
  return { region, context: { utilityId: region.utility, customer, backup } };
}

/** Recommended configuration for a building type at a location, with both battery variants. */
export function recommend(regionId, buildingId, { customer = "expat", backup = false, inputs = {} } = {}) {
  const b = buildingById[buildingId] || BUILDING_TYPES[0];
  const { region, context } = contextFor(regionId, { customer, backup });
  const run = (battery, pkg = "recommended") => sizeSystem(region.climate, b.tier, inputs, { battery }, pkg, context);
  const without = run(false), withB = run(true);
  const batt = without.components.find((c) => c.id === "battery");
  let packageId = "recommended";
  if ((without.totals.paybackYears ?? 99) > 18) packageId = "essential";
  const battery = backup || batt.recommended;
  const chosen = run(battery, packageId);
  const u = without.utility, net = u.netMetering === "yes";
  const reasons = [];
  if (b.id === "villa") reasons.push(`A villa uses most of its power in the evening and at night. ${net ? `${u.name} nets your solar against that use month by month, so the timing doesn't cost you.` : "Without a verified export credit, daytime surplus is only worth something if you store it."}`);
  if (b.id === "residential") reasons.push(`Solar on an apartment building offsets the landlord or owners' association account (common areas, pumps, lifts, chillers). ${net ? "Net metering credits any surplus to that account." : "Size close to daytime common-area demand so little is exported unpaid."}`);
  if (b.id === "commercial") reasons.push(`About ${fmt(72)}% of commercial use happens in daylight, so most solar is used directly. Each kWh offset is worth up to ${fmt(chosen.totals.marginalRate * 100, 1)} fils at your consumption level.`);
  reasons.push(net
    ? `Battery: not needed for savings (it adds ${CURRENCY} ${fmt(withB.totals.totalAed - without.totals.totalAed)} and about ${fmt(withB.totals.backupHours)} h of backup). ${backup ? "Included because you asked for outage backup." : "Add it only if outage backup matters to you."}`
    : `Battery: ${batt.recommended ? "recommended" : "optional"}. It raises savings by ${CURRENCY} ${fmt(withB.totals.electricitySavingsAed - without.totals.electricitySavingsAed)}/yr${batt.metrics.batteryPayback ? ` and pays back in about ${fmt(batt.metrics.batteryPayback, 1)} years` : ""}.`);
  if (packageId === "essential") reasons.push(`Electricity is cheap on this tariff, so the full package would take over 18 years to pay back. Essential keeps the upfront cost down.`);
  return { building: b, region, packageId, battery, result: chosen, without, withBattery: withB, reasons };
}
