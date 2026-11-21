// "One day on this roof": where every hour's power came from and went.
// Stacked from zero: sun→home, battery→home, grid→home (sums to home use).
// Above home use: sun→battery, sun→grid (top edge = total generation).
// One question per chart; direct labels instead of a legend; a scrubber for exact values.
import { clock } from "../os/day.js";

const NS = "http://www.w3.org/2000/svg";
const LAYERS = [
  { k: "direct", label: "Sun → home", fill: "var(--sun)", text: "var(--ink)" },
  { k: "fromBattery", label: "Battery → home", fill: "var(--ember)", text: "var(--ink)" },
  { k: "fromGrid", label: "Grid → home", fill: "#B9BEC4", text: "var(--ink)" },
  { k: "toBattery", label: "Sun → battery", fill: "#FFDF94", text: "var(--ink)" },
  { k: "toGrid", label: "Sun → grid", fill: "url(#hatch)", text: "var(--ink)" },
];
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  parent?.appendChild(n);
  return n;
};
const f1 = (x) => (Math.round(x * 10) / 10).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function mountDayChart(fig) {
  fig.innerHTML = `
    <figcaption class="day-head">
      <div><h3 id="dayTitle">One day on this roof</h3><ul class="day-insight" aria-live="polite"></ul></div>
      <dl class="day-totals"></dl>
    </figcaption>
    <div class="day-plot"><svg class="day-svg" role="img" aria-labelledby="dayTitle dayDesc"><desc id="dayDesc"></desc></svg></div>
    <div class="day-scrub">
      <label for="dayHour">Time of day</label>
      <input type="range" id="dayHour" min="0" max="143" step="1" value="114">
      <output for="dayHour" class="day-read"></output>
    </div>
    <ul class="day-key" aria-hidden="true">${LAYERS.map((l) => `<li><i style="background:${l.k === "toGrid" ? "repeating-linear-gradient(135deg,#F8C14A 0 2px,#FFF6DD 2px 5px)" : l.fill}"></i>${l.label}</li>`).join("")}<li><i class="line"></i>Home use</li></ul>
    <p class="day-note"><span class="w-src sim">Illustrative day</span> Sun and load follow average shapes for this climate and building. <span class="w-src engine">Engine output</span> Every routing decision and the battery level come from the WELOS OS control engine.</p>
    <div class="sr-only"><table><caption>Hourly energy flows</caption><thead><tr><th>Hour</th><th>Home use kW</th><th>Sun to home</th><th>Battery to home</th><th>Grid to home</th><th>Sun to battery</th><th>Sun to grid</th><th>Battery %</th></tr></thead><tbody></tbody></table></div>`;
  const svg = fig.querySelector("svg"), input = fig.querySelector("#dayHour"), out = fig.querySelector(".day-read");
  let day = null, geo = null;

  function draw() {
    if (!day) return;
    const Wd = Math.max(300, svg.clientWidth || fig.clientWidth), mobile = Wd < 560;
    const Hd = mobile ? 300 : 360, socH = 54, gap = 26;
    const m = { l: mobile ? 34 : 44, r: mobile ? 10 : 16, t: 12, b: 26 };
    const plotH = Hd - m.t - m.b - socH - gap;
    svg.setAttribute("viewBox", `0 0 ${Wd} ${Hd}`); svg.setAttribute("height", Hd);
    svg.replaceChildren(svg.querySelector("desc"));
    const S = day.steps, n = S.length;
    const top = Math.max(...S.map((s) => Math.max(s.load, s.pv + s.wind))) * 1.08;
    const yMax = top <= 6 ? Math.ceil(top) : top <= 30 ? Math.ceil(top / 2) * 2 : Math.ceil(top / 10) * 10;
    const x = (h) => m.l + (h / 24) * (Wd - m.l - m.r);
    const y = (v) => m.t + plotH - (v / yMax) * plotH;
    const ys = (p) => m.t + plotH + gap + socH - (p / 100) * socH;
    geo = { x, y, m, plotH, Wd, Hd, ys, socH, gap };

    const defs = el("defs", {}, svg);
    const pat = el("pattern", { id: "hatch", width: 5, height: 5, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
    el("rect", { width: 5, height: 5, fill: "#FFF6DD" }, pat);
    el("rect", { width: 2, height: 5, fill: "#F8C14A" }, pat);

    // night bands: context, not data
    const day0 = S.findIndex((s) => s.pv > 0.02), day1 = n - 1 - [...S].reverse().findIndex((s) => s.pv > 0.02);
    if (day0 > 0) {
      el("rect", { x: x(0), y: m.t, width: x(S[day0].h) - x(0), height: plotH, fill: "var(--paper-2)", opacity: 0.6 }, svg);
      el("rect", { x: x(S[day1].h), y: m.t, width: x(24) - x(S[day1].h), height: plotH, fill: "var(--paper-2)", opacity: 0.6 }, svg);
    }
    // grid
    const ticks = [0, yMax / 2, yMax];
    for (const v of ticks) {
      el("line", { x1: m.l, x2: Wd - m.r, y1: y(v), y2: y(v), stroke: "var(--rule)", "stroke-width": 1 }, svg);
      const t = el("text", { x: m.l - 8, y: y(v) + 4, "text-anchor": "end", class: "ax" }, svg); t.textContent = `${v % 1 ? v.toFixed(1) : v}`;
    }
    const kwLabel = el("text", { x: m.l, y: m.t + 10, class: "ax", dx: 6 }, svg); kwLabel.textContent = "kW";
    for (let h = 0; h <= 24; h += mobile ? 6 : 3) {
      const t = el("text", { x: x(h), y: Hd - 8, "text-anchor": h === 0 ? "start" : h === 24 ? "end" : "middle", class: "ax" }, svg); t.textContent = `${String(h).padStart(2, "0")}:00`;
    }

    // stacked areas
    const base = new Float64Array(n);
    const above = S.map((s) => s.load);
    const placed = [];
    for (const L of LAYERS) {
      const upper = L.k === "toBattery" || L.k === "toGrid";
      const lo = upper ? above.slice() : Array.from(base);
      const hi = lo.map((v, i) => v + S[i][L.k]);
      if (upper) hi.forEach((v, i) => (above[i] = v)); else hi.forEach((v, i) => (base[i] = v));
      if (Math.max(...S.map((s) => s[L.k])) < 0.02) continue;
      let d = `M${x(S[0].h)} ${y(hi[0])}`;
      for (let i = 1; i < n; i++) d += `L${x(S[i].h).toFixed(1)} ${y(hi[i]).toFixed(1)}`;
      d += `L${x(24)} ${y(hi[n - 1])}L${x(24)} ${y(lo[n - 1])}`;
      for (let i = n - 1; i >= 0; i--) d += `L${x(S[i].h).toFixed(1)} ${y(lo[i]).toFixed(1)}`;
      el("path", { d: d + "Z", fill: L.fill, class: `a-${L.k}` }, svg);
      // direct label at the thickest point, if it fits
      let bi = 0, bw = 0; for (let i = 0; i < n; i++) { const w = y(lo[i]) - y(hi[i]); if (w > bw) { bw = w; bi = i; } }
      if (bw > 18) {
        const half = L.label.length * 3.6 + 4;
        const lx = Math.min(Math.max(x(S[bi].h), m.l + half), Wd - m.r - half), ly = (y(lo[bi]) + y(hi[bi])) / 2 + 4;
        if (!placed.some((p) => Math.abs(p[0] - lx) < 110 && Math.abs(p[1] - ly) < 16)) {
          placed.push([lx, ly]);
          const t = el("text", { x: lx, y: ly, "text-anchor": "middle", class: "lbl" }, svg); t.textContent = L.label;
        }
      }
    }
    // home use line
    let dl = ""; S.forEach((s, i) => (dl += `${i ? "L" : "M"}${x(s.h).toFixed(1)} ${y(s.load).toFixed(1)}`)); dl += `L${x(24)} ${y(S[n - 1].load)}`;
    el("path", { d: dl, fill: "none", stroke: "var(--ink)", "stroke-width": 1.75, "stroke-linejoin": "round" }, svg);
    const peak = S.reduce((a, s) => (s.load > a.load ? s : a), S[0]);
    const pl = el("text", { x: Math.min(x(peak.h) + 6, Wd - m.r - 70), y: y(peak.load) - 8, class: "lbl ink" }, svg); pl.textContent = "Home use";

    // battery strip
    const sy0 = m.t + plotH + gap;
    const bl = el("text", { x: m.l, y: sy0 - 8, class: "ax" }, svg); bl.textContent = "Battery level";
    el("line", { x1: m.l, x2: Wd - m.r, y1: ys(0), y2: ys(0), stroke: "var(--rule)" }, svg);
    el("line", { x1: m.l, x2: Wd - m.r, y1: ys(day.config.batteryMinSoc), y2: ys(day.config.batteryMinSoc), stroke: "var(--ink-3)", "stroke-dasharray": "3 4" }, svg);
    const rl = el("text", { x: Wd - m.r, y: ys(day.config.batteryMinSoc) - 5, "text-anchor": "end", class: "ax" }, svg); rl.textContent = `${day.config.batteryMinSoc}% reserve`;
    let sd = `M${x(S[0].h)} ${ys(0)}`; S.forEach((s) => (sd += `L${x(s.h).toFixed(1)} ${ys(s.soc).toFixed(1)}`)); sd += `L${x(24)} ${ys(S[n - 1].soc)}L${x(24)} ${ys(0)}Z`;
    el("path", { d: sd, fill: "rgba(248,106,0,.14)" }, svg);
    let sl = ""; S.forEach((s, i) => (sl += `${i ? "L" : "M"}${x(s.h).toFixed(1)} ${ys(s.soc).toFixed(1)}`));
    el("path", { d: sl, fill: "none", stroke: "var(--ember)", "stroke-width": 1.5 }, svg);
    ["0", "100"].forEach((v) => { const t = el("text", { x: m.l - 8, y: ys(+v) + 4, "text-anchor": "end", class: "ax" }, svg); t.textContent = `${v}%`; });

    // scrub cursor
    geo.cursor = el("line", { y1: m.t, y2: ys(0), stroke: "var(--ink)", "stroke-width": 1 }, svg);
    geo.dots = [el("circle", { r: 3.5, fill: "var(--ink)" }, svg), el("circle", { r: 3.5, fill: "var(--ember)" }, svg)];
    scrub();
  }

  function scrub() {
    if (!day || !geo) return;
    const i = Math.min(day.steps.length - 1, +input.value), s = day.steps[i];
    const cx = geo.x(s.h);
    geo.cursor.setAttribute("x1", cx); geo.cursor.setAttribute("x2", cx);
    geo.dots[0].setAttribute("cx", cx); geo.dots[0].setAttribute("cy", geo.y(s.load));
    geo.dots[1].setAttribute("cx", cx); geo.dots[1].setAttribute("cy", geo.ys(s.soc));
    const parts = [["sun", s.direct], ["battery", s.fromBattery], ["grid", s.fromGrid]].filter(([, v]) => v > 0.05).map(([k, v]) => `${f1(v)} from ${k}`);
    const extra = s.toBattery > 0.05 ? ` · ${f1(s.toBattery)} kW charging` : s.toGrid > 0.05 ? ` · ${f1(s.toGrid)} kW exported` : "";
    out.innerHTML = `<b>${clock(s.h)}</b> Home ${f1(s.load)} kW: ${parts.join(", ") || "0"}${extra} · battery ${Math.round(s.soc)}%`;
    input.setAttribute("aria-valuetext", `${clock(s.h)}, home ${f1(s.load)} kilowatts, battery ${Math.round(s.soc)} percent`);
  }

  input.addEventListener("input", scrub);
  svg.addEventListener("pointermove", (e) => {
    if (!geo) return;
    const r = svg.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * geo.Wd;
    const h = Math.min(24, Math.max(0, ((px - geo.m.l) / (geo.Wd - geo.m.l - geo.m.r)) * 24));
    input.value = Math.min(day.steps.length - 1, Math.round((h / 24) * day.steps.length)); scrub();
  });
  new ResizeObserver(() => draw()).observe(fig);

  return {
    update(next) {
      day = next;
      const T = day.totals;
      fig.querySelector(".day-insight").innerHTML = day.insight.map((s) => `<li>${s}</li>`).join("");
      fig.querySelector(".day-totals").innerHTML = [
        ["Solar made", `${f1(T.solarKwh + T.windKwh)} kWh`], ["Home used", `${f1(T.loadKwh)} kWh`],
        ["From the grid", `${f1(T.gridKwh)} kWh`], ["Self-sufficient", `${Math.round(T.selfSufficiencyPct)}%`],
      ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
      svg.querySelector("desc").textContent = day.insight.join(" ");
      fig.querySelector("tbody").innerHTML = day.steps.filter((_, i) => i % 6 === 0).map((s) => `<tr><td>${clock(s.h)}</td><td>${f1(s.load)}</td><td>${f1(s.direct)}</td><td>${f1(s.fromBattery)}</td><td>${f1(s.fromGrid)}</td><td>${f1(s.toBattery)}</td><td>${f1(s.toGrid)}</td><td>${Math.round(s.soc)}</td></tr>`).join("");
      draw();
    },
  };
}
