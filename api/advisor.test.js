import test from "node:test";
import assert from "node:assert/strict";
import handler from "./advisor.js";
import { sizeSystem } from "../src/site/sizing.js";
import { regionById } from "../src/site/regions.js";

test("advisor keeps the selected add-ons, battery and utility context", async () => {
  delete process.env.GROQ_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  const body = { place: "Abu Dhabi", tier: "S", package: "recommended", climate: regionById['abu-dhabi'].climate,
    choices: { battery: false, wind: false, condensate: false, cleaning: false, treatment: false },
    context: { utilityId: "taqa", customer: "national", backup: false }, preset: "payback" };
  const expected = sizeSystem(body.climate, body.tier, {}, body.choices, body.package, body.context);
  let payload, status;
  const res = { status(code) { status = code; return this; }, json(data) { payload = data; return this; } };
  await handler({ method: "POST", body, headers: {} }, res);
  assert.equal(status, 200);
  assert.equal(payload.source, "rules");
  assert.ok(payload.answer.includes(expected.totals.totalAed.toLocaleString("en-US")));
  assert.ok(payload.answer.includes(expected.utility.name));
});
