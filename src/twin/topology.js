// System topology shared by the Explorer (trace connections) and the Control OS (network view).
// Every node maps to tagged parts in the 3D model and every edge to a route the stage can draw,
// so the schematic and the physical rooftop always describe the same machine.
import { modeLabel } from "./sim.js";

const f2 = (x) => Number(x).toFixed(2);
const f1 = (x) => Number(x).toFixed(1);

export const NODES = [
  // power
  { id: "pv", label: "Solar array", code: "S01", kind: "source", domain: "power", x: 110, y: 110, parts: ["pv-array", "pv-racking"],
    value: (f) => `${f2(f.result.power.pvKw)} kW`, sub: (f) => `${f.sensors.solarIrradianceWm2} W/m² · soiling ${(f.soiling * 100).toFixed(1)}%`, on: (f) => f.result.power.pvKw > 0.03 },
  { id: "wind", label: "Wind turbine", code: "W01", kind: "source", domain: "power", x: 110, y: 290, parts: ["vawt-rotor", "wind-generator", "wind-brake", "wind-mast"],
    value: (f) => `${f2(f.result.power.windKw)} kW`, sub: (f) => `${f1(f.sensors.windSpeedMs)} m/s · brake ${f.result.outputs.windBrake ? "on" : "off"}`, on: (f) => f.result.power.windKw > 0.03, warn: (f) => f.result.outputs.windBrake && f.sensors.windSpeedMs >= 15 },
  { id: "mppt", label: "MPPT charger", code: "E01", kind: "conv", domain: "power", x: 320, y: 110, parts: ["mppt"], value: (f) => `${f2(f.result.power.pvKw)} kW`, on: (f) => f.result.power.pvKw > 0.03 },
  { id: "rect", label: "Rectifier + dump load", code: "E02", kind: "conv", domain: "power", x: 320, y: 290, parts: ["wind-rectifier"], value: (f) => `${f2(f.result.power.windKw)} kW`, on: (f) => f.result.power.windKw > 0.03 },
  { id: "bus", label: "48 V DC bus", code: "E04", kind: "bus", domain: "power", x: 530, y: 200, parts: ["dc-bus"], value: (f) => `${f2(f.result.power.renewableKw)} kW in`, sub: (f) => `${f2(f.result.power.demandKw)} kW demand`, on: () => true },
  { id: "battery", label: "LiFePO4 battery", code: "E03", kind: "store", domain: "power", x: 530, y: 370, parts: ["lifepo4-battery"],
    value: (f) => `${f.soc.toFixed(0)}%`, sub: (f) => (f.result.power.batteryChargeKw > 0 ? `charging ${f2(f.result.power.batteryChargeKw)} kW` : f.result.power.batteryDischargeKw > 0 ? `supplying ${f2(f.result.power.batteryDischargeKw)} kW` : `holding · floor ${f.result.power.reserveSoc}%`),
    on: (f) => f.result.power.batteryChargeKw + f.result.power.batteryDischargeKw > 0.02, warn: (f) => f.soc <= f.result.power.reserveSoc + 1 },
  { id: "inverter", label: "Hybrid inverter", code: "E05", kind: "conv", domain: "power", x: 740, y: 200, parts: ["hybrid-inverter", "load-panel"], value: (f) => `${f2(f.result.power.servedLoadKw)} kW`, on: (f) => f.result.power.servedLoadKw > 0.02 },
  { id: "house", label: "Building loads", code: "LOAD", kind: "load", domain: "power", x: 950, y: 120, parts: ["load-panel"],
    value: (f) => `${f2(f.result.power.demandKw)} kW`, sub: (f) => (f.result.power.loadShedKw > 0 ? `${f2(f.result.power.loadShedKw)} kW shed` : "all circuits served"), on: () => true, warn: (f) => f.result.power.loadShedKw > 0 },
  { id: "grid", label: "Utility grid", code: "GRID", kind: "grid", domain: "power", x: 950, y: 290, parts: [],
    value: (f) => (!f.sensors.gridAvailable ? "Lost" : f.result.power.gridImportKw > 0 ? `${f2(f.result.power.gridImportKw)} kW in` : f.result.power.gridExportKw > 0 ? `${f2(f.result.power.gridExportKw)} kW out` : "Standby"),
    on: (f) => f.result.power.gridImportKw + f.result.power.gridExportKw > 0.02, warn: (f) => !f.sensors.gridAvailable },
  // water
  { id: "gutter", label: "Canopy + gutter", code: "S03", kind: "source", domain: "water", x: 110, y: 500, parts: ["rain-gutter", "pipe-0"], value: (f) => `${f1(f.sensors.rainfallMmHr)} mm/h`, on: (f) => f.sensors.rainfallMmHr >= 0.2 },
  { id: "flush", label: "First-flush diverter", code: "R01", kind: "conv", domain: "water", x: 300, y: 500, parts: ["first-flush", "pipe-1"],
    value: (f) => (f.result.water.firstFlushActive ? "Diverting" : f.sensors.rainfallMmHr >= 0.2 ? "Complete" : "Idle"), sub: (f) => `${f2(f.result.water.rainEventMm)} / 1.2 mm`, on: (f) => f.result.water.firstFlushActive },
  { id: "drain", label: "Drain", code: "DRN", kind: "drain", domain: "water", x: 300, y: 600, parts: [], value: (f) => (f.result.water.firstFlushActive || f.result.water.overflowActive ? "Receiving" : "—"), on: (f) => f.result.water.firstFlushActive || f.result.water.overflowActive },
  { id: "tank", label: "Storage tank", code: "R03", kind: "store", domain: "water", x: 490, y: 500, parts: ["water-tank", "water-sensors"],
    value: (f) => `${f.tank.toFixed(0)}%`, sub: (f) => `${Math.round(f.tank * 4.2)} of 420 L`, on: (f) => f.result.water.storageActive || f.result.outputs.cleaningPump, warn: (f) => f.tank >= 95 },
  { id: "filters", label: "Filters + UV-C", code: "R02", kind: "conv", domain: "water", x: 670, y: 500, parts: ["filter-train", "filter-header", "filter-stage-1", "filter-stage-2", "filter-stage-3"], value: (f) => (f.result.outputs.filtrationPump ? "Treating" : "Idle"), on: (f) => f.result.outputs.filtrationPump || f.result.outputs.cleaningPump },
  { id: "pump", label: "Variable-speed pump", code: "R04", kind: "conv", domain: "water", x: 830, y: 500, parts: ["water-pump"], value: (f) => (f.result.outputs.cleaningPump ? "Rinse duty" : f.result.outputs.filtrationPump ? "Filtration" : "Off"), on: (f) => f.result.outputs.cleaningPump || f.result.outputs.filtrationPump },
  { id: "rinse", label: "Panel rinse rail", code: "S05", kind: "load", domain: "water", x: 1010, y: 500, parts: ["cleaning-manifold"], value: (f) => (f.result.outputs.cleaningPump ? "12 L cycle" : "Closed"), on: (f) => f.result.outputs.cleaningPump },
  { id: "uses", label: "Non-potable uses", code: "OUT", kind: "load", domain: "water", x: 1010, y: 600, parts: [], value: () => "On demand", sub: () => "irrigation, flushing (not simulated)", on: () => false },
  // control
  { id: "ctrl", label: "Edge controller", code: "C03", kind: "ctrl", domain: "signal", x: 740, y: 370, parts: ["controller-pcb", "protection", "terminal-blocks", "communications", "energy-meter"], value: (f) => f.mode, sub: (f) => modeLabel(f.mode), on: () => true },
];

const P = (f) => f.result.power;
export const EDGES = [
  { id: "e-pv-mppt", from: "pv", to: "mppt", kind: "power", route: "pv", on: (f) => P(f).pvKw > 0.03, val: (f) => P(f).pvKw },
  { id: "e-mppt-bus", from: "mppt", to: "bus", kind: "power", route: "mpptBus", on: (f) => P(f).pvKw > 0.03, val: (f) => P(f).pvKw },
  { id: "e-wind-rect", from: "wind", to: "rect", kind: "power", route: "wind", on: (f) => P(f).windKw > 0.03, val: (f) => P(f).windKw },
  { id: "e-rect-bus", from: "rect", to: "bus", kind: "power", route: "rectBus", on: (f) => P(f).windKw > 0.03, val: (f) => P(f).windKw },
  { id: "e-bus-batt", from: "bus", to: "battery", kind: "power", route: "battery", on: (f) => P(f).batteryChargeKw + P(f).batteryDischargeKw > 0.02, dir: (f) => (P(f).batteryChargeKw > 0.02 ? 1 : -1), val: (f) => P(f).batteryChargeKw || P(f).batteryDischargeKw },
  { id: "e-bus-inv", from: "bus", to: "inverter", kind: "power", route: "loads", on: (f) => P(f).servedLoadKw - P(f).gridImportKw > 0.02, val: (f) => Math.max(0, P(f).servedLoadKw - P(f).gridImportKw) },
  { id: "e-inv-house", from: "inverter", to: "house", kind: "power", route: "building", on: (f) => P(f).servedLoadKw > 0.02, val: (f) => P(f).servedLoadKw },
  { id: "e-grid-inv", from: "grid", to: "inverter", kind: "power", on: (f) => P(f).gridImportKw + P(f).gridExportKw > 0.02, dir: (f) => (P(f).gridImportKw > 0.02 ? 1 : -1), val: (f) => P(f).gridImportKw || P(f).gridExportKw },
  { id: "e-bus-pump", from: "bus", to: "pump", kind: "power", route: "pump", on: (f) => f.result.outputs.cleaningPump || f.result.outputs.filtrationPump, val: () => 0.12 },
  { id: "e-gut-flush", from: "gutter", to: "flush", kind: "water", route: "catch", on: (f) => f.sensors.rainfallMmHr >= 0.2, val: (f) => f.sensors.rainfallMmHr },
  { id: "e-flush-drain", from: "flush", to: "drain", kind: "water", on: (f) => f.result.water.firstFlushActive || f.result.water.overflowActive },
  { id: "e-flush-tank", from: "flush", to: "tank", kind: "water", route: "store", on: (f) => f.result.water.storageActive, val: (f) => f.result.water.captureRateLpm },
  { id: "e-tank-filt", from: "tank", to: "filters", kind: "water", route: "treat", on: (f) => f.result.outputs.filtrationPump || f.result.outputs.cleaningPump },
  { id: "e-filt-pump", from: "filters", to: "pump", kind: "water", route: "treat", on: (f) => f.result.outputs.filtrationPump || f.result.outputs.cleaningPump },
  { id: "e-pump-rinse", from: "pump", to: "rinse", kind: "water", route: "rinse", on: (f) => f.result.outputs.cleaningPump },
  { id: "e-pump-uses", from: "pump", to: "uses", kind: "water", on: () => false },
  { id: "e-rinse-pv", from: "rinse", to: "pv", kind: "water", loop: true, on: (f) => f.result.outputs.cleaningPump },
  // control signals: what the controller reads (→ctrl) and commands (ctrl→)
  { id: "s-pv", from: "pv", to: "ctrl", kind: "signal", label: "soiling, irradiance", on: () => true },
  { id: "s-batt", from: "battery", to: "ctrl", kind: "signal", label: "SoC, temperature (BMS)", on: () => true },
  { id: "s-tank", from: "tank", to: "ctrl", kind: "signal", label: "level, turbidity, leak", on: () => true },
  { id: "c-wind", from: "ctrl", to: "rect", kind: "signal", label: "brake, contactor", on: () => true },
  { id: "c-flush", from: "ctrl", to: "flush", kind: "signal", label: "diverter, storage valve", on: () => true },
  { id: "c-pump", from: "ctrl", to: "pump", kind: "signal", label: "pump enable", on: () => true },
  { id: "c-inv", from: "ctrl", to: "inverter", kind: "signal", label: "grid contactor, load shed", on: () => true },
];

export const nodeById = Object.fromEntries(NODES.map((n) => [n.id, n]));

/** Nodes upstream and downstream of a node (resource edges only), for tracing. */
export function traceFrom(id, { signals = false } = {}) {
  const up = new Set(), down = new Set();
  const edges = EDGES.filter((e) => (signals || e.kind !== "signal") && !e.loop);
  const walk = (start, dirKey, other, out) => {
    const q = [start];
    while (q.length) {
      const cur = q.shift();
      for (const e of edges) if (e[dirKey] === cur && !out.has(e[other])) { out.add(e[other]); q.push(e[other]); }
    }
  };
  walk(id, "to", "from", up);
  walk(id, "from", "to", down);
  // the battery and grid are bidirectional: treat them as both
  const edgeIds = new Set(edges.filter((e) => (e.to === id || up.has(e.to)) && (up.has(e.from) || e.from === id) || (e.from === id || down.has(e.from)) && (down.has(e.to) || e.to === id)).map((e) => e.id));
  return { up, down, edgeIds };
}

/** Node that owns a model part, for picking in the explorer. */
export function nodeForPart(partId) {
  return NODES.find((n) => n.parts.includes(partId)) || null;
}

/** Route ids (stage flows) touched by a node's resource edges. */
export function routesFor(nodeIds) {
  const set = new Set();
  for (const e of EDGES) if (e.route && (nodeIds.has(e.from) || nodeIds.has(e.to)) && nodeIds.has(e.from) && nodeIds.has(e.to)) set.add(e.route);
  return set;
}
