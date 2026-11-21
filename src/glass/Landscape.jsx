import React, { useMemo } from "react";

// Layered, deterministic SVG landscape for the hero. All layers share one viewBox and
// "slice" scaling so they stay aligned at every aspect ratio. The WELOS watermark is
// rendered by the page between <SkyLayer> and <FrontLayer>, so ridges occlude it.

const W = 1600;
const H = 1000;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ridged mountain silhouette: sharp peaks from folded sines plus jitter. */
function ridge(seed, base, amp, { freq = 1, sharp = 1.6, step = 8, jitter = 6 } = {}) {
  const r = rng(seed);
  const ph = [r() * 6.28, r() * 6.28, r() * 6.28, r() * 6.28];
  const pts = [];
  for (let x = -20; x <= W + 20; x += step) {
    const u = x / W;
    const n =
      0.55 * Math.pow(1 - Math.abs(Math.sin(u * 3.1 * freq + ph[0])), sharp) +
      0.3 * Math.pow(1 - Math.abs(Math.sin(u * 7.3 * freq + ph[1])), sharp) +
      0.15 * Math.sin(u * 17.0 * freq + ph[2]) +
      0.06 * Math.sin(u * 41 * freq + ph[3]);
    pts.push([x, base - amp * n + (r() - 0.5) * jitter]);
  }
  return pts;
}

const pathOf = (pts, bottom = H + 20) =>
  `M${pts[0][0]},${bottom} ` + pts.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(" ") + ` L${pts[pts.length - 1][0]},${bottom} Z`;

/** Designed summits with natural jagged detail (midpoint displacement between them). */
function composedRidge(seed, summits, roughness = 0.2, depth = 6) {
  const r = rng(seed);
  let pts = summits.map(([x, y]) => [x, y]);
  for (let d = 0; d < depth; d += 1) {
    const next = [pts[0]];
    for (let i = 1; i < pts.length; i += 1) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const len = Math.hypot(x1 - x0, y1 - y0);
      next.push([(x0 + x1) / 2 + (r() - 0.5) * len * 0.12, (y0 + y1) / 2 + (r() - 0.5) * len * roughness], [x1, y1]);
    }
    pts = next;
  }
  return pts;
}

// One summit under each letter of the watermark (viewBox units), valleys between.
const SUMMITS = [[-30, 450], [110, 372], [255, 336], [395, 418], [530, 322], [665, 425], [770, 332], [890, 400], [1005, 318], [1130, 420], [1250, 334], [1385, 390], [1500, 346], [1630, 450]];

/** Smooth rolling hill line. */
function hill(seed, base, amp, freq = 1) {
  const r = rng(seed);
  const a = r() * 6.28, b = r() * 6.28;
  const pts = [];
  for (let x = -20; x <= W + 20; x += 16) {
    const u = x / W;
    pts.push([x, base - amp * (0.6 * Math.sin(u * 4.2 * freq + a) + 0.4 * Math.sin(u * 9.7 * freq + b))]);
  }
  return pts;
}

function Defs() {
  return <defs>
    <linearGradient id="ls-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#b9c6c1" />
      <stop offset=".45" stopColor="#d9e1dd" />
      <stop offset="1" stopColor="#e8ede9" />
    </linearGradient>
    <radialGradient id="ls-sun" cx=".7" cy=".18" r=".6">
      <stop offset="0" stopColor="#fff9e6" stopOpacity=".95" />
      <stop offset=".35" stopColor="#fff3d1" stopOpacity=".35" />
      <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
    </radialGradient>
    <linearGradient id="ls-far" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#c3cec9" />
      <stop offset="1" stopColor="#a2b2aa" />
    </linearGradient>
    <linearGradient id="ls-snow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#f9fbfa" />
      <stop offset=".06" stopColor="#dde5e1" />
      <stop offset=".16" stopColor="#9fb0a8" />
      <stop offset=".3" stopColor="#7f948a" />
      <stop offset=".5" stopColor="#c3cec9" />
      <stop offset="1" stopColor="#dde4e0" />
    </linearGradient>
    <linearGradient id="ls-mid" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#6c8865" />
      <stop offset="1" stopColor="#334d2e" />
    </linearGradient>
    <linearGradient id="ls-near" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#557245" />
      <stop offset="1" stopColor="#2a4126" />
    </linearGradient>
    <linearGradient id="ls-valley" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#4c6a3a" />
      <stop offset="1" stopColor="#24361f" />
    </linearGradient>
    <linearGradient id="ls-sunwash" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stopColor="#ffe9a8" stopOpacity="0" />
      <stop offset=".6" stopColor="#ffe9a8" stopOpacity=".18" />
      <stop offset="1" stopColor="#ffe9a8" stopOpacity="0" />
    </linearGradient>
    <filter id="ls-blur-l" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="26" /></filter>
    <filter id="ls-blur-m" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="12" /></filter>
    <filter id="ls-blur-s"><feGaussianBlur stdDeviation="1.4" /></filter>
  </defs>;
}

/** Sky, sun glow and the most distant, palest peaks: sits BEHIND the watermark. */
export function SkyLayer() {
  const far = useMemo(() => pathOf(ridge(7, 470, 170, { freq: 0.9, sharp: 2.2, step: 10, jitter: 3 })), []);
  return <svg className="ls ls-sky" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <Defs />
    <rect width={W} height={H} fill="url(#ls-sky)" />
    <rect width={W} height={H} fill="url(#ls-sun)" />
    <path d={far} fill="url(#ls-far)" opacity=".85" />
    <ellipse cx="800" cy="470" rx="900" ry="40" fill="#eef2ef" opacity=".7" filter="url(#ls-blur-l)" />
  </svg>;
}

/** Snowy ridges, mist, rolling hills and the patchwork valley: IN FRONT of the watermark. */
export function FrontLayer() {
  const g = useMemo(() => {
    const snow = composedRidge(21, SUMMITS, 0.22, 6);
    const mid = ridge(33, 610, 120, { freq: 1.4, sharp: 1.8, step: 8, jitter: 6 });
    const near = hill(44, 668, 30, 0.9);
    const valley = hill(55, 728, 20, 1.3);

    // isometric patchwork of fields in the valley floor
    const r = rng(99);
    const greens = ["#6e874b", "#7f9a52", "#5d7a3f", "#8aa45d", "#4f6b37", "#97ad69", "#6a8446", "#a3b874"];
    const fields = [];
    const trees = [];
    const ox = 800, oy = 690, ux = 74, uy = 26, vx = -74, vy = 26;
    for (let i = 0; i < 9; i += 1) {
      for (let j = 0; j < 9; j += 1) {
        const x = ox + i * ux + j * vx, y = oy + i * uy + j * vy;
        const pts = [[x, y], [x + ux, y + uy], [x + ux + vx, y + uy + vy], [x + vx, y + vy]];
        const shade = greens[Math.floor(r() * greens.length)];
        fields.push({ d: `M${pts.map((p) => p.join(",")).join(" L")} Z`, fill: shade, o: 0.78 + r() * 0.22 });
        if (r() < 0.4) {
          const n = 4 + Math.floor(r() * 8);
          for (let k = 0; k < n; k += 1) trees.push({ cx: x + (r() - 0.5) * ux * 0.8, cy: y + uy * 0.4 + r() * uy * 0.9, r: 1.8 + r() * 2.4 });
        }
      }
    }
    // forest: dense clusters of small tree crowns on the hills (kept off the field patchwork)
    const forest = [];
    const rf = rng(123);
    for (let c = 0; c < 140; c += 1) {
      const cx = rf() * W;
      const cy = 630 + rf() * 170;
      if (cx > 520 && cx < 1080 && cy > 670) continue;
      const n = 14 + Math.floor(rf() * 26);
      const spread = 26 + rf() * 60;
      for (let k = 0; k < n; k += 1) {
        const a = rf() * Math.PI * 2, d = Math.pow(rf(), 0.7) * spread;
        const tone = rf();
        forest.push({ cx: cx + Math.cos(a) * d * 1.6, cy: cy + Math.sin(a) * d * 0.55, rx: 2.4 + rf() * 2.6, ry: 2 + rf() * 2, f: tone < 0.45 ? "#25391f" : tone < 0.85 ? "#2f4a28" : "#4c6b3a" });
      }
    }
    return { snow: pathOf(snow), snowLine: snow, mid: pathOf(mid), near: pathOf(near), valley: pathOf(valley), fields, trees, forest };
  }, []);

  return <svg className="ls ls-front" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <Defs />
    {/* snowy main range: overlaps the lower part of the watermark */}
    <path d={g.snow} fill="url(#ls-snow)" stroke="#7d8f86" strokeOpacity=".18" strokeWidth="1.2" />
    <path d={g.snow} fill="url(#ls-sunwash)" />
    {/* low cloud sea between ranges */}
    <ellipse cx="420" cy="540" rx="620" ry="46" fill="#f6f8f7" opacity=".95" filter="url(#ls-blur-l)" />
    <ellipse cx="1220" cy="552" rx="600" ry="44" fill="#f6f8f7" opacity=".92" filter="url(#ls-blur-l)" />
    <ellipse cx="820" cy="560" rx="460" ry="30" fill="#ffffff" opacity=".85" filter="url(#ls-blur-m)" />
    <ellipse cx="300" cy="505" rx="260" ry="18" fill="#ffffff" opacity=".7" filter="url(#ls-blur-m)" />
    <ellipse cx="1340" cy="512" rx="240" ry="16" fill="#ffffff" opacity=".65" filter="url(#ls-blur-m)" />
    <path d={g.mid} fill="url(#ls-mid)" />
    <ellipse cx="800" cy="650" rx="900" ry="20" fill="#eef2ef" opacity=".35" filter="url(#ls-blur-l)" />
    <path d={g.near} fill="url(#ls-near)" />
    {g.forest.filter((t) => t.cy < 700).map((t, i) => <ellipse key={`f${i}`} cx={t.cx} cy={t.cy} rx={t.rx} ry={t.ry} fill={t.f} />)}
    <path d={g.valley} fill="url(#ls-valley)" />
    <g filter="url(#ls-blur-s)">
      {g.fields.map((f, i) => <path key={i} d={f.d} fill={f.fill} opacity={f.o} stroke="#c9d8a8" strokeOpacity=".35" strokeWidth="1.2" />)}
    </g>
    {g.trees.map((t, i) => <circle key={`t${i}`} cx={t.cx} cy={t.cy} r={t.r} fill="#2b4527" opacity=".9" />)}
    {g.forest.filter((t) => t.cy >= 700).map((t, i) => <ellipse key={`g${i}`} cx={t.cx} cy={t.cy} rx={t.rx * 1.2} ry={t.ry * 1.2} fill={t.f} />)}
  </svg>;
}
