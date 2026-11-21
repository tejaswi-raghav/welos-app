import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "../ui/chrome.js";
import "./control.css";
import { MODES, DEFAULT_CONFIG } from "./engine.js";
import { simulateDay, SCENARIOS, SCENARIO_ORDER, explainFrame, modeLabel, STEPS, UNIT } from "../twin/sim.js";
import { NODES, EDGES, nodeById, traceFrom } from "../twin/topology.js";

const f2 = (x) => Number(x).toFixed(2), f1 = (x) => Number(x).toFixed(1);
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const NW = 156, NH = 58;
const OUTPUT_LABELS = { pvContactor: "PV contactor", windContactor: "Wind contactor", windBrake: "Turbine brake", batteryContactor: "Battery contactor", gridContactor: "Grid contactor", firstFlushValve: "First-flush valve", storageValve: "Storage valve", overflowValve: "Overflow valve", cleaningPump: "Cleaning pump", filtrationPump: "Filtration pump", loadShedRelay: "Load-shed relay" };
const SUPERVISOR = [["", "Automatic"], [MODES.NORMAL, "Request normal"], [MODES.CONSERVE, "Request conserve"], [MODES.STORM, "Request storm"], [MODES.CLEANING, "Request cleaning"]];

/** Constraints that govern each node, straight from the engine config. */
const C = DEFAULT_CONFIG;
const CONSTRAINTS = {
  pv: [`Soiling triggers a rinse at ${C.cleaningAutoThreshold * 100}%`, "PV contactor opens on inverter fault or E-stop"],
  wind: [`Generates between ${C.windCutInMs} and ${C.windCutOutMs} m/s`, `Storm mode at ${C.windStormMs} m/s`, "Brake is fail-safe and independent of the cloud"],
  battery: [`Normal reserve floor ${C.batteryMinSoc}%`, `Storm / outage reserve ${C.batteryStormReserveSoc}%`, `Charge ceiling ${C.batteryMaxSoc}%`, `Charge ≤ ${C.batteryMaxChargeKw} kW, discharge ≤ ${C.batteryMaxDischargeKw} kW`, `Derated above ${C.batteryHighTempC} °C`],
  bus: ["Surplus: battery first, then export", "Deficit: battery above reserve, then grid, then shed"],
  inverter: ["Anti-islanding: grid contactor opens on outage", "Sheds non-critical loads rather than breach reserve"],
  grid: ["Import only for deficit after battery", "Export only after the battery is charged"],
  house: ["Critical circuits stay on the backed-up panel"],
  gutter: [`Capture starts at ${C.rainCaptureStartMmHr} mm/h`, `Storm mode at ${C.rainStormMmHr} mm/h`],
  flush: [`First ${C.firstFlushMm} mm of each event goes to drain`],
  tank: [`Keeps ${C.tankCleaningReservePct}% for cleaning`, `Overflow above ${C.tankHighPct}%`, "Inlet isolated above 5 NTU or on leak"],
  filters: ["Runs with the storage valve or a rinse"],
  pump: [`Rinse draws ${C.cleaningPumpKw} kW for ${C.cleaningDurationSeconds / 60} min`],
  rinse: [`Wind < ${C.cleaningMaxWindMs} m/s, irradiance ≤ ${C.cleaningMaxIrradianceWm2} W/m², panel ≤ ${C.cleaningMaxPanelTempC} °C`, `${C.cleaningWaterLitres} L per cycle`],
  ctrl: ["Safety interlocks override every mode, including supervisor requests", "250 ms control cycle, works offline"],
  mppt: [], rect: ["Dump load absorbs surplus when the bus cannot"], drain: [], uses: ["Non-potable only"],
};
const NODE_ACTIONS = { battery: ["charge", "discharge"], bus: ["charge", "discharge", "export", "import"], grid: ["import", "export"], inverter: ["shed", "import", "export"], house: ["shed"], wind: ["brake"], rect: ["brake"], flush: ["flush", "store"], tank: ["store", "clean"], gutter: ["flush", "store"], pump: ["clean"], rinse: ["clean"], pv: ["clean", "charge"], filters: ["store"], ctrl: ["charge", "discharge", "import", "export", "shed", "brake", "flush", "store", "clean"], mppt: ["charge"] };

function edgePath(a, b) {
  const ax = a.x, ay = a.y, bx = b.x, by = b.y;
  if (Math.abs(ax - bx) < 30) return `M${ax} ${ay + (by > ay ? NH / 2 : -NH / 2)} V${by + (by > ay ? -NH / 2 : NH / 2)}`;
  const x1 = ax + (bx > ax ? NW / 2 : -NW / 2), x2 = bx + (bx > ax ? -NW / 2 : NW / 2);
  if (Math.abs(ay - by) < 4) return `M${x1} ${ay} H${x2}`;
  const mx = (x1 + x2) / 2, r = Math.min(14, Math.abs(by - ay) / 2), sy = by > ay ? 1 : -1, sx = x2 > x1 ? 1 : -1;
  return `M${x1} ${ay} H${mx - r * sx} Q${mx} ${ay} ${mx} ${ay + r * sy} V${by - r * sy} Q${mx} ${by} ${mx + r * sx} ${by} H${x2}`;
}
function loopPath(a, b) { // rinse → pv: up the right edge and across the top
  return `M${a.x + NW / 2} ${a.y} H1092 V24 H${b.x} V${b.y - NH / 2}`;
}
const SPECIAL = {
  "e-bus-pump": (a, b) => `M${a.x + NW / 2} ${a.y + 14} H634 V420 H${b.x} V${b.y - NH / 2}`,
  "e-pump-uses": (a, b) => `M${a.x} ${a.y + NH / 2} V${b.y} H${b.x - NW / 2}`,
};

function Glyph({ kind, domain }) {
  const d = {
    source: domain === "water" ? "M-7 3q3.5-5 7 0t7 0M-7 8q3.5-5 7 0t7 0M0-9v7" : "M0-6a6 6 0 1 0 .01 0ZM0-11v-2M0 13v-2M-11 0h-2M13 0h-2",
    conv: "M-8-6h16v12h-16ZM-4 0h8M2-3l3 3-3 3",
    bus: "M-9-4h18M-9 4h18M-5-8v16M5-8v16",
    store: domain === "water" ? "M-7-6c0-3 14-3 14 0v12c0 3-14 3-14 0ZM-7-6c0 3 14 3 14 0" : "M-8-5h14v10h-14ZM6-2h3v4h-3",
    load: "M-8 8V-1h5v9m0 0V-8h6v16m0 0V-3h5v11",
    grid: "M0-9l-6 18M0-9l6 18M-5-2h10M-6 4h12",
    drain: "M-7-5h14l-5 7v6h-4v-6Z",
    ctrl: "M-7-7h14v14h-14ZM-3-3h6v6h-6ZM-7-3h-3M-7 3h-3M7-3h3M7 3h3",
  }[kind];
  return <path d={d} className="glyph" />;
}

function Topology({ frame, selected, onSelect, layers, trace }) {
  const traced = selected && trace ? traceFrom(selected, { signals: false }) : null;
  const lit = traced ? new Set([selected, ...traced.up, ...traced.down]) : null;
  const visible = (e) => layers[e.kind];
  return (
    <svg className="topo" viewBox="0 0 1100 660" role="group" aria-label="System topology. Select a node to trace it.">
      <defs>
        <pattern id="grid" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.9" className="dot" /></pattern>
        <marker id="arr-p" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" className="mk-p" /></marker>
        <marker id="arr-w" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" className="mk-w" /></marker>
      </defs>
      <rect width="1100" height="660" fill="url(#grid)" />
      <g className="zones" aria-hidden="true">
        <text x="20" y="22" className="zone">POWER</text>
        <line x1="20" x2="1080" y1="438" y2="438" className="zone-rule" />
        <text x="20" y="458" className="zone">WATER</text>
      </g>
      <g className="edges">
        {EDGES.filter(visible).map((e) => {
          const a = nodeById[e.from], b = nodeById[e.to];
          const on = e.on(frame);
          const dir = e.dir ? e.dir(frame) : 1;
          const inTrace = lit ? lit.has(e.from) && lit.has(e.to) && e.kind !== "signal" : true;
          const d = e.loop ? loopPath(a, b) : SPECIAL[e.id] ? SPECIAL[e.id](a, b) : edgePath(a, b);
          return <g key={e.id} className={`edge ${e.kind} ${on && e.kind !== "signal" ? "on" : ""} ${dir < 0 ? "rev" : ""} ${lit && !inTrace ? "dim" : ""} ${lit && inTrace ? "traced" : ""}`}>
            <path d={d} className="base" markerEnd={e.kind === "signal" ? undefined : e.kind === "water" ? "url(#arr-w)" : "url(#arr-p)"} />
            {on && e.kind !== "signal" && <path d={d} className="flow" style={{ animationDuration: `${Math.max(0.5, 2.2 - (e.val ? Math.min(2, e.val(frame)) : 0.5) * 0.6)}s` }} />}
          </g>;
        })}
      </g>
      <g className="nodes">
        {NODES.map((n) => {
          const on = n.on(frame), warn = n.warn?.(frame);
          const dim = lit && !lit.has(n.id) && n.id !== "ctrl";
          return <g key={n.id} transform={`translate(${n.x - NW / 2} ${n.y - NH / 2})`} className={`node ${n.domain} k-${n.kind} ${on ? "on" : ""} ${warn ? "warn" : ""} ${selected === n.id ? "sel" : ""} ${dim ? "dim" : ""}`}
            role="button" tabIndex={0} aria-pressed={selected === n.id} aria-label={`${n.label}: ${n.value(frame)}`}
            onClick={() => onSelect(selected === n.id ? null : n.id)} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onSelect(selected === n.id ? null : n.id); } }}>
            <rect width={NW} height={NH} rx="12" className="card" />
            <rect x="0" y="10" width="3" height={NH - 20} rx="1.5" className="tick" />
            <g transform="translate(22 29)"><Glyph kind={n.kind} domain={n.domain} /></g>
            <text x="42" y="22" className="n-code">{n.code}</text>
            <text x="42" y="38" className="n-label">{n.label}</text>
            <text x="42" y="51" className="n-val">{n.value(frame)}</text>
            {on && <circle cx={NW - 12} cy="12" r="3.5" className="live" />}
          </g>;
        })}
      </g>
    </svg>
  );
}

function App() {
  const [scenario, setScenario] = useState("stress");
  const [supervisor, setSupervisor] = useState({ mode: "", from: 0 });
  const [idx, setIdx] = useState(64);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [selected, setSelected] = useState(null);
  const [layers, setLayers] = useState({ power: true, water: true, signal: false });
  const [trace, setTrace] = useState(true);

  const day = useMemo(() => simulateDay(scenario, {}, supervisor.mode ? { manual: { enabled: true, requestedMode: supervisor.mode }, manualFrom: supervisor.from } : {}), [scenario, supervisor]);
  const frame = day.frames[idx];
  const ex = useMemo(() => explainFrame(frame), [frame]);

  useEffect(() => {
    if (!playing) return undefined;
    const t = setInterval(() => setIdx((i) => { if (i >= STEPS) { setPlaying(false); return i; } return i + 1; }), (reduce() ? 900 : 600) / speed);
    return () => clearInterval(t);
  }, [playing, speed]);

  const events = day.events.filter((e) => e.i <= idx).slice().reverse();
  const supEvents = supervisor.mode ? [{ i: supervisor.from, clock: day.frames[supervisor.from].clock, level: "action", title: `Supervisor request: ${modeLabel(supervisor.mode)} (simulated)`, detail: "Interlocks and reserve protection still take precedence" }] : [];
  const log = [...supEvents.filter((e) => e.i <= idx), ...events].sort((a, b) => b.i - a.i);
  const incidents = day.events.filter((e) => e.level !== "info");
  const node = selected ? nodeById[selected] : null;
  const traced = node ? traceFrom(node.id) : null;
  const requestManual = (mode) => setSupervisor(mode ? { mode, from: idx } : { mode: "", from: 0 });

  return (
    <div className="os">
      <section className="os-bar">
        <div className="os-id">
          <span className="t-label">Rooftop node</span>
          <b className="t-num">DXB-WLS-001</b>
          <span className="os-sim">Simulated · {UNIT.name}</span>
        </div>
        <div className="os-scen" role="group" aria-label="Scenario">
          {SCENARIO_ORDER.map((id) => <button key={id} type="button" className="chip" aria-pressed={scenario === id} onClick={() => { setScenario(id); setSupervisor({ mode: "", from: 0 }); }}>{SCENARIOS[id].label}</button>)}
        </div>
      </section>

      <section className="os-strip" aria-label="Key measurements">
        <div className="os-mode"><span className="mode-pill" data-mode={frame.mode}><i />{modeLabel(frame.mode)}</span><span className="t-num os-clock">{frame.clock}</span></div>
        <Inst label="Solar" v={`${f2(frame.result.power.pvKw)}`} u="kW" />
        <Inst label="Wind" v={`${f2(frame.result.power.windKw)}`} u="kW" sub={`${f1(frame.sensors.windSpeedMs)} m/s`} />
        <Inst label="Demand" v={`${f2(frame.result.power.demandKw)}`} u="kW" />
        <Inst label="Battery" v={frame.soc.toFixed(0)} u="%" bar={frame.soc} cls="amber" />
        <Inst label="Tank" v={frame.tank.toFixed(0)} u="%" bar={frame.tank} cls="sky" />
        <Inst label="Grid" v={frame.sensors.gridAvailable ? "On" : "Lost"} warn={!frame.sensors.gridAvailable} />
      </section>

      <section className="os-main">
        <div className="os-canvas sheet">
          <div className="os-tools">
            {[["power", "Power"], ["water", "Water"], ["signal", "Control signals"]].map(([k, l]) => <button key={k} type="button" className={`chip lay-${k}`} aria-pressed={layers[k]} onClick={() => setLayers((s) => ({ ...s, [k]: !s[k] }))}><span className="sw" />{l}</button>)}
            <button type="button" className="chip" aria-pressed={trace} onClick={() => setTrace(!trace)}>Trace selection</button>
            <span className="os-hint t-fine">Moving dashes are flowing now; arrows show direction.</span>
          </div>
          <Topology frame={frame} selected={selected} onSelect={setSelected} layers={layers} trace={trace} />
        </div>

        <aside className="os-side">
          <div className="sheet os-panel">
            <p className="t-label">Decision trace · {frame.clock}</p>
            <p className="os-decision">{ex.decision}.</p>
            <ol className="trace" key={`${scenario}-${idx}`}>
              {ex.checks.map((c, k) => <li key={c.id} className={c.pass ? "pass" : c.flag ? "flag" : "fail"} style={{ animationDelay: `${k * 45}ms` }}>
                <span className="tr-sig">{c.signal}</span><b className="t-num">{c.value}</b><small>{c.rule}</small>
              </li>)}
            </ol>
            <p className="t-label os-sub">Actions</p>
            <ul className="os-acts">{ex.actions.filter((a) => a.state !== "idle").map((a) => <li key={a.id} className={`${a.state} ${a.domain}`}><i /><b>{a.name}</b><small>{a.state === "active" ? "Permitted" : "Blocked"} · {a.reason}</small></li>)}</ul>
          </div>

          <div className="sheet os-panel">
            {node ? <>
              <div className="os-node-head"><p className="t-label">{node.code} · selected</p><button type="button" className="icon-btn" aria-label="Clear selection" onClick={() => setSelected(null)}>✕</button></div>
              <h2 className="t-h3">{node.label}</h2>
              <div className="os-nodeval"><b className="t-num">{node.value(frame)}</b>{node.sub && <small>{node.sub(frame)}</small>}</div>
              {traced && <dl className="os-dl">
                <div><dt className="t-label">Upstream</dt><dd>{[...traced.up].map((id) => nodeById[id].label).join(", ") || "None: a source"}</dd></div>
                <div><dt className="t-label">Downstream</dt><dd>{[...traced.down].map((id) => nodeById[id].label).join(", ") || "None"}</dd></div>
              </dl>}
              {CONSTRAINTS[node.id]?.length > 0 && <><p className="t-label os-sub">Constraints</p><ul className="os-cons">{CONSTRAINTS[node.id].map((c) => <li key={c}>{c}</li>)}</ul></>}
              {NODE_ACTIONS[node.id] && <><p className="t-label os-sub">Related decisions now</p><ul className="os-acts small">{ex.actions.filter((a) => NODE_ACTIONS[node.id].includes(a.id)).map((a) => <li key={a.id} className={`${a.state} ${a.domain}`}><i /><b>{a.name}</b><small>{a.reason}</small></li>)}</ul></>}
              {node.parts.length > 0 && <a className="os-link" href={`/explorer.html#${node.parts[0]}`}>Inspect the hardware in Explorer →</a>}
            </> : <p className="t-fine">Select a node in the topology to trace its upstream inputs and downstream outputs, see its constraints and the decisions that involve it.</p>}
          </div>

          <div className="sheet os-panel">
            <p className="t-label">Supervisor request</p>
            <div className="sup">{SUPERVISOR.map(([m, l]) => <button key={l} type="button" className="chip" aria-pressed={supervisor.mode === m} onClick={() => requestManual(m)}>{l}</button>)}</div>
            <p className="t-fine">Applies from {supervisor.mode ? day.frames[supervisor.from].clock : "the current time"} in the simulation. Safety interlocks, storm detection and reserve protection always take precedence. No physical actuator is operated by this page.</p>
            <details className="os-io"><summary className="t-label">Actuator outputs (simulated)</summary>
              <ul>{Object.entries(frame.result.outputs).map(([k, v]) => <li key={k}><span>{OUTPUT_LABELS[k]}</span><b className={v ? "on" : ""}>{v ? (k === "windBrake" || k === "loadShedRelay" ? "Engaged" : "Energised") : "Open"}</b></li>)}</ul>
            </details>
          </div>
        </aside>
      </section>

      <section className="os-replay sheet" aria-label="Scenario replay">
        <div className="rp-controls">
          <button type="button" className="icon-btn play" aria-label={playing ? "Pause replay" : "Play replay"} onClick={() => { if (!playing && idx >= STEPS) setIdx(0); setPlaying(!playing); }}>{playing ? "❚❚" : "▶"}</button>
          <div className="seg" aria-label="Replay speed">{[1, 2, 4].map((s) => <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}×</button>)}</div>
          <div className="rp-incidents" aria-label="Jump to incident">{incidents.slice(0, 8).map((e, k) => <button key={k} type="button" className={`inc ${e.level}`} onClick={() => { setIdx(e.i); setPlaying(false); }}><span className="t-num">{e.clock}</span>{e.title}</button>)}</div>
        </div>
        <div className="rp-track">
          <div className="rp-modes" aria-hidden="true">{day.frames.map((f, i) => <i key={i} data-mode={f.mode} />)}</div>
          <input className="range" type="range" min="0" max={STEPS} value={idx} onChange={(e) => { setIdx(+e.target.value); setPlaying(false); }} aria-label="Replay time" aria-valuetext={frame.clock} style={{ "--p": `${(idx / STEPS) * 100}%` }} />
          <div className="rp-hours" aria-hidden="true">{[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => <span key={h} style={{ left: `${(h / 24) * 100}%` }}>{String(h).padStart(2, "0")}:00</span>)}</div>
        </div>
      </section>

      <section className="os-log sheet" aria-label="Activity log">
        <div className="log-head"><p className="t-label">Activity log</p><span className="t-fine">Every entry is generated by the simulation. Actions marked simulated did not operate hardware.</span></div>
        <ol>{log.slice(0, 40).map((e, k) => <li key={`${e.i}-${k}`} className={e.level}><time className="t-num">{e.clock}</time><b>{e.title}</b><span>{e.detail}</span></li>)}</ol>
      </section>
    </div>
  );
}

function Inst({ label, v, u, sub, bar, cls, warn }) {
  return <div className={`inst ${warn ? "warn" : ""}`}><span className="t-label">{label}</span><b className="t-num">{v}<small>{u}</small></b>{bar != null && <span className={`ibar ${cls}`}><i style={{ width: `${Math.min(100, bar)}%` }} /></span>}{sub && <em>{sub}</em>}</div>;
}

createRoot(document.getElementById("control-root")).render(<App />);
