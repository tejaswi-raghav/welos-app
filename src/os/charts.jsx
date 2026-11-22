import React, { useEffect, useId, useRef, useState } from "react";

const reduce = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
export const fmt = (x, d = 0) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });

/** Animated number that eases to its target whenever it changes. */
export function Count({ value, digits = 0, prefix = "", suffix = "" }) {
  const [v, setV] = useState(reduce() ? value : 0);
  const from = useRef(0);
  useEffect(() => {
    if (reduce()) { setV(value); return undefined; }
    const a = from.current, b = value, t0 = performance.now(), dur = 900;
    let raf;
    const tick = () => {
      const u = Math.min(1, (performance.now() - t0) / dur);
      const e = 1 - Math.pow(1 - u, 4);
      const x = a + (b - a) * e;
      setV(x); from.current = x;
      if (u < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{prefix}{fmt(v, digits)}{suffix}</>;
}

/** Today's solar (area) against use (line), with a now marker and hover readout. */
export function DayChart({ curve, nowIdx, height = 220, battery }) {
  const id = useId().replace(/:/g, "");
  const [hi, setHi] = useState(null);
  const ref = useRef(null);
  const W = 720, H = height, pt = 14, pb = 24;
  const max = Math.max(...curve.map((p) => Math.max(p.pv, p.load))) * 1.15 || 1;
  const x = (i) => (i / (curve.length - 1)) * W;
  const y = (v) => pt + (1 - v / max) * (H - pt - pb);
  const pvPath = curve.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.pv).toFixed(1)}`).join("");
  const loadPath = curve.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.load).toFixed(1)}`).join("");
  const area = `${pvPath}L${W} ${H - pb}L0 ${H - pb}Z`;
  const k = hi ?? nowIdx;
  const p = curve[k];
  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    setHi(Math.max(0, Math.min(curve.length - 1, Math.round(((e.clientX - r.left) / r.width) * (curve.length - 1)))));
  };
  return (
    <div className="ch-day">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Today's solar production against household use" onPointerMove={onMove} onPointerLeave={() => setHi(null)}>
        <defs>
          <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#f6b632" stopOpacity="0.55" /><stop offset="1" stopColor="#f6b632" stopOpacity="0.04" /></linearGradient>
          <clipPath id={`c${id}`}><rect x="0" y="0" width={x(nowIdx)} height={H} className="reveal-clip" /></clipPath>
        </defs>
        {[0, 6, 12, 18, 24].map((h) => <line key={h} x1={(h / 24) * W} x2={(h / 24) * W} y1={pt} y2={H - pb} className="grid" />)}
        <path d={area} fill={`url(#g${id})`} className="area-future" />
        <g clipPath={`url(#c${id})`}><path d={area} fill={`url(#g${id})`} /><path d={pvPath} className="pv" vectorEffect="non-scaling-stroke" /></g>
        <path d={pvPath} className="pv future" vectorEffect="non-scaling-stroke" />
        <path d={loadPath} className="load" vectorEffect="non-scaling-stroke" pathLength="1" />
        <line x1={x(nowIdx)} x2={x(nowIdx)} y1={pt - 6} y2={H - pb} className="now" />
        <circle cx={x(nowIdx)} cy={y(curve[nowIdx].pv)} r="4.5" className="now-dot" />
        {hi != null && <line x1={x(hi)} x2={x(hi)} y1={pt} y2={H - pb} className="hover" />}
      </svg>
      <div className="ch-x">{["00:00", "06:00", "12:00", "18:00", "24:00"].map((t, i) => <span key={t} style={{ left: `${i * 25}%` }}>{t}</span>)}</div>
      <div className="ch-tip" style={{ left: `${Math.min(88, Math.max(12, (k / (curve.length - 1)) * 100))}%` }}>
        <b>{p.clock}{hi == null ? " · now" : k > nowIdx ? " · forecast" : ""}</b>
        <span><i className="dot pv" />Solar {fmt(p.pv, 2)} kW</span>
        <span><i className="dot load" />Use {fmt(p.load, 2)} kW</span>
        {battery && <span><i className="dot soc" />Battery {fmt(p.soc, 0)}%</span>}
      </div>
    </div>
  );
}

/** Paired monthly bars with an optional highlighted month. */
export function MonthBars({ data, a, b, labels, colors, unit, current, height = 220, format = (v) => fmt(v) }) {
  const [hi, setHi] = useState(null);
  const W = 720, H = height, pt = 10, pb = 24;
  const max = Math.max(...data.flatMap((d) => [d[a], b ? d[b] : 0])) * 1.12 || 1;
  const bw = W / data.length;
  const y = (v) => pt + (1 - v / max) * (H - pt - pb);
  const k = hi ?? current;
  return (
    <div className="ch-bars">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${labels[0]}${b ? ` and ${labels[1]}` : ""} by month`} onPointerLeave={() => setHi(null)}>
        {data.map((d, i) => {
          const x0 = i * bw;
          return <g key={i} onPointerEnter={() => setHi(i)} className={`${i === k ? "hi" : ""} ${i > current ? "future" : ""}`}>
            <rect x={x0} y={0} width={bw} height={H} className="hit" />
            <rect x={x0 + bw * (b ? 0.18 : 0.26)} width={bw * (b ? 0.3 : 0.48)} y={y(d[a])} height={H - pb - y(d[a])} rx="3" style={{ fill: colors[0], animationDelay: `${i * 30}ms` }} className="bar" />
            {b && <rect x={x0 + bw * 0.52} width={bw * 0.3} y={y(d[b])} height={H - pb - y(d[b])} rx="3" style={{ fill: colors[1], animationDelay: `${i * 30 + 90}ms` }} className="bar" />}
          </g>;
        })}
        <line x1="0" x2={W} y1={H - pb} y2={H - pb} className="base" />
      </svg>
      <div className="ch-x months">{data.map((d, i) => <span key={i} className={i === current ? "cur" : ""} style={{ left: `${((i + 0.5) / data.length) * 100}%` }}>{d.label}</span>)}</div>
      <p className="ch-read"><b>{data[k].label}{k > current ? " (forecast)" : k === current ? " (this month)" : ""}</b> · <i className="sw" style={{ background: colors[0] }} />{labels[0]} {format(data[k][a])} {unit}{b && <> · <i className="sw" style={{ background: colors[1] }} />{labels[1]} {format(data[k][b])} {unit}</>}</p>
    </div>
  );
}

/** Cumulative cash position over 25 years with the payback crossing marked. */
export function CashLine({ cash, height = 200 }) {
  const W = 720, H = height, pt = 14, pb = 24;
  const min = Math.min(...cash.map((c) => c.v)), max = Math.max(...cash.map((c) => c.v));
  const x = (i) => (i / (cash.length - 1)) * W;
  const y = (v) => pt + (1 - (v - min) / (max - min || 1)) * (H - pt - pb);
  const path = cash.map((c, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(c.v).toFixed(1)}`).join("");
  let cross = null;
  for (let i = 1; i < cash.length; i++) if (cash[i - 1].v < 0 && cash[i].v >= 0) { cross = i - 1 + -cash[i - 1].v / (cash[i].v - cash[i - 1].v); break; }
  return (
    <div className="ch-cash">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Cumulative savings minus the system price over 25 years">
        <line x1="0" x2={W} y1={y(0)} y2={y(0)} className="zero" />
        <path d={`${path}L${W} ${y(0)}L0 ${y(0)}Z`} className="cash-area" />
        <path d={path} className="cash" pathLength="1" vectorEffect="non-scaling-stroke" />
        {cross != null && <><line x1={(cross / 25) * W} x2={(cross / 25) * W} y1={pt} y2={H - pb} className="pb" /><circle cx={(cross / 25) * W} cy={y(0)} r="5" className="pb-dot" /></>}
      </svg>
      <div className="ch-x">{[0, 5, 10, 15, 20, 25].map((t) => <span key={t} style={{ left: `${(t / 25) * 100}%` }}>Year {t}</span>)}</div>
      {cross != null && <span className="pb-label" style={{ left: `${(cross / 25) * 100}%` }}>Paid back · year {fmt(cross, 1)}</span>}
    </div>
  );
}

/** Donut of shares. parts: [{label, value, color}] */
export function Donut({ parts, size = 150, center, sub }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const r = 52, c = 2 * Math.PI * r;
  let off = 0;
  return (
    <div className="donut">
      <svg viewBox="0 0 140 140" width={size} height={size} role="img" aria-label={parts.map((p) => `${p.label} ${Math.round((p.value / total) * 100)}%`).join(", ")}>
        <circle cx="70" cy="70" r={r} className="track" />
        {parts.map((p, i) => {
          const len = (p.value / total) * c;
          const el = <circle key={i} cx="70" cy="70" r={r} stroke={p.color} strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-off} className="seg" style={{ animationDelay: `${i * 120}ms` }} />;
          off += len;
          return el;
        })}
        <text x="70" y="68" className="d-c">{center}</text>
        <text x="70" y="86" className="d-s">{sub}</text>
      </svg>
      <ul>{parts.map((p) => <li key={p.label}><i style={{ background: p.color }} />{p.label}<b>{Math.round((p.value / total) * 100)}%</b></li>)}</ul>
    </div>
  );
}

/** Progress ring. */
export function Ring({ value, label, color = "#f2a007", size = 92 }) {
  const r = 38, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, value));
  return (
    <svg className="ring" viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`${label} ${Math.round(v)}%`}>
      <circle cx="50" cy="50" r={r} className="track" />
      <circle cx="50" cy="50" r={r} className="val" stroke={color} strokeDasharray={`${(v / 100) * c} ${c}`} />
      <text x="50" y="55">{Math.round(v)}%</text>
    </svg>
  );
}
