// The WELOS twin stage: one renderer, one model, one rooftop, driven by simulation frames.
// Pages own the narrative; the stage only renders state it is given:
//   setFrame(frame)       simulated operating state (sun, wind, rain, dust, flows, gauges)
//   setPose(pose, ms)     camera choreography
//   setExplode(0..1)      service-direction exploded view
//   setFocus(keys|null)   highlight a set of parts, ghost the rest
//   setSelected(partId)   selection state
//   setSchematic(0..1)    physical → schematic transformation
//   setFlows(mode)        'off' | 'active' | 'all'
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { buildModel, GROUND_Y, MOVES, ROUTES, routeActivity } from "./model.js";
import { buildRooftop } from "./rooftop.js";

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const RM = typeof matchMedia !== "undefined" ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

export const COLORS = {
  amber: new THREE.Color("#f2a007"),
  ember: new THREE.Color("#ef6a12"),
  sky: new THREE.Color("#1aa7e0"),
  ink: new THREE.Color("#1b232c"),
  paper: new THREE.Color("#f3f1ec"),
  ghost: new THREE.Color("#e4e1da"),
  dust: new THREE.Color("#c4a679"),
};

export { webglAvailable } from "../ui/gl.js";

/* ---------------------------------------------------------------- sky dome */
const skyVS = `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`;
const skyFS = `uniform vec3 uTop, uHorizon, uGround, uSunDir, uSunCol; uniform float uSunGlow; varying vec3 vW;
  void main(){ vec3 d = normalize(vW - cameraPosition); float h = d.y;
    vec3 c = mix(uHorizon, uTop, smoothstep(0.0, 0.55, h));
    c = mix(c, uGround, smoothstep(0.0, -0.25, h));
    float s = max(dot(d, normalize(uSunDir)), 0.0);
    c += uSunCol * (pow(s, 600.0) * 1.2 + pow(s, 14.0) * 0.22 * uSunGlow);
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/* ---------------------------------------------------------------- flow tubes */
const flowVS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const flowFS = `uniform vec3 uColor; uniform float uOpacity, uTime, uRep, uActive, uReveal; varying vec2 vUv;
  void main(){ float x = vUv.x; if (x > uReveal) discard;
    float ph = fract(x*uRep - uTime);
    float pulse = smoothstep(0.0, 0.18, ph) * smoothstep(0.62, 0.18, ph);
    float a = mix(0.28, 0.55 + 0.45*pulse, uActive);
    vec3 col = mix(uColor, vec3(1.0), pulse*0.35*uActive);
    gl_FragColor = vec4(col, a*uOpacity);
    #include <colorspace_fragment>
  }`;

/* ---------------------------------------------------------------- dust overlay */
const dustVS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const dustFS = `uniform float uAmount, uWet, uSeed; uniform vec3 uColor; varying vec2 vUv;
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)) + uSeed)*43758.5453); }
  float n(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
    return mix(mix(h(i),h(i+vec2(1,0)),u.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x), u.y); }
  void main(){ vec2 p = vUv*vec2(9.,8.);
    float f = n(p)*.5 + n(p*2.3)*.3 + n(p*6.1)*.2;
    float grain = h(floor(vUv*vec2(420.,380.)));
    float edge = smoothstep(0.0, 0.25, vUv.y) ;            // dust collects toward the low edge
    float film = uAmount * (0.55 + 0.45*f) * (0.75 + 0.25*(1.0-edge));
    float speck = step(1.0 - uAmount*0.55, grain) * 0.35;
    float streak = uWet * smoothstep(0.55, 0.62, fract(vUv.x*14.0 + n(vUv*vec2(3.,30.))*0.6));
    float a = clamp(film*1.05 + speck*uAmount, 0.0, 0.8) * (1.0 - uWet*0.55);
    gl_FragColor = vec4(mix(uColor, uColor*0.82, grain), a + streak*0.05);
    #include <colorspace_fragment>
  }`;

export class Stage {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.opts = { env: "rooftop", orbit: false, ...opts };
    this.mobile = matchMedia("(max-width: 760px)").matches || matchMedia("(pointer: coarse)").matches;
    this.reduce = RM.matches;
    RM.addEventListener?.("change", (e) => { this.reduce = e.matches; });
    this.listeners = {};
    this.ok = false;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.mobile || devicePixelRatio < 2, alpha: true, powerPreference: "high-performance" });
    } catch (e) { this.error = e; return; }
    this.ok = true;
    const r = this.renderer;
    r.setPixelRatio(Math.min(devicePixelRatio, this.mobile ? 1.5 : 1.75));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 600);
    this.last = performance.now();
    this.time = 0;

    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.26;
    pmrem.dispose();
    this.shift = { v: 0, t: 0 };
    this.sunDir = new THREE.Vector3(0.3, 0.8, 0.2);
    this.#lights();
    this.#sky();
    const model = buildModel();
    Object.assign(this, model);
    this.scene.add(this.root);
    if (this.opts.env === "rooftop") {
      this.roof = buildRooftop({ mobile: this.mobile });
      this.scene.add(this.roof.group);
    } else this.#exhibitGround();
    this.#flows();
    this.#weather();
    this.#overlays();

    // state
    this.frame = null;
    this.explode = { v: 0, t: 0 };
    this.schem = { v: 0, t: 0 };
    this.flowMode = "off";
    this.flowFilter = null;
    this.focus = null;
    this.selected = null;
    this.hovered = null;
    this.rotorSpeed = 0;
    this.envFade = { v: 1, t: 1 };
    this.weather = { rain: 0, dust: 0, soil: 0.1, clean: 0, hour: 12 };
    this.pose = null;
    this.pick = { ray: new THREE.Raycaster(), ndc: new THREE.Vector2() };
    this.setPose({ pos: [15, 7.5, 19], target: [0, 0, 0], fov: 32 }, 0);

    if (this.opts.orbit) this.enableOrbit();
    this.#bindPointer();
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas.parentElement || canvas);
    this.visible = true;
    this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; }, { threshold: 0 });
    this.io.observe(canvas);
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  on(evt, fn) { (this.listeners[evt] ||= []).push(fn); return () => { this.listeners[evt] = this.listeners[evt].filter((f) => f !== fn); }; }
  emit(evt, ...a) { (this.listeners[evt] || []).forEach((f) => f(...a)); }

  /* ------------------------------------------------------------ setup */
  #lights() {
    this.hemi = new THREE.HemisphereLight(0xfdfbf7, 0xcfc8bb, 0.75);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.6);
    this.sun.castShadow = true;
    const s = this.mobile ? 1024 : 2048;
    this.sun.shadow.mapSize.set(s, s);
    Object.assign(this.sun.shadow.camera, { left: -16, right: 16, top: 14, bottom: -14, near: 1, far: 90 });
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);
    this.fill = new THREE.DirectionalLight(0xdfe9f5, 0.45);
    this.fill.position.set(-14, 9, 12);
    this.scene.add(this.fill);
  }

  #sky() {
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: skyVS, fragmentShader: skyFS, side: THREE.BackSide, depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color("#b9d3e8") }, uHorizon: { value: new THREE.Color("#f1ede4") }, uGround: { value: new THREE.Color("#ded9cf") },
        uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2) }, uSunCol: { value: new THREE.Color("#fff3d6") }, uSunGlow: { value: 1 },
      },
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), this.skyMat);
    this.sky.frustumCulled = false;
    if (this.opts.env === "rooftop") this.scene.add(this.sky);
    this.scene.fog = this.opts.env === "rooftop" ? new THREE.Fog(0xf1ede4, 60, 210) : null;
  }

  #exhibitGround() {
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.14 }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = GROUND_Y; shadow.receiveShadow = true;
    this.scene.add(shadow);
    const gridMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uColor: { value: new THREE.Color(0x1b232c) }, uAlpha: { value: 0.1 } },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uAlpha; varying vec3 vW;
        float line(float v, float s){ float c = v/s; float d = abs(fract(c-.5)-.5)/fwidth(c); return 1.-min(d,1.); }
        void main(){ float g = max(line(vW.x,.5), line(vW.z,.5))*.5 + max(line(vW.x,2.5), line(vW.z,2.5))*.7;
          float f = 1. - smoothstep(4.5, 12., length(vW.xz));
          gl_FragColor = vec4(uColor, clamp(g,0.,1.)*f*uAlpha);
          #include <colorspace_fragment>
        }`,
    });
    const grid = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), gridMat);
    grid.rotation.x = -Math.PI / 2; grid.position.y = GROUND_Y + 0.002;
    this.scene.add(grid);
    this.grid = grid;
  }

  #flows() {
    this.flowList = Object.entries(ROUTES).map(([id, def]) => {
      const mat = new THREE.ShaderMaterial({
        vertexShader: flowVS, fragmentShader: flowFS, transparent: true, depthTest: false, depthWrite: false,
        uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: 0 }, uTime: { value: 0 }, uRep: { value: 8 }, uActive: { value: 0 }, uReveal: { value: 1 } },
      });
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
      mesh.renderOrder = 30; mesh.frustumCulled = false; mesh.visible = false;
      this.scene.add(mesh);
      const color = def.kind === "water" ? COLORS.sky : def.kind === "signal" ? COLORS.ink : COLORS.amber;
      mat.uniforms.uColor.value.copy(color);
      return { id, def, mat, mesh, sig: "", v: def.pts.map(() => new THREE.Vector3()), op: 0, act: 0, phase: 0, dir: 1, speed: 0.5, reveal: 1 };
    });
    this.flowById = Object.fromEntries(this.flowList.map((f) => [f.id, f]));
  }

  #weather() {
    // rain streaks in a volume around the unit
    const N = this.mobile ? 500 : 1100;
    const pos = new Float32Array(N * 6);
    this.rainSeed = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const x = -9 + ((i * 7919) % 1000) / 1000 * 20, z = -8 + ((i * 104729) % 1000) / 1000 * 17, y = ((i * 1299709) % 1000) / 1000 * 14;
      this.rainSeed.set([x, y, z], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x4f7896, transparent: true, opacity: 0, depthWrite: false }));
    this.rain.frustumCulled = false; this.rain.visible = false;
    this.scene.add(this.rain);

    // airborne dust motes
    const M = this.mobile ? 260 : 600;
    const dp = new Float32Array(M * 3);
    for (let i = 0; i < M; i++) dp.set([-14 + ((i * 7919) % 997) / 997 * 30, GROUND_Y + ((i * 6007) % 991) / 991 * 9, -12 + ((i * 3557) % 983) / 983 * 24], i * 3);
    const dg = new THREE.BufferGeometry(); dg.setAttribute("position", new THREE.BufferAttribute(dp, 3));
    this.motes = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xc8ab7f, size: 0.05, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true }));
    this.motes.frustumCulled = false;
    this.scene.add(this.motes);

    // rinse spray from the manifold nozzles, running down the canopy
    const manifold = this.KEY["cleaning-manifold"][0];
    const S = 10 * 26;
    const sp = new Float32Array(S * 3);
    const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    this.spray = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0x6cc4ea, size: 0.07, transparent: true, opacity: 0, depthWrite: false }));
    this.spray.frustumCulled = false;
    manifold.add(this.spray);
    this.sprayCount = S;
  }

  #rinseSheet() {
    // a thin moving water film down the canopy slope, driven by the rinse state
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uT: { value: 0 }, uA: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform float uT, uA; varying vec2 vUv;
        float h(float x){ return fract(sin(x*91.7)*43758.5); }
        void main(){
          float lane = floor(vUv.x*60.);
          float speed = .55 + h(lane)*.5;
          float y = fract(vUv.y*3. + uT*speed + h(lane+3.));
          float streak = smoothstep(.0,.08,y)*smoothstep(.45,.08,y);
          float front = smoothstep(uA*1.15 - .15, uA*1.15, 1. - vUv.y);
          float a = (0.18 + streak*.55) * (1. - front) * min(1., uA*3.);
          gl_FragColor = vec4(mix(vec3(.62,.84,.95), vec3(1.), streak*.6), a);
          #include <colorspace_fragment>
        }`,
    });
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(5.75, 3.45), mat);
    sheet.rotation.x = -Math.PI / 2;
    sheet.position.set(0, 0.13, 0.05);
    sheet.renderOrder = 8;
    this.KEY["pv-array"][0].add(sheet);
    this.rinseMat = mat;
  }

  #overlays() {
    this.#rinseSheet();
    // dust film on each PV module, and a selection halo material
    this.dustMats = this.modules.map((g, i) => {
      const mat = new THREE.ShaderMaterial({
        vertexShader: dustVS, fragmentShader: dustFS, transparent: true, depthWrite: false,
        uniforms: { uAmount: { value: 0 }, uWet: { value: 0 }, uSeed: { value: i * 3.17 }, uColor: { value: COLORS.dust.clone() } },
        polygonOffset: true, polygonOffsetFactor: -2,
      });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 1.61), mat);
      plane.rotation.x = -Math.PI / 2; plane.position.y = 0.0625; plane.renderOrder = 5;
      g.add(plane);
      return mat;
    });
  }

  /* ------------------------------------------------------------ orbit */
  enableOrbit() {
    if (this.controls) return this.controls;
    const c = new OrbitControls(this.camera, this.canvas);
    c.enableDamping = true; c.dampingFactor = 0.08;
    c.minDistance = 6; c.maxDistance = 46;
    c.maxPolarAngle = Math.PI * 0.49;
    c.target.set(0, 0, 0);
    c.addEventListener("start", () => { this.pose = null; this.emit("interact"); });
    this.controls = c;
    return c;
  }

  /* ------------------------------------------------------------ public API */
  setPose({ pos, target, fov }, ms = 1400) {
    const to = { pos: new THREE.Vector3(...pos), target: new THREE.Vector3(...target), fov: fov ?? this.camera.fov };
    const from = { pos: this.camera.position.clone(), target: this.controls ? this.controls.target.clone() : (this.pose?.cur?.target?.clone() || to.target.clone()), fov: this.camera.fov };
    if (!ms || this.reduce) ms = 0;
    this.pose = { from, to, t0: performance.now(), ms, cur: { target: from.target.clone() } };
    if (!ms) this.#applyPose(1);
  }
  /** Continuous camera (scroll scrubbing): no tween, the page passes interpolated poses. */
  setPoseNow({ pos, target, fov }) {
    this.pose = null;
    this.camera.position.set(...pos);
    const t = new THREE.Vector3(...target);
    if (this.controls) this.controls.target.copy(t);
    this.camTarget = t;
    if (fov && fov !== this.camera.fov) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    this.camera.lookAt(t);
  }
  #applyPose(u) {
    const { from, to } = this.pose;
    const e = easeInOut(u);
    // arc the camera slightly upward through the move
    this.camera.position.lerpVectors(from.pos, to.pos, e);
    this.camera.position.y += Math.sin(Math.PI * e) * from.pos.distanceTo(to.pos) * 0.06;
    const t = new THREE.Vector3().lerpVectors(from.target, to.target, e);
    this.pose.cur.target = t; this.camTarget = t;
    if (this.controls) this.controls.target.copy(t);
    this.camera.fov = from.fov + (to.fov - from.fov) * e; this.camera.updateProjectionMatrix();
    this.camera.lookAt(t);
    if (u >= 1) this.pose = null;
  }

  /** Shift the composition horizontally (fraction of width; + moves the model right). */
  setShift(f, immediate = false) { this.shift.t = f; if (immediate || this.reduce) this.shift.v = f; }

  setFrame(frame) { this.frame = frame; this.activity = routeActivity(frame); }
  setExplode(v, immediate = false) { this.explode.t = clamp(v); if (immediate || this.reduce) this.explode.v = this.explode.t; }
  setSchematic(v, immediate = false) { this.schem.t = clamp(v); if (immediate || this.reduce) this.schem.v = this.schem.t; if (v > 0) this.#ensureEdges(); }
  setEnvironment(v) { this.envFade.t = clamp(v); }
  /** 'off' | 'active' (driven by frame) | 'all' (network overview). Optional filter: Set of route ids or kinds. */
  setFlows(mode, filter = null) { this.flowMode = mode; this.flowFilter = filter; }
  setFocus(keys) { this.focus = keys ? new Set(keys) : null; }
  setSelected(id) { this.selected = id; }
  setHoverEnabled(v) { this.hoverEnabled = v; }
  /** Force the weather layer independently of a frame (self-cleaning close-up). */
  setWeather(w) { this.weatherOverride = w ? { ...this.weatherOverride, ...w } : null; }

  /** Screen position of a point attached to a part (follows explode). */
  screenOf(key, local = [0, 0, 0], out = {}) {
    const v = this.anchor(key, local, new THREE.Vector3()).project(this.camera);
    out.x = (v.x * 0.5 + 0.5) * this.w; out.y = (-v.y * 0.5 + 0.5) * this.h;
    out.visible = v.z < 1 && v.z > -1;
    return out;
  }
  anchor(key, p, out) {
    if (!key) return out.set(...p);
    const o = this.KEY[key]?.[0];
    if (!o) return out.set(...p);
    const w = o.getWorldPosition(new THREE.Vector3());
    return out.set(p[0], p[1], p[2]).add(w).sub(o.userData.homeWorld);
  }
  /** Part centre in world space (for camera focus). */
  centerOf(key) {
    const objs = this.KEY[key]; if (!objs) return null;
    const box = new THREE.Box3(); objs.forEach((o) => box.expandByObject(o));
    return { center: box.getCenter(new THREE.Vector3()), size: box.getSize(new THREE.Vector3()).length() };
  }
  dolly(f, ms = 450) {
    const t = this.camTarget || new THREE.Vector3();
    const pos = this.camera.position.clone().sub(t).multiplyScalar(f).add(t);
    this.setPose({ pos: pos.toArray(), target: t.toArray() }, ms);
  }
  /** Show or hide optional modules (Studio). keys → visible. Scales in/out along y. */
  setModules(mods) {
    this.modVis ||= {};
    const groups = { wind: ["vawt-rotor", "wind-generator", "wind-brake", "wind-mast"], rinse: ["cleaning-manifold"], battery: ["lifepo4-battery"] };
    for (const [m, on] of Object.entries(mods)) for (const k of groups[m] || []) for (const o of this.KEY[k] || []) { o.userData.visT = on ? 1 : 0; o.userData.visV ??= 1; }
    this.modVis = { ...this.modVis, ...mods };
  }
  /** Additional canopy bays across the roof, to convey system scale (Studio). */
  setBays(n) {
    if (!this.roof) return;
    if (!this.bays) {
      const g = new THREE.Group();
      const cell = this.modules[0].children.find((m) => m.isMesh && m.userData.geoIndex === 10);
      const frameMesh = this.modules[0].children.find((m) => m.isMesh && m.userData.geoIndex === 9);
      const slots = [];
      for (const z of [-8.5, -4.6]) for (const x of [-6.2, 0.4, 7.0]) slots.push([x, z]);
      for (const x of [-12.2]) for (const z of [3.2, 7.4]) slots.push([x, z]);
      slots.push([12.4, 6.2], [12.4, 1.8]);
      this.baySlots = slots.map(([x, z]) => {
        const bay = new THREE.Group(); bay.position.set(x, GROUND_Y, z);
        const top = new THREE.Group(); top.position.y = 3.95; top.rotation.x = -0.12; bay.add(top);
        for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
          const f = frameMesh.clone(); f.position.set(-1.92 + i * 1.92, 0, -0.88 + j * 1.76); top.add(f);
          const c = cell.clone(); c.position.set(-1.92 + i * 1.92, 0.054, -0.88 + j * 1.76); top.add(c);
        }
        const rail = new THREE.Mesh(new THREE.BoxGeometry(5.95, 0.12, 0.1), new THREE.MeshStandardMaterial({ color: "#d99a00", roughness: 0.5, metalness: 0.4 }));
        rail.position.set(0, -0.1, 1.82); top.add(rail);
        const postMat = new THREE.MeshStandardMaterial({ color: "#5e6a76", roughness: 0.4, metalness: 0.7 });
        for (const [px, pz] of [[-2.7, -1.5], [2.7, -1.5], [-2.7, 1.5], [2.7, 1.5]]) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 3.9, 10), postMat);
          post.position.set(px, 1.95, pz); post.castShadow = true; bay.add(post);
        }
        bay.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        bay.userData.v = 0; bay.userData.t = 0; bay.visible = false;
        g.add(bay);
        return bay;
      });
      this.bays = g; this.scene.add(g);
    }
    this.baySlots.forEach((b, i) => { b.userData.t = i < n ? 1 : 0; });
    return this.baySlots.length;
  }
  /** Frame a set of parts from the current viewing direction. */
  frameKeys(keys, ms = 1200, { distance = 2.3, lift = 0.25 } = {}) {
    const box = new THREE.Box3();
    keys.forEach((k) => (this.KEY[k] || []).forEach((o) => box.expandByObject(o)));
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length();
    const dir = this.camera.position.clone().sub(this.camTarget || new THREE.Vector3()).normalize();
    dir.y = Math.max(dir.y, lift); dir.normalize();
    const pos = c.clone().add(dir.multiplyScalar(clamp(size * distance, 9, 30)));
    this.setPose({ pos: pos.toArray(), target: c.toArray() }, ms);
  }
  focusPart(key, ms = 1100) {
    const c = this.centerOf(key); if (!c) return;
    const dir = this.camera.position.clone().sub(this.camTarget || new THREE.Vector3()).normalize();
    const dist = clamp(c.size * 2.4, 4.5, 16);
    const pos = c.center.clone().add(dir.multiplyScalar(dist));
    pos.y = Math.max(pos.y, c.center.y + 1.2);
    this.setPose({ pos: pos.toArray(), target: c.center.toArray() }, ms);
  }

  resize() {
    if (!this.ok) return;
    const el = this.canvas.parentElement || this.canvas;
    const w = el.clientWidth || innerWidth, h = el.clientHeight || innerHeight;
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.shift.applied = null;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.disposed = true;
    this.ro?.disconnect(); this.io?.disconnect();
    this.controls?.dispose();
    this.renderer?.dispose();
  }

  /* ------------------------------------------------------------ picking */
  #bindPointer() {
    const el = this.canvas;
    let down = null;
    el.addEventListener("pointermove", (e) => {
      if (!this.hoverEnabled) return;
      const id = this.#pickAt(e);
      if (id !== this.hovered) { this.hovered = id; el.style.cursor = id ? "pointer" : ""; this.emit("hover", id, e); }
    });
    el.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; });
    el.addEventListener("pointerup", (e) => {
      if (!this.hoverEnabled || !down) return;
      if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      this.emit("pick", this.#pickAt(e));
    });
    el.addEventListener("pointerleave", () => { if (this.hovered) { this.hovered = null; this.emit("hover", null); } });
  }
  #pickAt(e) {
    const r = this.canvas.getBoundingClientRect();
    this.pick.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.pick.ray.setFromCamera(this.pick.ndc, this.camera);
    const hit = this.pick.ray.intersectObjects(this.meshes, false).find((h) => h.object.visible && h.object.userData.pickId);
    return hit ? hit.object.userData.pickId : null;
  }

  /* ------------------------------------------------------------ schematic edges */
  #ensureEdges() {
    if (this.edges) return;
    this.edges = [];
    const mat = new THREE.LineBasicMaterial({ color: 0x1b232c, transparent: true, opacity: 0, depthWrite: false });
    this.edgeMat = mat;
    for (const m of this.meshes) {
      if (m.geometry.attributes.position.count > 6000) continue;
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 28), mat);
      l.raycast = () => null; l.visible = false;
      m.add(l); this.edges.push(l);
    }
  }

  /* ------------------------------------------------------------ frame loop */
  loop() {
    if (this.disposed) return;
    requestAnimationFrame(this.loop);
    const now = performance.now(); const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    if (!this.visible || document.hidden) return;
    this.time += dt;
    const k = 1 - Math.exp(-dt * 5);

    if (this.pose) this.#applyPose(Math.min(1, (performance.now() - this.pose.t0) / this.pose.ms));
    else if (this.controls) this.controls.update();

    this.explode.v += (this.explode.t - this.explode.v) * (this.reduce ? 1 : k);
    this.schem.v += (this.schem.t - this.schem.v) * (this.reduce ? 1 : k * 0.8);
    this.envFade.v += (this.envFade.t - this.envFade.v) * k;
    if (Math.abs(this.shift.t - this.shift.v) > 1e-4 || this.shift.applied !== this.shift.v) {
      this.shift.v += (this.shift.t - this.shift.v) * (this.reduce ? 1 : k);
      const ox = -this.shift.v * this.w;
      if (Math.abs(ox) < 0.5) this.camera.clearViewOffset(); else this.camera.setViewOffset(this.w, this.h, ox, 0, this.w, this.h);
      this.shift.applied = this.shift.v;
    }

    this.#updateExplode();
    if (this.modVis) for (const key of ["vawt-rotor", "wind-generator", "wind-brake", "wind-mast", "cleaning-manifold", "lifepo4-battery"]) for (const o of this.KEY[key] || []) {
      if (o.userData.visT == null) continue;
      o.userData.visV += (o.userData.visT - o.userData.visV) * k * 1.2;
      const v = Math.max(0.001, o.userData.visV);
      o.scale.set(1, v, 1); o.visible = v > 0.01;
    }
    if (this.baySlots) this.baySlots.forEach((b, i) => {
      const d = b.userData; d.v += (d.t - d.v) * k * (this.reduce ? 10 : 0.9);
      b.visible = d.v > 0.01;
      b.position.y = GROUND_Y + (1 - smooth(d.v)) * 6; b.scale.setScalar(0.6 + 0.4 * smooth(d.v));
    });
    this.#updateEnvironment(dt, k);
    this.#updateMaterials(k);
    this.#updateFlows(dt, k);
    this.emit("tick", dt);
    this.renderer.render(this.scene, this.camera);
  }

  #updateExplode() {
    const e = this.explode.v;
    for (const [key, off, order] of MOVES) {
      const w = smooth((e - order * 0.55) / 0.45);
      for (const o of this.KEY[key] || []) {
        o.position.set(o.userData.home.x + off[0] * w, o.userData.home.y + off[1] * w, o.userData.home.z + off[2] * w);
      }
    }
  }

  #updateEnvironment(dt, k) {
    const f = this.frame;
    const w = this.weather;
    const env = f?.env;
    const ov = this.weatherOverride || {};
    const hour = ov.hour ?? env?.hour ?? 13;
    const target = {
      rain: ov.rain ?? (env ? clamp(env.rain / 8) : 0),
      dust: ov.haze ?? (env ? clamp((0.95 - env.clearness) / 0.35) * (env.rain > 0.2 ? 0 : 1) : 0),
      soil: ov.soiling ?? (f ? f.soiling : 0.1),
      clean: ov.rinse ?? (f?.cleaningRan ? 1 : 0),
    };
    for (const key in target) w[key] += (target[key] - w[key]) * (this.reduce ? 1 : k * (key === "soil" ? 0.6 : 1));
    w.hour += (hour - w.hour) * (this.reduce ? 1 : k);

    // sun from the simulation's solar geometry: north = -z, east = +x
    const sp = env?.sun || ov.sun || { elevationDeg: 55, azimuthDeg: 200 };
    const el = (sp.elevationDeg * Math.PI) / 180, az = (sp.azimuthDeg * Math.PI) / 180;
    const want = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    this.sunDir.lerp(want, this.reduce || !this.sunInit ? 1 : 1 - Math.exp(-dt * 2.2)).normalize();
    this.sunInit = true;
    const dir = this.sunDir;
    const elNow = (Math.asin(clamp(dir.y, -1, 1)) * 180) / Math.PI;
    const day = smooth((elNow + 4) / 14);
    const low = 1 - smooth(elNow / 28);
    const clear = env ? env.clearness : 0.95;
    const lightDir = dir.y < 0.06 ? new THREE.Vector3(dir.x, 0.06, dir.z).normalize() : dir;
    this.sun.position.copy(lightDir).multiplyScalar(40);
    this.sun.target.position.set(0, 0, 0);
    this.sun.intensity = 0.1 + day * (0.9 + 3.5 * clear);
    this.sun.color.setRGB(1, 1 - low * 0.18, 1 - low * 0.4);
    this.hemi.intensity = 0.14 + day * 0.32;
    this.hemi.color.setRGB(0.6 + day * 0.39, 0.66 + day * 0.32, 0.8 + day * 0.17);
    this.fill.intensity = 0.12 + day * 0.18;
    this.renderer.toneMappingExposure = 0.82 + day * 0.14;

    const u = this.skyMat.uniforms;
    const overcast = 1 - clear;
    u.uTop.value.setRGB(0.05 + day * (0.68 - overcast * 0.1), 0.08 + day * (0.75 - overcast * 0.05), 0.16 + day * (0.75 - overcast * 0.1));
    u.uHorizon.value.setRGB(0.16 + day * 0.78 + low * day * 0.02, 0.18 + day * 0.74 - low * day * 0.06, 0.25 + day * 0.64 - low * day * 0.14);
    u.uGround.value.setRGB(0.12 + day * 0.75, 0.13 + day * 0.72, 0.15 + day * 0.66);
    if (w.dust > 0.01) { u.uHorizon.value.lerp(new THREE.Color(0.86, 0.78, 0.64), w.dust * 0.6); u.uTop.value.lerp(new THREE.Color(0.8, 0.76, 0.68), w.dust * 0.5); }
    if (w.rain > 0.01) { u.uTop.value.lerp(new THREE.Color(0.48, 0.52, 0.56), w.rain * 0.8); u.uHorizon.value.lerp(new THREE.Color(0.62, 0.64, 0.66), w.rain * 0.7); }
    u.uSunDir.value.copy(dir); u.uSunGlow.value = day * clear;
    if (this.scene.fog) { this.scene.fog.color.copy(u.uHorizon.value); this.scene.fog.near = 34 - w.dust * 18; this.scene.fog.far = 250 - w.dust * 150 - w.rain * 110; }

    // rotor speed: braked or freewheeling according to the controller
    const brake = f ? f.result.outputs.windBrake : false;
    const v = f ? f.sensors.windSpeedMs : 3.2;
    const targetW = brake ? 0 : (this.reduce ? 0 : Math.min(9, v * 0.85));
    this.rotorSpeed += (targetW - this.rotorSpeed) * (1 - Math.exp(-dt * (brake ? 1.6 : 0.8)));
    this.rotor.rotation.y += this.rotorSpeed * dt;
    if (this.roof && !this.reduce) {
      const ac = f ? clamp(f.result.power.demandKw / 2.5) : 0.6;
      this.roof.fans.forEach((fan, i) => { fan.rotation.y += (6 + i) * ac * dt; });
    }

    // rain
    if (w.rain > 0.01) {
      this.rain.visible = true;
      this.rain.material.opacity = 0.35 + w.rain * 0.5;
      const a = this.rain.geometry.attributes.position.array;
      const n = this.rainSeed.length / 3;
      const fall = this.time * 12;
      const drift = (f?.sensors.windSpeedMs || 3) * 0.04;
      for (let i = 0; i < n; i++) {
        const x = this.rainSeed[i * 3], z = this.rainSeed[i * 3 + 2];
        let y = GROUND_Y + ((this.rainSeed[i * 3 + 1] - fall) % 14 + 14) % 14;
        const visible = i / n < w.rain + 0.05;
        const len = visible ? 0.55 : 0;
        a.set([x, y, z, x - drift * len * 4, y + len, z], i * 6);
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    } else this.rain.visible = false;

    // airborne dust
    this.motes.material.opacity = w.dust * 0.55;
    if (w.dust > 0.01 && !this.reduce) {
      const a = this.motes.geometry.attributes.position.array;
      const drift = 0.25 + (f?.sensors.windSpeedMs || 3) * 0.12;
      for (let i = 0; i < a.length; i += 3) {
        a[i] += drift * dt; if (a[i] > 16) a[i] = -14;
        a[i + 1] += Math.sin(this.time * 0.7 + i) * 0.002;
      }
      this.motes.geometry.attributes.position.needsUpdate = true;
    }

    // dust film on the modules
    const amount = clamp((w.soil - 0.04) / 0.3);
    this.dustMats.forEach((m) => { m.uniforms.uAmount.value = amount; m.uniforms.uWet.value = Math.max(w.clean, w.rain * 0.6); });

    // rinse spray along the manifold, falling down-slope over the canopy
    this.spray.material.opacity = w.clean * 0.9;
    this.rinseMat.uniforms.uA.value = w.clean;
    if (!this.reduce) this.rinseMat.uniforms.uT.value = this.time * 0.9;
    if (w.clean > 0.01) {
      const a = this.spray.geometry.attributes.position.array;
      for (let i = 0; i < this.sprayCount; i++) {
        const nozzle = i % 10, j = Math.floor(i / 10);
        const t = ((this.time * 0.9 + j / 26) % 1);
        const x = -2.6 + nozzle * 0.58 + Math.sin(i * 12.9) * 0.18;
        a.set([x, 0.025 - t * 0.02 + Math.sin(t * 9 + i) * 0.006, 0.09 + t * 3.4], i * 3);
      }
      this.spray.geometry.attributes.position.needsUpdate = true;
    }

    // data-bound instruments
    const tank = f ? f.tank / 100 : 0.6;
    this.gaugeFill.scale.y = Math.max(0.01, tank * 1.26);
    this.gaugeFill.position.y = -0.63 + (tank * 1.26) / 2;
    const soc = f ? f.soc : 60;
    this.leds.forEach((m, i) => {
      const lit = soc > i * 25 + 5;
      m.material.emissiveIntensity = lit ? 0.9 : 0.02;
      m.material.color.set(lit ? (soc < 25 ? "#ef6a12" : "#1aa7e0") : "#2a323a");
      m.material.emissive.set(lit ? (soc < 25 ? "#ef6a12" : "#1aa7e0") : "#000000");
    });

    // fade the city context in exhibit compositions
    if (this.roof) {
      const vis = this.envFade.v > 0.02;
      this.roof.group.visible = vis;
      this.sky.visible = true;
    }
  }

  #updateMaterials(k) {
    const s = this.schem.v;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 3.2);
    for (const m of this.meshes) {
      if (m.userData.led) continue;
      const key = m.userData.dimKey, pid = m.userData.pickId;
      const inFocus = !this.focus || this.focus.has(key) || this.focus.has(pid);
      const sel = this.selected && (pid === this.selected || key === this.selected);
      const hov = this.hovered && pid === this.hovered && !sel;
      m.userData.dim += ((inFocus ? 0 : 1) - m.userData.dim) * k;
      m.userData.sel += ((sel ? 1 : hov ? 0.45 : 0) - m.userData.sel) * k * 1.6;
      const mat = m.material;
      mat.color.copy(m.userData.baseColor).lerp(COLORS.ghost, m.userData.dim * 0.86).lerp(COLORS.paper, s * 0.92);
      mat.emissive.copy(m.userData.baseEmissive).multiplyScalar(1 - m.userData.dim).lerp(COLORS.amber, m.userData.sel * (0.55 + 0.25 * pulse));
      mat.emissiveIntensity = m.userData.baseEI * (1 - m.userData.dim) + m.userData.sel * 0.5;
      const fade = m.userData.dim * 0.55 + s * 0.22;
      const transparent = fade > 0.01;
      if (mat.transparent !== transparent) { mat.transparent = transparent; mat.needsUpdate = true; }
      mat.opacity = 1 - fade;
      mat.depthWrite = fade < 0.3;
      m.castShadow = fade < 0.3;
    }
    if (this.edges) {
      this.edgeMat.opacity = s * 0.85;
      const vis = s > 0.01;
      if (this.edgesVisible !== vis) { this.edges.forEach((l) => { l.visible = vis; }); this.edgesVisible = vis; }
    }
    if (this.roof) {
      const env = this.envFade.v;
      if (!this.roofMats) { this.roofMats = new Set(); this.roof.group.traverse((o) => { if (o.isMesh) this.roofMats.add(o.material); }); }
      for (const mat of this.roofMats) {
        mat.transparent = env < 0.999; mat.opacity = env; mat.depthWrite = env > 0.5;
      }
    }
  }

  #updateFlows(dt, k) {
    const act = this.activity || {};
    for (const F of this.flowList) {
      const a = act[F.id];
      const filtered = (this.flowFilter && !(this.flowFilter.has(F.id) || this.flowFilter.has(F.def.kind))) || (F.id === "building" && this.opts.env !== "rooftop");
      let target = 0, active = 0;
      if (this.flowMode === "all" && !filtered) { target = F.def.kind === "signal" ? 0.5 : 0.9; active = a ? (a.on ? 1 : 0.15) : 1; }
      else if (this.flowMode === "active" && !filtered && a?.on) { target = F.def.kind === "signal" ? 0.45 : 0.95; active = 1; }
      else if (this.flowMode === "trace" && !filtered) { target = 0.95; active = a?.on ? 1 : 0.2; }
      F.op += (target - F.op) * k;
      F.act += (active - F.act) * k;
      if (F.op < 0.01) { F.mesh.visible = false; continue; }
      F.mesh.visible = true;
      // rebuild the tube when anchors move (explode)
      let sig = "";
      F.def.pts.forEach(([key, p], i) => { this.anchor(key, p, F.v[i]); sig += F.v[i].x.toFixed(2) + F.v[i].y.toFixed(2) + F.v[i].z.toFixed(2); });
      if (sig !== F.sig) {
        F.sig = sig;
        const curve = new THREE.CatmullRomCurve3(F.v.map((v) => v.clone()), false, "centripetal", 0.5);
        F.mesh.geometry.dispose();
        const r = F.def.kind === "signal" ? 0.018 : 0.05;
        F.mesh.geometry = new THREE.TubeGeometry(curve, Math.max(24, F.v.length * 18), r, 6, false);
        F.mat.uniforms.uRep.value = Math.max(2, curve.getLength() / 0.45);
      }
      const dir = a?.dir ?? 1;
      const speed = 0.25 + (a?.level ?? 0.4) * 0.9;
      if (!this.reduce) F.phase += dir * speed * dt;
      F.mat.uniforms.uTime.value = F.phase;
      F.mat.uniforms.uOpacity.value = F.op * (1 - this.schem.v * 0) ;
      F.mat.uniforms.uActive.value = F.act;
    }
  }
}
