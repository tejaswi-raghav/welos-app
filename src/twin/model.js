// Builds the WELOS engineering assembly from the transcribed scene graph (model-data.js).
// Geometry and transforms are the engineering source; this file only adds semantic keys,
// a procedural PV-cell surface and data-bound instruments (tank gauge, battery LEDs).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { DATA, BLADE } from "./model-data.js";
import { partById, systems } from "../model/parts.js";

export const GROUND_Y = -2.385;

/** Layers shown in the explorer, each mapped to real tagged parts. */
export const LAYERS = [
  { id: "solar", code: "L1", name: "Solar generation", color: "amber", keys: ["pv-array", "pv-racking", "soiling-sensor", "mppt", "canopy"], blurb: "Six-module canopy, racking, soiling reference and MPPT charger." },
  { id: "wind", code: "L2", name: "Wind capture", color: "amber", keys: ["vawt-rotor", "wind-generator", "wind-brake", "wind-mast", "wind-rectifier"], blurb: "Helical VAWT, direct-drive generator, fail-safe brake and rectifier." },
  { id: "water", code: "L3", name: "Water infrastructure", color: "sky", keys: ["rain-gutter", "first-flush", "water-tank", "filter-train", "filter-header", "filter-stage-1", "filter-stage-2", "filter-stage-3", "filter-cap-1", "filter-cap-2", "filter-cap-3", "water-pump", "cleaning-manifold", "pipe-0", "pipe-1", "pipe-2", "pipe-3", "pipe-4"], blurb: "Catchment, first flush, tank, three-stage treatment, pump and rinse rail." },
  { id: "storage", code: "L4", name: "Electrical storage", color: "amber", keys: ["lifepo4-battery", "dc-bus", "hybrid-inverter", "load-panel", "power-cabinet"], blurb: "48 V LiFePO4, protected DC bus, hybrid inverter and critical-load panel." },
  { id: "sensors", code: "L5", name: "Sensor network", color: "ink", keys: ["soiling-sensor", "water-sensors", "energy-meter", "thermal-management"], blurb: "Soiling reference, water level and quality, energy metering, cabinet temperature." },
  { id: "control", code: "L6", name: "Control intelligence", color: "ink", keys: ["controller-pcb", "communications", "protection", "terminal-blocks", "enclosure", "backplate"], blurb: "ESP32-S3 edge controller, safety rail, I/O terminals and gateway." },
];

/** Component hierarchy for the explorer, grouped by the systems in parts.js. */
export function hierarchy() {
  return systems.filter((s) => s.id !== "overview").map((s) => ({
    ...s,
    parts: Object.values(partById).filter((p) => p.system === s.id),
  }));
}

function pvCellTexture() {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 512;
  const g = c.getContext("2d");
  g.fillStyle = "#0b1626"; g.fillRect(0, 0, 512, 512);
  const cols = 6, rows = 10, pad = 6;
  const cw = (512 - pad * 2) / cols, ch = (512 - pad * 2) / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x = pad + i * cw, y = pad + j * ch;
    const grd = g.createLinearGradient(x, y, x + cw, y + ch);
    grd.addColorStop(0, "#1b3150"); grd.addColorStop(1, "#13243c");
    g.fillStyle = grd; g.fillRect(x + 1.5, y + 1.5, cw - 3, ch - 3);
    g.strokeStyle = "rgba(170,190,215,.22)"; g.lineWidth = 1;
    for (let b = 1; b <= 3; b++) { g.beginPath(); g.moveTo(x + (cw * b) / 4, y + 2); g.lineTo(x + (cw * b) / 4, y + ch - 2); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function buildModel() {
  const [, nTxt, gTxt, mTxt] = DATA.trim().split(/@N\n|\n@G\n|\n@M\n/);
  const vec = (s) => (s ? s.split(",").map(Number) : [0, 0, 0]);
  const bladeIndex = [];
  for (let i = 0; i < 24; i++) { const a = 2 * i; bladeIndex.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }

  const geos = gTxt.split("\n").map((line) => {
    const p = line.split(","); const k = p[0]; const n = p.slice(1).map(Number);
    switch (k) {
      case "R": return new RoundedBoxGeometry(n[0], n[1], n[2], 3, n[3]);
      case "B": return new THREE.BoxGeometry(n[0], n[1], n[2]);
      case "C": return new THREE.CylinderGeometry(n[0], n[1], n[2], n[3], n[4] ?? 1, !!n[5], n[6] ?? 0, n[7] ?? Math.PI * 2);
      case "O": return new THREE.TorusGeometry(n[0], n[1], n[2], n[3], n[4]);
      case "I": return new THREE.CircleGeometry(n[0], n[1]);
      case "U": {
        const pts = p[2].split(";").map((s) => new THREE.Vector3(...s.trim().split(" ").map(Number)));
        return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.5), 48, +p[1], 8, false);
      }
      case "F": {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(BLADE, 3));
        g.setIndex(bladeIndex); g.rotateY((-n[0] * Math.PI * 2) / 3); g.computeVertexNormals();
        return g;
      }
      default: return new THREE.BoxGeometry(0.01, 0.01, 0.01);
    }
  });
  const cellTex = pvCellTexture();
  // Solar Ember finishes: the reference CAD used cool blue-greys; the product is shown in warm graphite,
  // champagne aluminium and ivory powder-coat. Water parts stay blue, power parts amber, the E-stop red.
  const FINISH = {
    "2a323c": "2f2824", "1a2129": "1f1916", "7d8893": "8a7f78", "0d1218": "14100e", "5e6a76": "5f544e",
    "9aa6b2": "a89d95", "707c88": "73685f", "808c98": "857a72", "dfe4e9": "efe7de", "d2d9e0": "e4dad0",
    "bcc6cf": "cbbfb4", "141b23": "1a1512", "1f2630": "241d19", "1d242d": "221b18", "f5f3ed": "fbf3e8",
    "00bfea": "2aa3e0", "00a9d4": "1a8fd0", "d99a00": "e0901a", "d9a000": "e0961a", "ffb800": "f5a623",
  };
  const mats = mTxt.split("\n").map((line, idx) => {
    const [raw, metal, rough, em, ei, side] = line.split(",");
    const hex = FINISH[raw] || raw;
    const m = new THREE.MeshStandardMaterial({
      color: "#" + hex, metalness: +metal, roughness: +rough,
      emissive: em ? "#" + em : 0x000000, emissiveIntensity: em ? +ei : 1,
      side: side === "2" ? THREE.DoubleSide : THREE.FrontSide,
    });
    if (idx === 8) { m.map = cellTex; m.color.set("#ffffff"); m.metalness = 0.35; m.roughness = 0.18; } // PV cell surface
    return m;
  });

  const nodes = [];
  nTxt.split("\n").forEach((line) => {
    const p = line.split("|"); let o, pos, rot;
    if (p[0] === "g") { o = new THREE.Group(); o.userData.partId = p[2]; o.name = p[2] || p[5] || ""; pos = p[3]; rot = p[4]; }
    else { o = new THREE.Mesh(geos[+p[4]], mats[+p[5]].clone()); o.userData.geoIndex = +p[4]; pos = p[2]; rot = p[3]; o.castShadow = true; o.receiveShadow = true; }
    o.position.fromArray(vec(pos)); o.rotation.set(...vec(rot));
    if (+p[1] >= 0) nodes[+p[1]].add(o);
    nodes.push(o);
  });

  const KEY = {};
  const tag = (i, k) => { const o = nodes[i]; o.userData.key = k; (KEY[k] ||= []).push(o); };
  nodes.forEach((o, i) => { if (o.userData.partId) tag(i, o.userData.partId); });
  tag(20, "canopy"); tag(71, "wind-mast"); tag(139, "enclosure-door"); tag(142, "backplate"); tag(185, "power-cabinet");
  tag(1, "base-slab"); tag(19, "base-slab"); tag(2, "base-plate");
  for (let i = 3; i <= 10; i++) tag(i, "foot");
  for (let i = 11; i <= 18; i++) tag(i, "post");
  ["filter-stage-1", "filter-cap-1", "filter-stage-2", "filter-cap-2", "filter-stage-3", "filter-cap-3", "filter-header"].forEach((k, j) => tag(113 + j, k));
  for (let j = 0; j < 5; j++) tag(128 + j, "pipe-" + j);
  tag(209, "pv-cable"); tag(210, "wind-cable");

  const root = nodes[0];
  const baseGroup = new THREE.Group(), assembly = new THREE.Group();
  [...root.children].forEach((c) => { const i = nodes.indexOf(c); ((i >= 1 && i <= 10) || i === 19 ? baseGroup : assembly).add(c); });
  root.add(baseGroup, assembly);
  assembly.userData.key = "assembly"; KEY.assembly = [assembly];

  // PV modules: the six module groups under pv-array, used for dust and rinse overlays
  const pvArray = KEY["pv-array"][0];
  const modules = pvArray.children.filter((c) => c.isGroup);

  // data-bound instruments
  const tank = KEY["water-tank"][0];
  const gaugeTrack = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.3, 0.02), new THREE.MeshStandardMaterial({ color: "#efe7de", roughness: 0.3 }));
  gaugeTrack.position.set(0, 0.0, 0.69); tank.add(gaugeTrack);
  const gaugeFill = new THREE.Mesh(new THREE.BoxGeometry(0.044, 1, 0.024), new THREE.MeshStandardMaterial({ color: "#1a8fd0", emissive: "#1a8fd0", emissiveIntensity: 0.35, roughness: 0.3 }));
  gaugeFill.position.set(0, -0.63, 0.695); tank.add(gaugeFill);
  const battery = KEY["lifepo4-battery"][0];
  const leds = battery.children.filter((m) => m.isMesh && Math.abs(m.position.z - 0.33) < 0.01).sort((a, b) => a.position.x - b.position.x);
  leds.forEach((m) => { m.material = m.material.clone(); m.userData.led = true; });

  const meshes = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    let a = o; while (a && !a.userData.key) a = a.parent;
    o.userData.dimKey = a ? a.userData.key : "misc";
    let pa = o; while (pa && !pa.userData.partId) pa = pa.parent;
    o.userData.pickId = pa ? pa.userData.partId : (a ? a.userData.key : null);
    o.userData.baseColor = o.material.color.clone();
    o.userData.baseEmissive = o.material.emissive.clone();
    o.userData.baseEI = o.material.emissiveIntensity;
    o.userData.dim = 0; o.userData.sel = 0;
    meshes.push(o);
  });
  const rotor = KEY["vawt-rotor"][0];
  for (const k in KEY) for (const o of KEY[k]) o.userData.home = o.position.clone();
  root.updateMatrixWorld(true);
  for (const k in KEY) for (const o of KEY[k]) o.userData.homeWorld = o.getWorldPosition(new THREE.Vector3());

  return { root, KEY, meshes, rotor, rotorY0: rotor.rotation.y, modules, gaugeFill, leds };
}

/* Explode choreography: [key, offset in parent space, order]. Offsets follow the direction each
   part would be removed for service (from the original exhibit). */
export const MOVES = [
  ["vawt-rotor", [0, 1.75, 0], 0], ["wind-brake", [0, 1.0, 0], 0.02], ["wind-generator", [0, 0.44, 0], 0.04],
  ["canopy", [0, 0.62, -0.4], 0.1], ["pv-array", [0, 0.82, 0], 0.12], ["soiling-sensor", [0, 0.98, 0], 0.12], ["cleaning-manifold", [0, 0.42, -0.24], 0.14],
  ["enclosure", [-0.4, 0.12, -0.42], 0.22], ["backplate", [-0.2, 0.06, -0.22], 0.23], ["power-cabinet", [0.34, 0.04, -0.56], 0.23],
  ["controller-pcb", [-0.32, 0.4, 0.8], 0.32], ["energy-meter", [0.4, 0.35, 0.75], 0.33], ["protection", [0, -0.5, 0.95], 0.33],
  ["communications", [-0.45, -0.18, 0.75], 0.34], ["terminal-blocks", [0.35, -0.22, 0.85], 0.34], ["thermal-management", [0.38, 0.22, 0.65], 0.35],
  ["lifepo4-battery", [0.2, -0.3, 0.95], 0.34], ["hybrid-inverter", [0.2, 0.45, 0.9], 0.35], ["mppt", [-0.45, 0.45, 0.72], 0.36],
  ["wind-rectifier", [0.45, 0.45, 0.72], 0.36], ["dc-bus", [0, 0.53, 0.72], 0.37], ["load-panel", [0.7, 0, 0.6], 0.37],
  ["rain-gutter", [0, -0.3, 0.42], 0.44], ["first-flush", [-0.75, 0.05, 0.2], 0.46], ["water-tank", [-0.75, 0, 0.35], 0.52],
  ["filter-train", [-0.1, 0.02, 1.05], 0.6], ["filter-header", [0, 0.32, 0], 0.62],
  ["filter-cap-1", [-0.14, 0.14, 0], 0.63], ["filter-stage-1", [-0.14, 0, 0], 0.63], ["filter-cap-2", [0, 0.14, 0], 0.63],
  ["filter-cap-3", [0.14, 0.14, 0], 0.63], ["filter-stage-3", [0.14, 0, 0], 0.63],
  ["water-pump", [0.3, -0.02, 1.55], 0.68], ["water-sensors", [-0.15, 0.42, 0.45], 0.7],
  ["assembly", [0, 0.78, 0], 0.8], ["base-plate", [0, 0.3, 0], 0.82], ["base-slab", [0, 0.13, 0], 0.82],
];

/* Resource routes, written as anchor points on tagged parts so they follow the explode. */
export const ROUTES = {
  pv: { kind: "power", pts: [["pv-array", [-0.95, 1.74, -0.28]], ["pv-racking", [-0.95, 1.4, -0.3]], ["pv-cable", [-0.95, 0.85, -0.3]], ["pv-cable", [1.3, 0.85, -0.3]], ["mppt", [1.36, 0.2, 1.66]]] },
  wind: { kind: "power", pts: [["vawt-rotor", [3.25, 2.25, -0.9]], ["wind-brake", [3.25, 0.86, -0.9]], ["wind-generator", [3.25, 0.5, -0.9]], ["wind-mast", [3.25, -0.65, -0.9]], ["wind-cable", [2.2, -0.65, -0.9]], ["wind-rectifier", [2.13, 0.08, 1.66]]] },
  mpptBus: { kind: "power", pts: [["mppt", [1.36, 0.08, 1.8]], ["dc-bus", [1.55, -0.13, 1.95]]] },
  rectBus: { kind: "power", pts: [["wind-rectifier", [2.13, 0.08, 1.8]], ["dc-bus", [1.95, -0.13, 1.95]]] },
  battery: { kind: "power", pts: [["dc-bus", [1.4, -0.13, 1.97]], ["lifepo4-battery", [1.3, -1.25, 1.99]]] },
  loads: { kind: "power", pts: [["dc-bus", [2.1, -0.13, 1.97]], ["hybrid-inverter", [2.1, -0.55, 1.98]], ["hybrid-inverter", [2.3, -0.55, 1.98]], ["load-panel", [3.05, -0.87, 1.9]]] },
  building: { kind: "power", world: true, pts: [["load-panel", [3.05, -1.3, 1.9]], [null, [4.6, -2.2, 2.6]], [null, [8.5, -2.2, 2.6]], [null, [11.2, -2.2, -4.2]], [null, [11.2, -1.2, -6.4]]] },
  pump: { kind: "power", pts: [["dc-bus", [1.75, -0.13, 1.97]], ["terminal-blocks", [0.6, -0.81, 1.66]], ["terminal-blocks", [-0.2, -0.81, 1.66]], ["water-pump", [-1.35, -1.6, 1.75]]] },
  control: { kind: "signal", pts: [["controller-pcb", [-0.37, -0.37, 1.72]], ["terminal-blocks", [0.19, -0.81, 1.66]], ["dc-bus", [1.2, -0.13, 1.97]]] },
  catch: { kind: "water", pts: [["pv-array", [-0.95, 1.75, 0.4]], ["rain-gutter", [-0.95, 1.76, 1.54]], ["rain-gutter", [-3.95, 1.76, 1.54]], ["pipe-0", [-3.95, 1.35, 1.56]], ["pipe-0", [-3.95, -0.5, 1.55]], ["first-flush", [-3.94, -0.9, 1]]] },
  store: { kind: "water", pts: [["first-flush", [-3.94, -1.62, 1]], ["pipe-1", [-3.5, -1.62, 1]], ["water-tank", [-3.5, -0.95, 1]]] },
  treat: { kind: "water", pts: [["water-tank", [-2.8, -1.0, 1.0]], ["water-tank", [-2.1, -1, 1]], ["pipe-2", [-1.7, -1, 1.4]], ["filter-header", [-1.71, -0.5, 1.9]], ["filter-stage-1", [-1.71, -0.66, 1.9]], ["filter-stage-1", [-1.71, -1.45, 1.9]], ["filter-stage-2", [-1.3, -1.45, 1.9]], ["filter-stage-2", [-1.3, -0.66, 1.9]], ["filter-stage-3", [-0.89, -0.66, 1.9]], ["filter-stage-3", [-0.89, -1.45, 1.9]], ["water-pump", [-1.15, -1.6, 1.75]]] },
  rinse: { kind: "water", pts: [["water-pump", [-1.55, -1.6, 1.75]], ["water-pump", [-1.95, -1.62, 1.75]], ["pipe-4", [-3.75, -1.62, 1.75]], ["pipe-4", [-3.75, 1.42, 1.62]], ["cleaning-manifold", [-3.55, 1.52, -2.11]], ["cleaning-manifold", [1.7, 1.52, -2.11]]] },
};

/** Which routes run, and in which direction, for one simulated frame. */
export function routeActivity(frame) {
  if (!frame) return {};
  const P = frame.result.power, W = frame.result.water, O = frame.result.outputs;
  const k = (x, full) => Math.min(1, Math.max(0, x / full));
  return {
    pv: { on: P.pvKw > 0.03, level: k(P.pvKw, 3), dir: 1 },
    mpptBus: { on: P.pvKw > 0.03, level: k(P.pvKw, 3), dir: 1 },
    wind: { on: P.windKw > 0.03, level: k(P.windKw, 1.2), dir: 1 },
    rectBus: { on: P.windKw > 0.03, level: k(P.windKw, 1.2), dir: 1 },
    battery: { on: P.batteryChargeKw > 0.02 || P.batteryDischargeKw > 0.02, level: k(P.batteryChargeKw + P.batteryDischargeKw, 3), dir: P.batteryChargeKw > 0.02 ? 1 : -1 },
    loads: { on: P.servedLoadKw > 0.02, level: k(P.servedLoadKw, 3), dir: 1 },
    building: { on: P.servedLoadKw > 0.02 || P.gridImportKw > 0.02, level: k(P.servedLoadKw, 3), dir: 1 },
    pump: { on: O.cleaningPump || O.filtrationPump, level: 0.5, dir: 1 },
    control: { on: true, level: 0.3, dir: 1 },
    catch: { on: frame.sensors.rainfallMmHr >= 0.2, level: k(frame.sensors.rainfallMmHr, 8), dir: 1 },
    store: { on: W.storageActive, level: k(W.captureRateLpm, 14), dir: 1 },
    treat: { on: O.filtrationPump || O.cleaningPump, level: 0.6, dir: 1 },
    rinse: { on: O.cleaningPump, level: 0.8, dir: 1 },
  };
}
