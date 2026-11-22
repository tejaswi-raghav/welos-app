import React, { useMemo, useRef } from "react";

// Minimal, annotated day charts on a shared 0–24 h axis. One question per chart.
const W = 1000;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

function path(values, x, y) {
  return values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
}
function area(values, x, y, base) {
  return `${path(values, x, y)}L${x(values.length - 1).toFixed(1)} ${y(base).toFixed(1)}L${x(0).toFixed(1)} ${y(base).toFixed(1)}Z`;
}

/**
 * series: [{ id, label, values, color, kind: 'line'|'area'|'bars'|'step', dash }]
 * bands: [{ from, to, cls, label }]  (frame indices)
 * markers: [{ i, label, cls }]
 */
export function DayChart({ frames, series, idx, onIdx, height = 170, unit, max, min = 0, refLines = [], bands = [], markers = [], label, compare = [] }) {
  const ref = useRef(null);
  const n = frames.length;
  const all = [...series, ...compare].flatMap((s) => s.values);
  const hi = max ?? Math.max(1e-6, ...all) * 1.12;
  const H = height, padT = 14, padB = 22;
  const x = (i) => (i / (n - 1)) * W;
  const y = (v) => padT + (1 - (clamp(v, min, hi) - min) / (hi - min)) * (H - padT - padB);
  const hours = [0, 6, 12, 18, 24];

  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    const i = Math.round(clamp((e.clientX - r.left) / r.width, 0, 1) * (n - 1));
    onIdx?.(i);
  };
  const cur = series.map((s) => s.values[idx]);
  const xPct = (idx / (n - 1)) * 100;

  return (
    <figure className="dchart">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label} onPointerMove={onMove} onPointerDown={onMove}>
        {bands.map((b, k) => <rect key={k} className={`band ${b.cls || ""}`} x={x(b.from)} width={Math.max(2, x(b.to) - x(b.from))} y={padT} height={H - padT - padB} />)}
        {hours.map((h) => <line key={h} className="hgrid" x1={(h / 24) * W} x2={(h / 24) * W} y1={padT} y2={H - padB} />)}
        <line className="base" x1="0" x2={W} y1={y(min)} y2={y(min)} />
        {refLines.map((r, k) => <g key={k} className={`ref ${r.cls || ""}`}><line x1="0" x2={W} y1={y(r.v)} y2={y(r.v)} /></g>)}
        {compare.map((s) => <path key={`c-${s.id}`} className="cmp" d={path(s.values, x, y)} style={{ stroke: s.color }} />)}
        {series.map((s) => s.kind === "area"
          ? <path key={s.id} className="area" d={area(s.values, x, y, min)} style={{ fill: s.color }} />
          : s.kind === "bars"
            ? <g key={s.id} style={{ fill: s.color }}>{s.values.map((v, i) => v > 0.001 && <rect key={i} x={x(i) - 3} width="6" y={y(v)} height={Math.max(0.5, y(min) - y(v))} />)}</g>
            : <path key={s.id} className={`ln ${s.dash ? "dash" : ""}`} d={path(s.values, x, y)} style={{ stroke: s.color }} vectorEffect="non-scaling-stroke" />)}
        {markers.map((m, k) => <g key={k} className={`mk ${m.cls || ""}`}><line x1={x(m.i)} x2={x(m.i)} y1={padT} y2={H - padB} /></g>)}
        <line className="cursor" x1={x(idx)} x2={x(idx)} y1={padT - 4} y2={H - padB + 2} />
      </svg>
      <div className="dchart-x" aria-hidden="true">{hours.map((h) => <span key={h} style={{ left: `${(h / 24) * 100}%` }}>{String(h).padStart(2, "0")}:00</span>)}</div>
      {refLines.map((r, k) => <span key={k} className={`dchart-ref ${r.cls || ""}`} style={{ top: `${(y(r.v) / H) * 100}%` }}>{r.label}</span>)}
      <div className="dchart-read" style={{ left: `${clamp(xPct, 6, 94)}%` }}>
        {series.map((s, k) => <span key={s.id}><i style={{ background: s.color }} />{s.label} <b className="t-num">{fmt(cur[k])}{unit ? ` ${s.unit || unit}` : ""}</b></span>)}
      </div>
    </figure>
  );
}
const fmt = (v) => (v == null ? "—" : Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));

/** Mode band strip above the timeline. */
export function ModeStrip({ frames, idx }) {
  const runs = useMemo(() => {
    const out = [];
    frames.forEach((f, i) => { const last = out[out.length - 1]; if (last && last.mode === f.mode) last.to = i; else out.push({ mode: f.mode, from: i, to: i }); });
    return out;
  }, [frames]);
  const n = frames.length - 1;
  return <div className="modestrip" aria-hidden="true">{runs.map((r, k) => <span key={k} data-mode={r.mode} style={{ left: `${(r.from / n) * 100}%`, width: `${((r.to - r.from + 1) / n) * 100}%` }} title={r.mode} />)}<i style={{ left: `${(idx / n) * 100}%` }} /></div>;
}
