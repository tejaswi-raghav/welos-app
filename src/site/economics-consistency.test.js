// Price, savings and package consistency across every package, building type, utility,
// customer type and battery choice. These check the arithmetic the product page displays.
import test from "node:test";
import assert from "node:assert/strict";
import { sizeSystem, explainSavings, PACKAGES, RATES, packageKey, ruleAnswer } from "./sizing.js";
import { getAddOns } from "./addons.js";
import { recommend, INTEGRATED } from "./recommend.js";
import { regionById, REGIONS, UTILITIES } from "./regions.js";

const part = (r, id) => r.components.find((p) => p.id === id);
const roundTo10 = (x) => Math.round(x / 10) * 10;
const WATER_PARTS = ["water", "condensate"];

function* everyBuild() {
  for (const pkg of Object.keys(PACKAGES)) for (const tier of ["S", "M", "L"]) for (const region of REGIONS)
    for (const customer of ["expat", "national"]) for (const battery of [false, true]) {
      if (customer === "national" && UTILITIES[region.utility].basis !== "daily") continue;
      yield { pkg, tier, region, customer, battery,
        r: sizeSystem(region.climate, tier, {}, { battery }, pkg, { utilityId: region.utility, customer }) };
    }
}

test("installed price equals the itemised breakdown for every package, building and utility", () => {
  let n = 0;
  for (const { r } of everyBuild()) {
    const t = r.totals;
    const hardware = r.components.filter((c) => c.included).reduce((a, c) => a + c.costAed, 0);
    assert.equal(t.hardwareAed, hardware);
    assert.equal(t.installAed, roundTo10(hardware * RATES.installRate[r.tier.id]));
    assert.equal(t.totalAed, t.hardwareAed + t.installAed);
    n++;
  }
  assert.ok(n > 150, `checked ${n} builds`);
});

test("savings, payback, 25-year net and finance add up exactly from the displayed parts", () => {
  for (const { r } of everyBuild()) {
    const t = r.totals;
    for (const k of ["billBeforeAed", "billAfterAed", "electricitySavingsAed", "waterSavingsAed", "annualSavingsAed", "lifetimeElectricityAed", "lifetimeWaterAed", "monthlyAed", "monthlySavingsAed"])
      assert.ok(Number.isInteger(t[k]), `${k} is whole dirhams`);
    assert.equal(t.electricitySavingsAed, t.billBeforeAed - t.billAfterAed);
    assert.equal(t.annualSavingsAed, t.electricitySavingsAed + t.waterSavingsAed);
    if (t.annualSavingsAed > 0) assert.equal(t.paybackYears, t.totalAed / t.annualSavingsAed);
    if (t.electricitySavingsAed > 0) assert.equal(t.electricityPaybackYears, t.totalAed / t.electricitySavingsAed);
    assert.equal(t.lifetimeWaterAed, t.waterSavingsAed * RATES.lifeYears);
    assert.equal(t.lifetimeSavingsAed, t.lifetimeElectricityAed + t.lifetimeWaterAed);
    assert.equal(t.lifetimeNetAed, t.lifetimeSavingsAed - t.totalAed);
    assert.equal(t.financeTotalAed, t.monthlyAed * RATES.financeYears * 12);
    assert.equal(t.monthlySavingsAed, Math.round(t.annualSavingsAed / 12));
  }
});

test("Dubai villa Essential: verified example, derived from the engine", () => {
  const d = regionById.dubai;
  const r = sizeSystem(d.climate, "S", {}, { battery: false }, "essential", { utilityId: "dewa" });
  const t = r.totals;
  assert.equal(t.totalAed, 31840);
  assert.equal(t.hardwareAed + t.installAed, 31840);
  assert.equal(t.billBeforeAed, 5010);
  assert.equal(t.billAfterAed, 1839);
  assert.equal(t.electricitySavingsAed, 3171);
  // 3,629 L/yr of rain, all used in place of metered water, at AED 0.00924/L
  assert.equal(Math.round(t.waterUsedLYear), 3629);
  assert.equal(t.waterSavingsAed, Math.round(t.waterUsedLYear * 0.00924));
  assert.equal(t.waterSavingsAed, 34);
  assert.equal(t.annualSavingsAed, 3205);
  assert.equal(t.paybackYears.toFixed(1), "9.9");
  const ex = explainSavings(r);
  assert.match(ex.annual.text, /AED 3,171 electricity \+ AED 34 water = AED 3,205\/yr/);
  assert.match(ex.payback.text, /AED 31,840 ÷ AED 3,205\/yr = 9\.9 years/);
});

test("water counts only when it replaces paid utility water, and only up to the building's use", () => {
  const d = regionById.dubai;
  const ctx = { utilityId: "dewa" };
  const counted = sizeSystem(d.climate, "S", {}, { battery: false }, "complete", ctx);
  const notCounted = sizeSystem(d.climate, "S", {}, { battery: false }, "complete", { ...ctx, waterSavings: false });
  assert.ok(counted.totals.waterSavingsAed > 0);
  assert.equal(notCounted.totals.waterSavingsAed, 0);
  assert.equal(notCounted.totals.waterLYear, counted.totals.waterLYear); // litres still shown
  assert.equal(notCounted.totals.annualSavingsAed, notCounted.totals.electricitySavingsAed);
  assert.equal(notCounted.totals.totalAed, counted.totals.totalAed);
  // capped at the stated demand: 10 L/day uses at most 3,650 L/yr
  const small = sizeSystem(d.climate, "S", { waterLDay: 10 }, { battery: false }, "complete", ctx);
  assert.equal(small.totals.waterUsedLYear, 3650);
  assert.equal(small.totals.waterSavingsAed, Math.round(3650 * RATES.waterPerL));
});

test("Solar-first removes every water part and every water saving", () => {
  for (const region of REGIONS) for (const tier of ["S", "M", "L"]) {
    const ctx = { utilityId: region.utility };
    // even if a saved build asks for water add-ons, Solar-first cannot include them
    const sf = sizeSystem(region.climate, tier, {}, { battery: false, condensate: true, treatment: true }, "solar-first", ctx);
    for (const id of WATER_PARTS) {
      assert.equal(part(sf, id).included, false, `${id} excluded`);
      assert.equal(part(sf, id).available, false);
    }
    assert.equal(sf.hasWater, false);
    assert.equal(sf.totals.waterLYear, 0);
    assert.equal(sf.totals.waterSavingsAed, 0);
    assert.equal(sf.totals.lifetimeWaterAed, 0);
    assert.equal(sf.totals.annualSavingsAed, sf.totals.electricitySavingsAed);
    assert.ok(!/rinse/i.test(part(sf, "cleaning").name), "no water-fed rinse rail without a tank");
    // same solar as Complete; the price difference is exactly the water hardware plus its installation
    const full = sizeSystem(region.climate, tier, {}, { battery: false, condensate: true }, "complete", ctx);
    assert.equal(part(sf, "solar").metrics.pvKwp, part(full, "solar").metrics.pvKwp);
    assert.equal(sf.totals.energyKwhYear, full.totals.energyKwhYear);
    const waterHw = part(full, "water").costAed + part(full, "condensate").costAed;
    assert.equal(full.totals.hardwareAed - sf.totals.hardwareAed, waterHw);
    assert.ok(part(full, "water").costAed > (RATES.treatment[tier] + part(full, "water").metrics.tankL * RATES.tankPerL), "gutter is part of the water system");
  }
});

test("grid protection, inverter and controller stay in every package and cannot be switched off", () => {
  for (const pkg of Object.keys(PACKAGES)) for (const battery of [false, true]) {
    const r = sizeSystem(regionById.dubai.climate, "S", {}, { battery, grid: false, inverter: false, controller: false, solar: false }, pkg, { utilityId: "dewa" });
    for (const id of ["solar", "grid", "inverter", "controller"]) assert.equal(part(r, id).included, true, `${pkg}: ${id}`);
    assert.equal(part(r, "grid").required, true);
    assert.match(part(r, "grid").spec, /isolators.*protection.*meter/);
    assert.match(part(r, "inverter").spec, /anti-islanding/);
  }
  const sf = sizeSystem(regionById.dubai.climate, "S", {}, {}, "solar-first", { utilityId: "dewa" });
  assert.match(part(sf, "controller").spec, /Water functions are inactive/);
  assert.match(part(sf, "controller").why, /not available/);
});

test("Essential keeps its meaning; the old 'recommended' id loads Complete", () => {
  const d = regionById.dubai, ctx = { utilityId: "dewa" };
  const e = sizeSystem(d.climate, "S", {}, {}, "essential", ctx);
  assert.equal(e.package.coverage, 0.6);
  assert.equal(e.hasWater, true);
  assert.equal(part(e, "water").metrics.fullTreatment, false);
  assert.equal(packageKey("recommended"), "complete");
  const old = sizeSystem(d.climate, "S", {}, {}, "recommended", ctx);
  const now = sizeSystem(d.climate, "S", {}, {}, "complete", ctx);
  assert.deepEqual(old.totals, now.totals);
  assert.equal(old.package.name, "Complete");
});

test("suggestion is the integrated package with the highest 25-year net, and says so", () => {
  for (const region of ["dubai", "abu-dhabi", "sharjah", "rak"]) for (const b of ["villa", "residential", "commercial"]) {
    const rec = recommend(region, b);
    const best = Math.max(...INTEGRATED.map((id) => rec.options[id].totals.lifetimeNetAed));
    assert.equal(rec.result.totals.lifetimeNetAed, best);
    assert.ok(INTEGRATED.includes(rec.packageId));
    assert.match(rec.reasons[0], /highest modelled 25-year net savings/);
    assert.match(rec.reasons[1], /Solar-first/);
    // the suggested build is exactly what the configurator computes for the same choices
    const again = sizeSystem(rec.region.climate, rec.building.tier, {}, { battery: rec.battery }, rec.packageId, { utilityId: rec.region.utility, customer: "expat", backup: false, waterSavings: true });
    assert.deepEqual(again.totals, rec.result.totals);
  }
});

test("variation and location views use the same inputs as the selected build", () => {
  // the product page builds each table cell with sizeSystem and the selected build's choices,
  // package and context, so the current building's cell must equal the selected build
  const d = regionById.dubai, ctx = { utilityId: "dewa", customer: "expat", backup: false, waterSavings: true };
  const choices = { battery: false, cleaning: false, condensate: true };
  const inputs = { loadKwhDay: 60, waterLDay: 250 };
  const selected = sizeSystem(d.climate, "S", inputs, choices, "essential", ctx);
  const cell = sizeSystem(d.climate, "S", inputs, { ...choices, battery: false }, "essential", ctx);
  assert.deepEqual(cell.totals, selected.totals);
  // and the downloaded summary uses the same explanation object as the page
  const ex = explainSavings(selected);
  assert.equal(ex.price, selected.totals.totalAed);
  assert.equal(ex.annual.total, selected.totals.annualSavingsAed);
  assert.equal(ex.electricity.saving + ex.water.saving, ex.annual.total);
});

test("add-on deltas: water add-ons are unavailable in Solar-first, available elsewhere", () => {
  const d = regionById.dubai;
  const sf = getAddOns(sizeSystem(d.climate, "S", {}, { battery: false }, "solar-first", { utilityId: "dewa" }));
  for (const id of ["condensate", "treatment"]) {
    const a = sf.find((x) => x.id === id);
    assert.equal(a.available, false);
    assert.equal(a.installedAed, 0);
    assert.match(a.unavailableWhy, /Solar-first/);
  }
  const ess = getAddOns(sizeSystem(d.climate, "S", {}, { battery: false }, "essential", { utilityId: "dewa" }));
  assert.ok(ess.find((x) => x.id === "condensate").available);
});

test("battery on and off across utilities: inverter, backup and export-credit behaviour", () => {
  for (const id of ["dubai", "abu-dhabi", "sharjah", "ajman"]) {
    const reg = regionById[id], ctx = { utilityId: reg.utility, customer: "expat" };
    const off = sizeSystem(reg.climate, "S", {}, { battery: false }, "complete", ctx);
    const on = sizeSystem(reg.climate, "S", {}, { battery: true }, "complete", ctx);
    assert.equal(part(off, "inverter").name, "Grid-tie inverter");
    assert.equal(part(on, "inverter").name, "Hybrid inverter");
    assert.equal(off.totals.backupHours, 0);
    assert.ok(on.totals.backupHours > 0);
    assert.ok(on.totals.totalAed > off.totals.totalAed);
    const gain = on.totals.electricitySavingsAed - off.totals.electricitySavingsAed;
    if (UTILITIES[reg.utility].netMetering === "yes") assert.ok(gain <= 5, `${id}: net metering, battery adds ~nothing (${gain})`);
    else assert.ok(gain > 100, `${id}: unverified export credit, battery raises self-use (${gain})`);
  }
  // TAQA national accounts pay far less, so the same build saves far less
  const ad = regionById["abu-dhabi"];
  const ex = sizeSystem(ad.climate, "S", {}, { battery: false }, "complete", { utilityId: "taqa", customer: "expat" });
  const na = sizeSystem(ad.climate, "S", {}, { battery: false }, "complete", { utilityId: "taqa", customer: "national" });
  assert.ok(na.totals.electricitySavingsAed < ex.totals.electricitySavingsAed / 2);
});

test("advisor payback answer separates electricity and water and states it is an estimate", () => {
  const r = sizeSystem(regionById.dubai.climate, "S", {}, { battery: false }, "essential", { utilityId: "dewa" });
  const a = ruleAnswer(r, "payback");
  assert.match(a, /estimate/);
  assert.match(a, /AED 3,171 electricity \+ AED 34 water = AED 3,205\/yr/);
  const sf = sizeSystem(regionById.dubai.climate, "S", {}, { battery: false }, "solar-first", { utilityId: "dewa" });
  assert.match(ruleAnswer(sf, "water"), /Not in Solar-first/);
  assert.match(ruleAnswer(sf, "payback"), /electricity only/);
});
