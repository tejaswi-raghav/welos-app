import test from "node:test";
import assert from "node:assert/strict";
import { NODES, EDGES, nodeById, traceFrom } from "./topology.js";
import { ROUTES, LAYERS, MOVES } from "./model.js";
import { partById } from "../model/parts.js";
import { simulateDay } from "./sim.js";

const EXTRA_KEYS = new Set(["canopy", "wind-mast", "power-cabinet", "pipe-0", "pipe-1", "pipe-2", "pipe-3", "pipe-4", "filter-header", "filter-stage-1", "filter-stage-2", "filter-stage-3", "filter-cap-1", "filter-cap-2", "filter-cap-3", "pv-cable", "wind-cable", "enclosure-door", "backplate", "base-slab", "base-plate", "foot", "post", "assembly"]);
const known = (k) => !!partById[k] || EXTRA_KEYS.has(k);

test("every topology node maps to real model parts", () => {
  for (const n of NODES) for (const p of n.parts) assert.ok(known(p), `${n.id} → ${p}`);
});

test("every edge joins two nodes and every route exists in the 3D model", () => {
  for (const e of EDGES) {
    assert.ok(nodeById[e.from] && nodeById[e.to], e.id);
    if (e.route) assert.ok(ROUTES[e.route], `${e.id} route ${e.route}`);
  }
  for (const r of Object.values(ROUTES)) for (const [k] of r.pts) if (k) assert.ok(known(k), k);
});

test("layers and explode moves reference tagged parts only", () => {
  for (const L of LAYERS) for (const k of L.keys) assert.ok(known(k), `${L.id} → ${k}`);
  for (const [k] of MOVES) assert.ok(known(k), k);
});

test("tracing the battery reaches sources upstream and loads downstream", () => {
  const t = traceFrom("bus");
  assert.ok(t.up.has("pv") && t.up.has("wind"));
  assert.ok(t.down.has("house") && t.down.has("battery"));
});

test("edge activity agrees with the controller outputs", () => {
  for (const f of simulateDay("stress").frames) {
    const rinse = EDGES.find((e) => e.id === "e-pump-rinse");
    assert.equal(rinse.on(f), f.result.outputs.cleaningPump);
    const store = EDGES.find((e) => e.id === "e-flush-tank");
    assert.equal(store.on(f), f.result.outputs.storageValve);
  }
});
