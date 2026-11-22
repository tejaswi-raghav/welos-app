import test from "node:test";
import assert from "node:assert/strict";
import { sizeSystem, ruleAnswer } from "./sizing.js";
import { getAddOns } from "./addons.js";
import { regionById } from "./regions.js";

const climate = regionById.dubai.climate;
const run = (choices = {}, pkg = "recommended", inputs = {}) => sizeSystem(climate, "S", inputs, { battery: false, ...choices }, pkg, { utilityId: "dewa" });
const part = (r, id) => r.components.find((p) => p.id === id);

test("current Dubai quote reproduces the verified costs and water demand share", () => {
  const r = run();
  // AED 58,880: the canopy, gutter and grid-protection costs are now separate lines, each rounded to AED 10
  // (was 58,890 as one line). Same rates, same hardware.
  assert.equal(r.totals.totalAed, 58880);
  assert.equal(run({}, "essential").totals.totalAed, 31840);
  assert.equal(part(r, "battery").included, false);
  assert.equal(part(r, "wind").included, false);
  const condensate = getAddOns(r).find((a) => a.id === "condensate");
  assert.equal(condensate.hardwareAed, 1800);
  assert.equal(Math.round(condensate.waterLYear), 15434);
  assert.ok(Math.abs(condensate.waterDemandPct - 10.57125) < 0.001);
});

test("manual cleaning removes robot cost and reduces output while preserving the core", () => {
  const auto = run(), manual = run({ cleaning: false });
  assert.equal(part(manual, "cleaning").costAed, 0);
  assert.equal(part(manual, "cleaning").metrics.autoClean, false);
  assert.equal(auto.totals.hardwareAed - manual.totals.hardwareAed, 4500);
  assert.ok(manual.totals.energyKwhYear < auto.totals.energyKwhYear);
  assert.equal(part(manual, "solar").metrics.pvKwp, part(auto, "solar").metrics.pvKwp);
  assert.match(part(manual, "cleaning").why, /manual clean/);
  for (const id of ["solar", "cleaning", "water", "inverter", "controller"]) assert.equal(part(manual, id).included, true);
});

test("lighter treatment keeps collection, storage and pumping without altering energy output", () => {
  const full = run(), light = run({ treatment: false });
  assert.equal(full.totals.hardwareAed - light.totals.hardwareAed, 2300);
  assert.equal(part(light, "water").metrics.fullTreatment, false);
  assert.equal(part(light, "water").metrics.tankL, part(full, "water").metrics.tankL);
  assert.match(part(light, "water").spec, /First flush → sediment filter → pump/);
  assert.match(part(light, "water").spec, /not drinking water/);
  assert.equal(full.totals.energyKwhYear, light.totals.energyKwhYear);
});

test("extras can be added to Essential independently and survive serialized requests", () => {
  const upgraded = run({ cleaning: true, treatment: true, condensate: true }, "essential");
  assert.equal(part(upgraded, "cleaning").metrics.autoClean, true);
  assert.equal(part(upgraded, "water").metrics.fullTreatment, true);
  assert.equal(part(upgraded, "condensate").included, true);
  const r = JSON.parse(JSON.stringify(upgraded.request));
  assert.deepEqual(sizeSystem(r.climate, r.tierId, r.inputs, r.choices, r.packageId, r.context), upgraded);
});

test("removing condensate and automatic cleaning saves AED 6,300 before installation", () => {
  const full = run(), lean = run({ cleaning: false, condensate: false });
  assert.equal(full.totals.hardwareAed - lean.totals.hardwareAed, 6300);
  assert.equal(lean.totals.totalAed, 51640);
  assert.ok(lean.totals.waterLYear < full.totals.waterLYear);
});

test("add-on deltas match complete alternate builds including installation and linked inverter", () => {
  for (const pkg of ["essential", "recommended", "max"]) {
    const base = run({}, pkg);
    for (const a of getAddOns(base)) {
      const other = run({ [a.id]: !a.on }, pkg);
      assert.equal(a.installedAed, a.on ? base.totals.totalAed - other.totals.totalAed : other.totals.totalAed - base.totals.totalAed, `${pkg}:${a.id}`);
      assert.ok(Number.isFinite(a.hardwareAed));
    }
  }
  const r = run();
  const battery = getAddOns(r).find((a) => a.id === "battery");
  assert.ok(battery.hardwareAed > part(r, "battery").costAed, "battery option includes the hybrid inverter upgrade");
});

test("zero water demand does not generate an infinite coverage percentage", () => {
  const r = run({}, "recommended", { waterLDay: 0 });
  assert.equal(getAddOns(r).find((a) => a.id === "condensate").waterDemandPct, 0);
});

test("cheaper-package advice respects explicit extras rather than claiming they were removed", () => {
  const advice = ruleAnswer(run({ cleaning: true, treatment: true }), "cheaper");
  assert.match(advice, /Automatic cleaning stays selected/);
  assert.match(advice, /Advanced treatment stays selected/);
});
