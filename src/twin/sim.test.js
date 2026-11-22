import test from "node:test";
import assert from "node:assert/strict";
import { simulateDay, SCENARIO_ORDER, STEPS, explainFrame, sunPosition, CLEAN_CYCLE } from "./sim.js";
import { DEFAULT_CONFIG, MODES } from "../control/engine.js";

test("every scenario is deterministic and complete", () => {
  for (const id of SCENARIO_ORDER) {
    const a = simulateDay(id), b = simulateDay(id);
    assert.equal(a.frames.length, STEPS + 1);
    assert.deepEqual(a.frames.map((f) => [f.mode, f.soc, f.tank]), b.frames.map((f) => [f.mode, f.soc, f.tank]));
  }
});

test("sun is up at noon and down at midnight in Dubai", () => {
  assert.ok(sunPosition(12.5).elevationDeg > 50);
  assert.ok(sunPosition(0).elevationDeg < 0);
});

test("dust day: cleaning is proposed at midday but only runs when the engine permits it", () => {
  const day = simulateDay("dust");
  const blocked = day.frames.find((f) => f.sensors.soilingIndex >= DEFAULT_CONFIG.cleaningAutoThreshold && !f.result.cleaning.eligible);
  assert.ok(blocked, "a blocked proposal exists");
  assert.ok(blocked.result.cleaning.blockers.includes("Irradiance too high"));
  const ran = day.frames.filter((f) => f.cleaningRan);
  assert.ok(ran.length >= 1);
  for (const f of ran) {
    assert.ok(f.sensors.solarIrradianceWm2 <= DEFAULT_CONFIG.cleaningMaxIrradianceWm2);
    assert.ok(f.sensors.windSpeedMs < DEFAULT_CONFIG.cleaningMaxWindMs);
    assert.ok(f.sensors.tankLevelPct >= DEFAULT_CONFIG.tankCleaningReservePct);
    const next = day.frames[f.i + 1];
    assert.ok(next.soiling < f.soiling, "soiling falls after a cycle");
    assert.ok(Math.abs((f.tank - next.tank) - (CLEAN_CYCLE.litres / 420) * 100) < 0.2, "cycle water comes out of the tank");
  }
});

test("rain day diverts first flush before storing", () => {
  const day = simulateDay("rain");
  const firstRain = day.frames.find((f) => f.sensors.rainfallMmHr >= DEFAULT_CONFIG.rainCaptureStartMmHr);
  assert.equal(firstRain.result.water.firstFlushActive, true);
  assert.ok(day.frames.some((f) => f.result.water.storageActive));
  assert.ok(day.totals.endTank > day.inputs.startTank);
});

test("grid outage never discharges below the storm reserve", () => {
  const day = simulateDay("outage");
  for (const f of day.frames.filter((f) => !f.sensors.gridAvailable)) {
    if (f.result.power.batteryDischargeKw > 0) assert.ok(f.sensors.batterySoc > DEFAULT_CONFIG.batteryStormReserveSoc);
  }
  assert.ok(day.totals.shedKwh > 0);
});

test("decision trace matches the engine outputs", () => {
  const day = simulateDay("stress");
  for (const f of day.frames) {
    const ex = explainFrame(f);
    const clean = ex.actions.find((a) => a.id === "clean");
    assert.equal(clean.state === "active", f.result.outputs.cleaningPump);
    const store = ex.actions.find((a) => a.id === "store");
    assert.equal(store.state === "active", f.result.outputs.storageValve);
    if (f.mode === MODES.STORM) assert.equal(ex.checks.find((c) => c.id === "storm").pass, false);
  }
});
