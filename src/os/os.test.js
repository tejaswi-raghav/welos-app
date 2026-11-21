import test from "node:test";
import assert from "node:assert/strict";
import { CONDITIONS, runCondition } from "./scenarios.js";
import { simulateDay, irradianceAt, loadAt } from "./day.js";
import { referenceBuild } from "./reference.js";
import { sizeSystem } from "../site/sizing.js";
import { PRESETS } from "../site/presets.js";

test("hero conditions produce the intended control modes", () => {
  const mode = Object.fromEntries(CONDITIONS.map((c) => [c.id, runCondition(c.id).result.mode]));
  assert.equal(mode.noon, "NORMAL");
  assert.equal(mode.evening, "NORMAL");
  assert.equal(mode.dust, "CLEANING");
  assert.equal(mode.storm, "STORM");
  assert.equal(mode.outage, "CONSERVE");
});

test("hero routing obeys the engine's priorities", () => {
  const noon = runCondition("noon").result.power;
  assert.ok(noon.batteryChargeKw > 0, "noon surplus charges the battery");
  assert.equal(noon.gridImportKw, 0);
  const evening = runCondition("evening").result.power;
  assert.ok(evening.batteryDischargeKw > 0, "evening deficit drawn from battery");
  const storm = runCondition("storm").result;
  assert.equal(storm.outputs.windBrake, true, "turbine brakes above cut-out");
  assert.ok(storm.water.storageActive, "rain goes to storage after first flush");
  const outage = runCondition("outage").result;
  assert.equal(outage.power.gridImportKw, 0);
  assert.equal(outage.power.reserveSoc, 35);
});

test("irradiance integrates to the climate's daily solar resource", () => {
  let wh = 0;
  for (let m = 0; m < 1440; m++) wh += irradianceAt(m / 60, 5.6) / 60;
  assert.ok(Math.abs(wh / 1000 - 5.6) < 0.02);
  let kwh = 0;
  for (let m = 0; m < 1440; m++) kwh += loadAt(m / 60, 45) / 60;
  assert.ok(Math.abs(kwh - 45) < 0.3);
});

test("day simulation conserves energy at every step", () => {
  const day = simulateDay(referenceBuild());
  for (const s of day.steps) {
    const supply = s.direct + s.fromBattery + s.fromGrid;
    assert.ok(Math.abs(supply - s.load) < 0.02, `served load matches demand at ${s.h}`);
    const gen = s.pv + s.wind;
    assert.ok(Math.abs(gen - (s.direct + s.toBattery + s.toGrid + s.curtailed)) < 0.02, `generation is accounted for at ${s.h}`);
    assert.ok(s.soc >= 0 && s.soc <= 100);
  }
  assert.ok(day.totals.selfSufficiencyPct > 0 && day.totals.selfSufficiencyPct <= 100);
  assert.ok(day.insight.length >= 3);
});

test("day simulation runs for every preset and scale", () => {
  for (const p of PRESETS) for (const tier of ["S", "M", "L"]) {
    const day = simulateDay(sizeSystem(p.climate, tier));
    assert.equal(day.steps.length, 144);
    assert.ok(Number.isFinite(day.totals.gridKwh));
  }
});
