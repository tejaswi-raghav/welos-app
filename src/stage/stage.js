import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { buildWelosModel } from "./model.js";

/*
 * The WELOS stage: one Dubai rooftop at any hour.
 * Sky, sun, city lights, rain and the flows of energy (amber) and water (cyan)
 * between the real parts of the appliance are all driven by set({...}).
 * Used by the scroll story (camera on rails) and the Studio (orbit + picking).
 */

const AMBER = new THREE.Color(0xffb800);
const CYAN = new THREE.Color(0x00bfea);
const ROOF_Y = -2.4;

// sky keyframes by hour: [hour, zenith, horizon, sunColor, sunIntensity, hemi, exposure, night]
const SKY = [
  [0, 0x05080d, 0x0f1824, 0x8fb4ff, 0.0, 0.32, 1.05, 1],
  [5.2, 0x0b1320, 0x1d2735, 0x8fb4ff, 0.0, 0.35, 1.05, 0.9],
  [6.0, 0x2b3c58, 0xd9894a, 0xffb36b, 0.9, 0.55, 1.1, 0.35],
  [7.2, 0x4f78a6, 0xf0c48e, 0xffd9a3, 2.2, 0.8, 1.05, 0],
  [10, 0x4f86c2, 0xd8e3ec, 0xfff4e0, 3.0, 0.95, 1.0, 0],
  [13, 0x4a86c8, 0xe6ecef, 0xfff8ec, 3.3, 1.0, 1.0, 0],
  [16.5, 0x5481b6, 0xe8d6bb, 0xffe2b0, 2.6, 0.9, 1.0, 0],
  [18.0, 0x34476a, 0xf09a45, 0xff9a3c, 1.3, 0.62, 1.08, 0.05],
  [18.9, 0x1b2438, 0x8a5560, 0xff7a3c, 0.25, 0.45, 1.1, 0.45],
  [20.0, 0x080d16, 0x172133, 0x8fb4ff, 0.0, 0.34, 1.05, 0.95],
  [24, 0x05080d, 0x0f1824, 0x8fb4ff, 0.0, 0.32, 1.05, 1],
];
const STORM = { zenith: new THREE.Color(0x323b47), horizon: new THREE.Color(0x56606c) };

function skyAt(hour, weather, out) {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < SKY.length - 2 && SKY[i + 1][0] <= h) i += 1;
  const a = SKY[i], b = SKY[i + 1];
  const t = (h - a[0]) / Math.max(1e-6, b[0] - a[0]);
  const lerpC = (x, y) => new THREE.Color(x).lerp(new THREE.Color(y), t);
  out.zenith = lerpC(a[1], b[1]);
  out.horizon = lerpC(a[2], b[2]);
  out.sunColor = lerpC(a[3], b[3]);
  out.sun = THREE.MathUtils.lerp(a[4], b[4], t);
  out.hemi = THREE.MathUtils.lerp(a[5], b[5], t);
  out.exposure = THREE.MathUtils.lerp(a[6], b[6], t);
  out.night = THREE.MathUtils.lerp(a[7], b[7], t);
  if (weather > 0) {
    const day = 1 - out.night;
    out.zenith.lerp(STORM.zenith.clone().multiplyScalar(0.35 + 0.65 * day), weather * 0.9);
    out.horizon.lerp(STORM.horizon.clone().multiplyScalar(0.35 + 0.65 * day), weather * 0.9);
    out.sun *= 1 - 0.85 * weather;
  }
  return out;
}

/** Sun direction for a UAE-ish latitude: rises east ~06:00, sets west ~18:30. */
function sunDirection(hour, out) {
  const t = (hour - 6.05) / 12.4; // 0 sunrise, 1 sunset
  const elev = Math.sin(Math.PI * THREE.MathUtils.clamp(t, -0.15, 1.15)) * THREE.MathUtils.degToRad(72);
  const az = THREE.MathUtils.lerp(-Math.PI * 0.5, Math.PI * 0.5, t); // east -> south -> west
  out.set(Math.sin(az) * Math.cos(elev), Math.sin(elev), -Math.cos(az) * Math.cos(elev) * 0.55 + 0.45 * Math.cos(elev));
  return out.normalize();
}

function dotTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.35, "rgba(255,255,255,.75)"); grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function windowTexture() {
  const c = document.createElement("canvas"); c.width = 128; c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, 128, 256);
  for (let y = 4; y < 256; y += 10) for (let x = 4; x < 128; x += 9) {
    const r = Math.random();
    if (r < 0.42) { g.fillStyle = r < 0.08 ? "#9fd8ff" : r < 0.3 ? "#ffcf7a" : "#ffe7b8"; g.globalAlpha = 0.5 + Math.random() * 0.5; g.fillRect(x, y, 5, 5); }
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeSky() {
  const uniforms = {
    zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, ground: { value: new THREE.Color(0x0a0f15) },
    sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: new THREE.Color() }, sunAmount: { value: 1 }, stars: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 zenith, horizon, ground, sunColor, sunDir; uniform float sunAmount, stars; varying vec3 vDir;
      float hash(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        vec3 col = mix(horizon, zenith, smoothstep(-0.02, 0.55, h));
        col = mix(col, ground, smoothstep(0.0, -0.25, h));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += sunColor * (pow(s, 8.0) * 0.18 + pow(s, 90.0) * 0.55) * sunAmount;
        col += sunColor * smoothstep(0.9993, 0.9997, s) * 2.5 * sunAmount;
        if (stars > 0.01 && h > 0.05) {
          vec3 q = floor(d * 220.0); float st = step(0.9965, hash(q));
          col += vec3(st) * stars * smoothstep(0.05, 0.3, h) * 0.9;
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  return { mesh: new THREE.Mesh(new THREE.SphereGeometry(120, 48, 24), mat), uniforms };
}

function makeCity(group) {
  const win = windowTexture();
  const mats = [];
  const rand = (a, b) => a + Math.random() * (b - a);
  const geomFor = (w, h, d) => {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * Math.max(1, w / 3), uv.getY(i) * Math.max(1, h / 6));
    return g;
  };
  const tower = (x, z, w, h, d) => {
    const m = new THREE.MeshStandardMaterial({ color: 0x2c3846, roughness: 0.85, metalness: 0.15, emissive: 0xffffff, emissiveMap: win, emissiveIntensity: 0 });
    mats.push(m);
    const mesh = new THREE.Mesh(geomFor(w, h, d), m);
    mesh.position.set(x, -40 + h / 2, z);
    group.add(mesh);
  };
  for (let i = 0; i < 150; i += 1) {
    const ang = rand(0, Math.PI * 2), r = rand(50, 120);
    const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
    tower(x, z, rand(5, 11), rand(14, i % 9 === 0 ? 44 : 32), rand(5, 11));
  }
  // one supertall on the horizon, stepped like Gulf skylines
  const sm = new THREE.MeshStandardMaterial({ color: 0x2a3644, roughness: 0.5, metalness: 0.5, emissive: 0xffffff, emissiveMap: win, emissiveIntensity: 0 });
  mats.push(sm);
  let y = -40;
  [[5, 60], [4, 40], [3, 30], [2, 22], [1.1, 18], [0.45, 22]].forEach(([r, h]) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r, h, 12), sm);
    m.position.set(-75, y + h / 2, -100); group.add(m); y += h;
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(130, 48), new THREE.MeshStandardMaterial({ color: 0x141b23, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -40; group.add(floor);
  return mats;
}

function makeRoof(group) {
  const concrete = new THREE.MeshStandardMaterial({ color: 0x5b636d, roughness: 0.95, metalness: 0.05 });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(24, 1, 18), concrete);
  slab.position.y = ROOF_Y - 0.5; slab.receiveShadow = true; group.add(slab);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x6d757f, roughness: 0.9 });
  [[0, 8.8, 24, 0.4], [0, -8.8, 24, 0.4], [11.8, 0, 0.4, 18], [-11.8, 0, 0.4, 18]].forEach(([x, z, w, d]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, d), wallMat);
    m.position.set(x, ROOF_Y + 0.55, z); m.castShadow = m.receiveShadow = true; group.add(m);
  });
  // building body below the roof, so the roof reads as the top of a tower
  const body = new THREE.Mesh(new THREE.BoxGeometry(24, 38, 18), new THREE.MeshStandardMaterial({ color: 0x2a333d, roughness: 0.9 }));
  body.position.y = ROOF_Y - 1 - 19; group.add(body);
  // two AC condensers: the source of condensate water in the story
  const acs = [];
  [[-7.6, -4.6], [-7.6, -1.6]].forEach(([x, z]) => {
    const ac = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.3, 2.2), new THREE.MeshStandardMaterial({ color: 0xc7d0d9, roughness: 0.6, metalness: 0.3 }));
    box.castShadow = box.receiveShadow = true; ac.add(box);
    const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.06, 28), new THREE.MeshStandardMaterial({ color: 0x1a2129, roughness: 0.5 }));
    fan.position.y = 0.67; ac.add(fan);
    ac.position.set(x, ROOF_Y + 0.65, z); group.add(ac); acs.push(ac);
  });
  // stair kiosk with the line into the home, and a grid meter at the edge
  const kiosk = new THREE.Mesh(new THREE.BoxGeometry(3, 2.6, 2.6), wallMat);
  kiosk.position.set(8.2, ROOF_Y + 1.3, 4.6); kiosk.castShadow = kiosk.receiveShadow = true; group.add(kiosk);
  const meter = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.2, 0.5), new THREE.MeshStandardMaterial({ color: 0xdfe4e9, roughness: 0.5 }));
  meter.position.set(9.6, ROOF_Y + 0.6, -6.5); meter.castShadow = true; group.add(meter);
  return { acs, kiosk, meter };
}

class Flow {
  constructor(points, color, count, size, tex, speed = 0.18) {
    this.curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
    this.count = count; this.speed = speed; this.phase = Math.random();
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(count * 3);
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.PointsMaterial({ color, size, map: tex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.amount = 0; this.target = 0;
    this.update(0, 0);
  }
  update(dt, ease) {
    if (!Number.isFinite(this.target)) this.target = 0;
    this.amount += (this.target - this.amount) * ease;
    if (!Number.isFinite(this.amount)) this.amount = 0;
    this.phase = (this.phase + dt * this.speed * (0.5 + this.amount)) % 1;
    if (!Number.isFinite(this.phase)) this.phase = 0;
    const p = new THREE.Vector3();
    for (let i = 0; i < this.count; i += 1) {
      const t = (i / this.count + this.phase) % 1;
      this.curve.getPointAt(t, p);
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.mat.opacity = Math.min(1, this.amount) * 0.95;
    this.points.visible = this.amount > 0.01;
  }
}

const SHOTS = {
  establish: { pos: [23, 10, 27], look: [0, 0.2, 0], fov: 34 },
  hero: { pos: [15.5, 6.2, 18], look: [0.4, 0.5, 0], fov: 33 },
  panels: { pos: [9.5, 8.6, 11.5], look: [-0.4, 1.0, 0], fov: 34 },
  dust: { pos: [7.5, 7.6, 9.6], look: [-0.5, 1.3, -0.2], fov: 33 },
  turbine: { pos: [12.5, 5.6, 10], look: [2.4, 1.6, -0.4], fov: 34 },
  night: { pos: [16, 5, 16], look: [0.6, 0, 0.6], fov: 34 },
  water: { pos: [-12.5, 4.2, 12.5], look: [-2.2, -0.4, 0.6], fov: 34 },
  apart: { pos: [16, 8.5, 19], look: [0, 0.6, 0.3], fov: 35 },
  brain: { pos: [6, 1.4, 9], look: [0.6, -0.8, 1.5], fov: 32 },
  wide: { pos: [27, 15, 29], look: [0, -1, 0], fov: 34 },
  studio: { pos: [14, 8, 16.5], look: [0, 0.3, 0], fov: 34 },
};

export function createStage(container, { interactive = false, onPick, onReady, onError, frame: framing } = {}) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  } catch (error) { onError?.(error); return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute("aria-label", "3D WELOS unit on a Dubai rooftop");
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 400);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = env.texture; scene.environmentIntensity = 0.45;
  pmrem.dispose();

  const sky = makeSky(); scene.add(sky.mesh);
  scene.fog = new THREE.Fog(0x0f1824, 22, 125);
  const hemi = new THREE.HemisphereLight(0xdfe8f2, 0x1a2129, 0.6); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 80 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const moon = new THREE.DirectionalLight(0x9db8ff, 0.35); moon.position.set(-20, 30, 10); scene.add(moon);
  const fill = new THREE.PointLight(0xffb800, 0, 14, 1.6); fill.position.set(2.4, -1.2, 3.4); scene.add(fill);

  const city = new THREE.Group(); scene.add(city);
  const cityMats = makeCity(city);
  const roof = makeRoof(scene);

  const model = buildWelosModel();
  const { root, registry, assemblies } = model;
  scene.add(root);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  root.updateMatrixWorld(true);

  // parts we animate
  const rotor = registry.get("vawt-rotor");
  const cells = []; registry.get("pv-array").traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.userData.base = o.material.color.clone(); cells.push(o); } });
  const dustColor = new THREE.Color(0xb49a6f);
  const leds = []; registry.get("lifepo4-battery").children.slice(1).forEach((o) => { if (o.isMesh) { o.material = o.material.clone(); leds.push(o); } });
  // tank sight glass
  const tank = registry.get("water-tank");
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.04), new THREE.MeshStandardMaterial({ color: 0x0b1218, roughness: 0.3 }));
  glass.position.set(0, 0, 0.69); tank.add(glass);
  const level = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.16, 0.03), new THREE.MeshBasicMaterial({ color: CYAN }));
  level.position.set(0, -0.58, 0.705); level.geometry.translate(0, 0.58, 0); tank.add(level);

  // flow paths from real part positions
  const W = (id, dx = 0, dy = 0, dz = 0) => { const v = new THREE.Vector3(); registry.get(id).getWorldPosition(v); return v.add(new THREE.Vector3(dx, dy, dz)); };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const dot = dotTexture();
  const acW = (i) => { const v = new THREE.Vector3(); roof.acs[i].getWorldPosition(v); return v; };
  const flows = {
    pv: new Flow([W("pv-array", -1.4, 0.15, 0.4), W("pv-array", 0.8, 0.1, 1.2), W("mppt", 0, 0.4, 0.2), W("mppt"), W("dc-bus")], AMBER, 56, 0.26, dot, 0.22),
    wind: new Flow([W("vawt-rotor", 0, -0.6, 0), W("wind-generator"), W("wind-rectifier", 0.2, 0.5, 0.2), W("wind-rectifier"), W("dc-bus", 0.4)], AMBER, 40, 0.26, dot, 0.24),
    charge: new Flow([W("dc-bus"), W("dc-bus", 0, -0.4, 0.15), W("lifepo4-battery", 0, 0.25, 0.4), W("lifepo4-battery", 0, 0, 0.35)], AMBER, 26, 0.24, dot, 0.3),
    discharge: new Flow([W("lifepo4-battery", 0.3, 0, 0.4), W("hybrid-inverter", 0.3, 0, 0.4), W("load-panel", -0.2, 0, 0.35)], AMBER, 26, 0.24, dot, 0.3),
    home: new Flow([W("load-panel", 0.1, -0.3, 0.3), V(4.6, ROOF_Y + 0.15, 2.4), V(6.6, ROOF_Y + 0.15, 4.2), V(7.4, ROOF_Y + 1.0, 4.4)], AMBER, 36, 0.26, dot, 0.26),
    export: new Flow([W("load-panel", 0.2, 0.3, 0), V(5.4, ROOF_Y + 0.15, -1.6), V(8.6, ROOF_Y + 0.15, -5.4), V(9.6, ROOF_Y + 0.9, -6.5)], AMBER, 36, 0.24, dot, 0.24),
    rain: new Flow([W("rain-gutter", -3.0, 0.1, 1.8), W("rain-gutter", -3.1, -0.4, 1.8), W("first-flush", 0, 0.6, 0), W("first-flush"), W("water-tank", -0.4, 0.4, 0)], CYAN, 48, 0.26, dot, 0.3),
    treat: new Flow([W("water-tank", 0.4, -0.4, 0.4), W("filter-train", 0, 0.2, 0), W("filter-train"), W("water-pump")], CYAN, 30, 0.24, dot, 0.26),
    rinse: new Flow([W("water-pump"), W("water-pump", 0.6, 0.5, -0.3), W("cleaning-manifold", 1.5, -1.6, 0.6), W("cleaning-manifold", 0, -0.2, 0.3), W("cleaning-manifold")], CYAN, 40, 0.24, dot, 0.3),
    condensate: new Flow([acW(1).add(V(0.9, -0.5, 0.9)), V(-6.2, ROOF_Y + 0.12, 0.2), V(-4.6, ROOF_Y + 0.12, 1.0), W("water-tank", -0.6, -0.5, 0)], CYAN, 30, 0.24, dot, 0.24),
  };
  Object.values(flows).forEach((f) => scene.add(f.points));

  // rinse spray over the panels
  const sprayN = 260, spray = new Float32Array(sprayN * 3), sprayV = new Float32Array(sprayN * 3), sprayL = new Float32Array(sprayN);
  const sprayGeo = new THREE.BufferGeometry(); sprayGeo.setAttribute("position", new THREE.BufferAttribute(spray, 3));
  const sprayMat = new THREE.PointsMaterial({ color: CYAN, size: 0.09, map: dot, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const sprayPts = new THREE.Points(sprayGeo, sprayMat); sprayPts.frustumCulled = false; scene.add(sprayPts);
  const manifold = W("cleaning-manifold");

  // rain
  const dropN = 1400, drops = new Float32Array(dropN * 6);
  for (let i = 0; i < dropN; i += 1) {
    const x = (Math.random() - 0.5) * 30, z = (Math.random() - 0.5) * 26, y = ROOF_Y + Math.random() * 16;
    drops.set([x, y, z, x - 0.05, y + 0.5, z], i * 6);
  }
  const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute("position", new THREE.BufferAttribute(drops, 3));
  const rainMat = new THREE.LineBasicMaterial({ color: 0xd8f4ff, transparent: true, opacity: 0, depthWrite: false });
  const rain = new THREE.LineSegments(rainGeo, rainMat); rain.frustumCulled = false; scene.add(rain);

  // orbit (Studio)
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enabled = interactive; controls.enableDamping = !reduced; controls.dampingFactor = 0.08;
  controls.minDistance = 5; controls.maxDistance = 40; controls.maxPolarAngle = Math.PI * 0.48;
  controls.enablePan = false;

  // ---------- state ----------
  const target = { hour: 6, weather: 0, dust: 0, rinse: 0, wind: 0.2, soc: 0.6, tank: 0.3, explode: 0, flows: {} };
  const now = { hour: 6, weather: 0, dust: 0, rinse: 0, wind: 0.2, soc: 0.6, tank: 0.3, explode: 0 };
  const cam = { pos: new THREE.Vector3(...SHOTS.establish.pos), look: new THREE.Vector3(...SHOTS.establish.look), fov: 34 };
  const camTarget = { pos: cam.pos.clone(), look: cam.look.clone(), fov: 34 };
  let camLocked = !interactive, flying = false;
  camera.position.copy(cam.pos); controls.target.copy(cam.look);
  let highlighted = null, disposed = false, last = performance.now(), time = 0, dirty = true;
  const skyState = {}, sunDir = new THREE.Vector3();

  function set(next) {
    for (const k of Object.keys(next)) {
      if (k === "flows") for (const [f, v] of Object.entries(next.flows)) { if (flows[f]) flows[f].target = v; }
      else if (k === "modules") model.setModules(next.modules);
      else if (Number.isFinite(next[k])) target[k] = next[k];
    }
    dirty = true;
  }
  function shot(name, { instant = false } = {}) {
    const s = typeof name === "string" ? SHOTS[name] : name;
    if (!s) return;
    camTarget.pos.set(...s.pos); camTarget.look.set(...s.look); camTarget.fov = s.fov || 34;
    if (interactive) flying = true;
    if (instant || reduced) { cam.pos.copy(camTarget.pos); cam.look.copy(camTarget.look); cam.fov = camTarget.fov; camera.position.copy(cam.pos); controls.target.copy(cam.look); }
    dirty = true;
  }
  /** Blend between two shots (scroll-driven camera). */
  function shotBlend(a, b, t) {
    const A = SHOTS[a], B = SHOTS[b]; if (!A || !B) return;
    const e = t * t * (3 - 2 * t);
    camTarget.pos.set(...A.pos).lerp(new THREE.Vector3(...B.pos), e);
    camTarget.look.set(...A.look).lerp(new THREE.Vector3(...B.look), e);
    camTarget.fov = THREE.MathUtils.lerp(A.fov, B.fov, e);
    dirty = true;
  }
  function highlight(id) {
    if (highlighted && registry.has(highlighted)) registry.get(highlighted).traverse((c) => { if (c.isMesh && c.material?.emissive && !leds.includes(c)) c.material.emissiveIntensity = 0; });
    highlighted = id && registry.has(id) ? id : null;
    if (highlighted) registry.get(highlighted).traverse((c) => {
      if (c.isMesh && c.material?.emissive && !leds.includes(c)) { if (!c.userData.ownMat) { c.material = c.material.clone(); c.userData.ownMat = true; } c.material.emissive.set(0xffb800); c.material.emissiveIntensity = 0.22; }
    });
    dirty = true;
  }
  const _v = new THREE.Vector3(), _d = new THREE.Vector3();
  function project(id, dx = 0, dy = 0, dz = 0) {
    const o = registry.get(id); if (!o) return null;
    o.getWorldPosition(_v).add(new THREE.Vector3(dx, dy, dz)).project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return { x: (_v.x * 0.5 + 0.5) * r.width, y: (-_v.y * 0.5 + 0.5) * r.height, visible: _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1 };
  }

  // picking
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  const pickables = []; root.traverse((o) => { if (o.isMesh && o.userData.partId) pickables.push(o); });
  let down = null;
  const onDown = (e) => { down = [e.clientX, e.clientY]; flying = false; };
  const onUp = (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) { down = null; return; }
    down = null;
    const r = renderer.domElement.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(pickables.filter((o) => o.visible && isShown(o)), false)[0];
    onPick?.(hit?.object?.userData?.partId || null);
  };
  const isShown = (o) => { let p = o; while (p) { if (!p.visible) return false; p = p.parent; } return true; };
  if (interactive) { renderer.domElement.addEventListener("pointerdown", onDown); renderer.domElement.addEventListener("pointerup", onUp); }

  function resize() {
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    const pr = renderer.getPixelRatio();
    if (renderer.domElement.width !== Math.round(w * pr) || renderer.domElement.height !== Math.round(h * pr)) {
      renderer.setSize(w, h, false); camera.aspect = w / h;
      const [ox, oy] = framing ? framing(w, h) : [0, 0];
      if (ox || oy) camera.setViewOffset(w, h, -w * ox, -h * oy, w, h); else camera.clearViewOffset();
      camera.updateProjectionMatrix(); dirty = true;
    }
  }

  function frame(t) {
    if (disposed) return;
    const dt = Math.min(0.05, (t - last) / 1000); last = t; time += dt;
    resize();
    const k = reduced ? 1 : 1 - Math.exp(-dt * 4.5);
    // hour with wrap
    let dh = target.hour - now.hour; if (dh > 12) dh -= 24; if (dh < -12) dh += 24;
    now.hour = (now.hour + dh * k + 24) % 24;
    for (const key of ["weather", "dust", "rinse", "wind", "soc", "tank", "explode"]) now[key] += (target[key] - now[key]) * k;

    // sky + light
    skyAt(now.hour, now.weather, skyState);
    sunDirection(now.hour, sunDir);
    sky.uniforms.zenith.value.copy(skyState.zenith); sky.uniforms.horizon.value.copy(skyState.horizon);
    sky.uniforms.sunDir.value.copy(sunDir); sky.uniforms.sunColor.value.copy(skyState.sunColor);
    sky.uniforms.sunAmount.value = sunDir.y > -0.05 ? 1 - now.weather * 0.9 : 0;
    sky.uniforms.stars.value = skyState.night * (1 - now.weather);
    scene.fog.color.copy(skyState.horizon);
    sun.position.copy(sunDir).multiplyScalar(40); sun.color.copy(skyState.sunColor);
    sun.intensity = sunDir.y > 0 ? skyState.sun : 0;
    hemi.intensity = skyState.hemi; hemi.color.copy(skyState.zenith).lerp(new THREE.Color(0xffffff), 0.55);
    moon.intensity = 0.4 * skyState.night;
    renderer.toneMappingExposure = skyState.exposure;
    cityMats.forEach((m) => { m.emissiveIntensity = 0.9 * skyState.night; });
    fill.intensity = 3.5 * skyState.night * (flows.discharge.amount + flows.home.amount * 0.5);

    // unit
    if (!reduced) rotor.rotation.y += dt * (0.25 + now.wind * 5.5);
    cells.forEach((c) => c.material.color.copy(c.userData.base).lerp(dustColor, now.dust * 0.75));
    leds.forEach((l, i) => { const on = now.soc * leds.length > i + 0.25; l.material.emissive.set(0xffb800); l.material.emissiveIntensity = on ? 1.6 : 0.05; });
    level.scale.y = Math.max(0.02, now.tank);
    registry.forEach((o) => {
      o.userData.destination.copy(o.userData.home).addScaledVector(o.userData.separated, now.explode * 1.25);
      o.position.lerp(o.userData.destination, reduced ? 1 : 1 - Math.exp(-dt * 6));
    });

    // flows
    for (const f of Object.values(flows)) f.update(reduced ? 0 : dt, k);
    // spray
    sprayMat.opacity = now.rinse * 0.9; sprayPts.visible = now.rinse > 0.02;
    if (sprayPts.visible) for (let i = 0; i < sprayN; i += 1) {
      if (sprayL[i] <= 0) {
        sprayL[i] = 0.6 + Math.random() * 0.6;
        spray.set([manifold.x + (Math.random() - 0.5) * 5.6, manifold.y + 0.1, manifold.z + 0.1], i * 3);
        sprayV.set([(Math.random() - 0.5) * 0.3, 0.6 + Math.random() * 0.6, 1.2 + Math.random() * 1.2], i * 3);
      }
      sprayL[i] -= dt;
      sprayV[i * 3 + 1] -= dt * 3.2;
      for (let a = 0; a < 3; a += 1) spray[i * 3 + a] += sprayV[i * 3 + a] * dt;
    }
    sprayGeo.attributes.position.needsUpdate = true;
    // rain
    rainMat.opacity = now.weather * 0.8; rain.visible = now.weather > 0.02;
    if (rain.visible && !reduced) {
      for (let i = 0; i < dropN; i += 1) {
        const o = i * 6; const fall = dt * 15;
        drops[o + 1] -= fall; drops[o + 4] -= fall; drops[o] -= fall * 0.08; drops[o + 3] -= fall * 0.08;
        if (drops[o + 1] < ROOF_Y) { const y = ROOF_Y + 16; drops[o + 1] = y; drops[o + 4] = y + 0.5; }
      }
      rainGeo.attributes.position.needsUpdate = true;
    }

    // camera
    if (!interactive || flying) {
      const ck = reduced ? 1 : 1 - Math.exp(-dt * 2.6);
      cam.pos.lerp(camTarget.pos, ck); cam.look.lerp(camTarget.look, ck); cam.fov += (camTarget.fov - cam.fov) * ck;
      const asp = camera.aspect, far = asp < 1 ? 1 + (1 - asp) * 0.95 : 1;
      camera.position.copy(cam.look).addScaledVector(_d.subVectors(cam.pos, cam.look), far);
      if (!interactive && !reduced) {
        // a slow breath so still frames never feel frozen
        const b = Math.sin(time * 0.15) * 0.25;
        camera.position.x += b; camera.position.y += b * 0.3; camera.position.z -= b;
      }
      controls.target.copy(cam.look);
      if (Math.abs(camera.fov - cam.fov) > 1e-3) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
      if (flying && cam.pos.distanceTo(camTarget.pos) < 0.05) flying = false;
    }
    if (interactive) controls.update();
    camera.lookAt(controls.target);
    renderer.render(scene, camera);
    dirty = false;
  }
  renderer.setAnimationLoop(frame);
  requestAnimationFrame(() => { if (!disposed) onReady?.(); });

  return {
    set, shot, shotBlend, highlight, project,
    get hour() { return now.hour; },
    registry,
    dispose() {
      disposed = true; renderer.setAnimationLoop(null);
      renderer.domElement.removeEventListener("pointerdown", onDown); renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      scene.traverse((o) => { o.geometry?.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.map?.dispose?.(); m.emissiveMap?.dispose?.(); m.dispose(); }); });
      env.dispose(); renderer.dispose(); renderer.domElement.remove();
    },
  };
}

export { SHOTS };
