// Procedural rooftop and city context for the digital twin. Low draw-call count:
// deck, parapet, service core, condensers, cable tray, and an instanced distant skyline.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { GROUND_Y } from "./model.js";

function concreteTexture(seed = 1) {
  const c = document.createElement("canvas");
  c.width = c.height = 1024;
  const g = c.getContext("2d");
  g.fillStyle = "#d2cdc3"; g.fillRect(0, 0, 1024, 1024);
  // deterministic speckle
  let s = seed * 9301;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 22000; i++) {
    const v = 190 + Math.floor(rnd() * 36);
    g.fillStyle = `rgba(${v},${v - 3},${v - 9},${0.25 + rnd() * 0.3})`;
    g.fillRect(rnd() * 1024, rnd() * 1024, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  // paving joints, 1.2 m grid at 8 m texture repeat
  g.strokeStyle = "rgba(120,114,104,.35)"; g.lineWidth = 2;
  for (let i = 0; i <= 1024; i += 1024 / 6) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 1024); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(1024, i); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export function buildRooftop({ mobile = false } = {}) {
  const group = new THREE.Group();
  group.name = "rooftop";
  const W = 34, D = 26, top = GROUND_Y;
  const concrete = concreteTexture();
  concrete.repeat.set(W / 7.2, D / 7.2);

  const deckMat = new THREE.MeshStandardMaterial({ color: "#ffffff", map: concrete, roughness: 0.92, metalness: 0 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(W, 0.6, D), deckMat);
  deck.position.set(2, top - 0.3, -1); deck.receiveShadow = true; group.add(deck);

  const wallMat = new THREE.MeshStandardMaterial({ color: "#e9e6df", roughness: 0.85 });
  const capMat = new THREE.MeshStandardMaterial({ color: "#bfbab0", roughness: 0.55, metalness: 0.15 });
  const ph = 1.05, pt = 0.32;
  const walls = [
    [W, ph, pt, 2, top + ph / 2, -1 - D / 2 + pt / 2],
    [W, ph, pt, 2, top + ph / 2, -1 + D / 2 - pt / 2],
    [pt, ph, D, 2 - W / 2 + pt / 2, top + ph / 2, -1],
    [pt, ph, D, 2 + W / 2 - pt / 2, top + ph / 2, -1],
  ];
  for (const [w, h, d, x, y, z] of walls) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; group.add(m);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, 0.06, d + 0.06), capMat);
    cap.position.set(x, top + ph + 0.03, z); cap.receiveShadow = true; group.add(cap);
  }
  // building facade dropping away below the parapet (sells the height)
  const facade = new THREE.Mesh(new THREE.BoxGeometry(W, 40, D), new THREE.MeshStandardMaterial({ color: "#d9d5cc", roughness: 0.9 }));
  facade.position.set(2, top - 20.6, -1); group.add(facade);

  // service core with stair door
  const coreMat = new THREE.MeshStandardMaterial({ color: "#efece6", roughness: 0.8 });
  const core = new THREE.Mesh(new RoundedBoxGeometry(5.2, 3.3, 4, 2, 0.04), coreMat);
  core.position.set(12.2, top + 1.65, -8.2); core.castShadow = core.receiveShadow = true; group.add(core);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.2, 0.06), new THREE.MeshStandardMaterial({ color: "#5a6470", roughness: 0.5, metalness: 0.4 }));
  door.position.set(11.0, top + 1.1, -6.18); group.add(door);
  const louvre = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.05), new THREE.MeshStandardMaterial({ color: "#9aa3ad", roughness: 0.4, metalness: 0.5 }));
  louvre.position.set(13.3, top + 2.4, -6.18); group.add(louvre);

  // AC condensers: the load the system serves, and the source of condensate
  const acMat = new THREE.MeshStandardMaterial({ color: "#f4f3f0", roughness: 0.5, metalness: 0.1 });
  const fanMat = new THREE.MeshStandardMaterial({ color: "#2b323a", roughness: 0.6, metalness: 0.4 });
  const ringMat = new THREE.MeshStandardMaterial({ color: "#9aa3ad", roughness: 0.35, metalness: 0.7 });
  const fans = [];
  [[-12.2, -3.4], [-12.2, -6.0], [-12.2, -8.6]].forEach(([x, z]) => {
    const body = new THREE.Mesh(new RoundedBoxGeometry(1.9, 1.15, 1.9, 2, 0.05), acMat);
    body.position.set(x, top + 0.75, z); body.castShadow = body.receiveShadow = true; group.add(body);
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.18, 2.1), capMat);
    base.position.set(x, top + 0.09, z); base.receiveShadow = true; group.add(base);
    const well = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.04, 40), fanMat);
    well.position.set(x, top + 1.34, z); group.add(well);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.73, 0.03, 8, 48), ringMat);
    ring.rotation.x = Math.PI / 2; ring.position.set(x, top + 1.35, z); group.add(ring);
    const fan = new THREE.Group(); fan.position.set(x, top + 1.37, z);
    for (let b = 0; b < 4; b++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.015, 0.16), ringMat);
      blade.position.x = 0.32; const piv = new THREE.Group(); piv.rotation.y = (b * Math.PI) / 2; piv.add(blade); fan.add(piv);
    }
    group.add(fan); fans.push(fan);
  });

  // cable tray from the unit to the service core (the building connection)
  const trayMat = new THREE.MeshStandardMaterial({ color: "#a8b0b8", roughness: 0.4, metalness: 0.6 });
  const trayPath = [[4.6, 2.6, 8.5, 2.6], [11.2, 2.6, 11.2, -6.0]];
  for (const [x0, z0, x1, z1] of trayPath) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const tray = new THREE.Mesh(new THREE.BoxGeometry(len + 0.3, 0.08, 0.3), trayMat);
    tray.position.set((x0 + x1) / 2, top + 0.2, (z0 + z1) / 2);
    tray.rotation.y = -Math.atan2(z1 - z0, x1 - x0); tray.castShadow = tray.receiveShadow = true; group.add(tray);
  }
  const cornerTray = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.3), trayMat);
  cornerTray.position.set(8.5, top + 0.2, 2.6); group.add(cornerTray);

  // walkway pavers
  const paverMat = new THREE.MeshStandardMaterial({ color: "#c9c4b9", roughness: 0.85 });
  for (let i = 0; i < 9; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 1.0), paverMat);
    p.position.set(5.6 + i * 0.0, top + 0.025, 3.8 - i * 1.25);
    if (i > 4) p.position.set(5.6 + (i - 4) * 1.25, top + 0.025, -1.2);
    p.receiveShadow = true; group.add(p);
  }

  // drain outlets in the deck
  const drainMat = new THREE.MeshStandardMaterial({ color: "#6e757c", roughness: 0.4, metalness: 0.6 });
  [[-12, 9.5], [14, 9.5]].forEach(([x, z]) => {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 24), drainMat);
    d.position.set(x, top + 0.01, z); group.add(d);
  });

  return { group, fans, deck, parts: { deckMat, wallMat, coreMat, acMat } };
}
