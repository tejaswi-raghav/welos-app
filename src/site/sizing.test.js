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
