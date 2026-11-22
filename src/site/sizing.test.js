import test from "node:test";
import assert from "node:assert/strict";
import { sizeSystem, ruleAdvice, hubWind, TIERS } from "./sizing.js";
import { PRESETS } from "./presets.js";

const climate = (id) => PRESETS.find((p) => p.id === id).climate;
const part = (result, id) => result.components.find((p) => p.id === id);

test("same inputs always give the same build and price", () => {
  const a = sizeSystem(climate("dubai"), "M");
  const b = sizeSystem(climate("dubai"), "M");
  assert.deepEqual(a, b);
});

test("arid sites get a smaller, cheaper water tank than wet sites", () => {
  const dubai = sizeSystem(climate("dubai"), "S");
  const mumbai = sizeSystem(climate("mumbai"), "S");
  assert.ok(part(dubai, "water").metrics.tankL < part(mumbai, "water").metrics.tankL);
  assert.ok(part(dubai, "water").costAed < part(mumbai, "water").costAed);
});

test("hot sunny sites get premium heat-tolerant modules and waterless cleaning", () => {
  const dubai = sizeSystem(climate("dubai"), "S");
  assert.match(part(dubai, "solar").spec, /Heat-tolerant/);
  assert.equal(part(dubai, "cleaning").name, "Waterless robotic cleaning");
  const vevey = sizeSystem(climate("vevey"), "S");
  assert.match(part(vevey, "solar").spec, /Mono PERC/);
  assert.equal(part(vevey, "cleaning").name, "Rain-fed rinse rail");
});

test("wind is skipped at villa height in Dubai but recommended on tall commercial roofs", () => {
  assert.equal(part(sizeSystem(climate("dubai"), "S"), "wind").recommended, false);
  assert.equal(part(sizeSystem(climate("dubai"), "L"), "wind").recommended, true);
  assert.ok(hubWind(4, 45) > hubWind(4, 12));
});

test("condensate recovery is recommended only when hot and humid", () => {
  assert.equal(part(sizeSystem(climate("dubai"), "S"), "condensate").recommended, true);
  assert.equal(part(sizeSystem(climate("riyadh"), "S"), "condensate").recommended, false);
  assert.equal(part(sizeSystem(climate("vevey"), "S"), "condensate").recommended, false);
});

test("user choices change the price; core parts cannot be removed", () => {
  const base = sizeSystem(climate("dubai"), "S");
  const withWind = sizeSystem(climate("dubai"), "S", {}, { wind: true });
  assert.equal(withWind.totals.totalAed > base.totals.totalAed, true);
  assert.equal(part(withWind, "wind").overridden, true);
  const noSolar = sizeSystem(climate("dubai"), "S", {}, { solar: false });
  assert.equal(part(noSolar, "solar").included, true);
});

test("array is limited by the roof and grows with the tier", () => {
  const s = sizeSystem(climate("dubai"), "S");
  const l = sizeSystem(climate("dubai"), "L");
  assert.ok(part(s, "solar").metrics.modules <= part(s, "solar").metrics.maxModules);
  assert.ok(part(l, "solar").metrics.pvKwp > part(s, "solar").metrics.pvKwp * 10);
  for (const id of Object.keys(TIERS)) {
    const r = sizeSystem(climate("dubai"), id);
    assert.ok(r.totals.totalAed > 0 && Number.isFinite(r.totals.paybackYears));
  }
});

test("every component explains itself with a why and pass/fail rules", () => {
  const r = sizeSystem(climate("mumbai"), "M");
  for (const p of r.components) {
    assert.ok(p.why.length > 20, p.id);
    assert.ok(p.rules.length >= 1, p.id);
    for (const rule of p.rules) assert.equal(typeof rule.pass, "boolean");
  }
});

test("garbage input falls back to safe defaults", () => {
  const r = sizeSystem({ solarDailyKwhM2: "x", windMs: -3 }, "Z", { roofM2: -10 });
  assert.equal(r.tier.id, "S");
  assert.ok(r.totals.totalAed > 0);
});

test("rule advice has the same shape as the AI advisor", () => {
  const advice = ruleAdvice(sizeSystem(climate("dubai"), "S"), "Dubai");
  assert.equal(advice.source, "rules");
  assert.ok(advice.headline && advice.summary);
  assert.ok(advice.reasons.length && advice.upgrades.length && advice.questions.length);
});

test("Essential is much cheaper than Recommended, Max costs the most", () => {
  for (const tier of ["S", "M", "L"]) {
    const [e, r, m] = ["essential", "recommended", "max"].map((p) => sizeSystem(climate("dubai"), tier, {}, {}, p).totals.totalAed);
    assert.ok(e < r * 0.65, `${tier}: essential ${e} vs recommended ${r}`);
    assert.ok(m > r, `${tier}: max ${m} vs recommended ${r}`);
  }
});

test("Essential drops optional modules and cleaning hardware but keeps core parts", () => {
  const e = sizeSystem(climate("dubai"), "S", {}, {}, "essential");
  assert.equal(part(e, "condensate").included, false);
  assert.equal(part(e, "cleaning").costAed, 0);
  assert.match(part(e, "water").spec, /sediment filter → pump/);
  for (const id of ["solar", "inverter", "water", "controller"]) assert.equal(part(e, id).included, true);
  // user can still add an optional module back
  assert.equal(part(sizeSystem(climate("dubai"), "S", {}, { condensate: true }, "essential"), "condensate").included, true);
});

test("monthly estimate is a positive amortised payment", () => {
  const r = sizeSystem(climate("dubai"), "S");
  assert.ok(r.totals.monthlyAed > r.totals.totalAed / 120 && r.totals.monthlyAed < r.totals.totalAed / 60);
});

test("rule advice offers the cheaper package when not already on it", () => {
  const advice = ruleAdvice(sizeSystem(climate("dubai"), "S"), "Dubai");
  assert.match(advice.upgrades[0].title, /Essential/);
});

import { monthlyBill, marginalRate } from "./economics.js";
import { UTILITIES, regionById } from "./regions.js";

test("DEWA bill uses slabs, the 6 fil fuel surcharge and 5% VAT", () => {
  // 2,500 kWh: 2,000 × 0.23 + 500 × 0.28 = 600; surcharge 150; × 1.05
  assert.ok(Math.abs(monthlyBill(2500, UTILITIES.dewa) - 787.5) < 1e-6);
  // the top slab's marginal price is (0.38 + 0.06) × 1.05 = 0.462
  assert.ok(Math.abs(marginalRate(7000, UTILITIES.dewa) - 0.462) < 1e-9);
});

test("Abu Dhabi bands are daily and depend on the customer", () => {
  const expat = monthlyBill(3000, UTILITIES.taqa, { customer: "expat", days: 30 });
  const national = monthlyBill(3000, UTILITIES.taqa, { customer: "national", days: 30 });
  assert.ok(Math.abs(expat - 3000 * 0.268 * 1.05) < 1e-6);
  assert.ok(national < expat / 3);
});

test("under net metering a battery adds backup, not bill savings", () => {
  const r = regionById.dubai;
  const without = sizeSystem(r.climate, "S", {}, { battery: false }, "recommended", { utilityId: r.utility });
  const withB = sizeSystem(r.climate, "S", {}, { battery: true }, "recommended", { utilityId: r.utility });
  assert.ok(Math.abs(withB.totals.electricitySavingsAed - without.totals.electricitySavingsAed) < 1);
  assert.ok(withB.totals.totalAed > without.totals.totalAed);
  assert.ok(withB.totals.backupHours > 0 && without.totals.backupHours === 0);
  assert.equal(part(without, "battery").recommended, false);
  assert.equal(part(sizeSystem(r.climate, "S", {}, {}, "recommended", { utilityId: r.utility, backup: true }), "battery").included, true);
});

test("without verified export credit a battery raises savings", () => {
  const r = regionById.sharjah;
  const without = sizeSystem(r.climate, "S", {}, { battery: false }, "recommended", { utilityId: r.utility });
  const withB = sizeSystem(r.climate, "S", {}, { battery: true }, "recommended", { utilityId: r.utility });
  assert.ok(withB.totals.electricitySavingsAed > without.totals.electricitySavingsAed);
  assert.equal(part(without, "inverter").name, "Grid-tie inverter");
  assert.equal(part(withB, "inverter").name, "Hybrid inverter");
});

test("installed solar price sits in the market range for a 10 kW villa", () => {
  const r = regionById.dubai;
  const res = sizeSystem(r.climate, "S", {}, { battery: false }, "recommended", { utilityId: r.utility });
  const kwp = part(res, "solar").metrics.pvKwp;
  // modules + canopy, grid connection/protection and inverter, installed
  const solarInstalled = (part(res, "solar").costAed + part(res, "grid").costAed + part(res, "inverter").costAed) * 1.15;
  const per10 = (solarInstalled / kwp) * 10;
  assert.ok(per10 >= 38000 && per10 <= 60000, String(per10));
});
