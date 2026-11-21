import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../ui/chrome.js";
import "./lab.css";
import { useStage, useAnnotations } from "../twin/useStage.js";
import { simulateDay, SCENARIOS, SCENARIO_ORDER, INPUT_DEFS, defaultInputs, explainFrame, narrate, modeLabel, pvEfficiency, UNIT, CLEAN_CYCLE, DEFAULT_CONFIG, STEPS } from "../twin/sim.js";
import { nodeById } from "../twin/topology.js";
import { DayChart, ModeStrip } from "./charts.jsx";

const C = { amber: "#f2a007", ember: "#ef6a12", sky: "#1aa7e0", ink: "#14191f", muted: "#8b9097", dust: "#b8915c" };
const f2 = (x) => Number(x).toFixed(2), f1 = (x) => Number(x).toFixed(1), pct = (x) => `${(x * 100).toFixed(1)}%`;
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const DAY_POSE = { pos: [11.8, 6.4, 13.8], target: [0.8, 0.5, -0.2], fov: 32 };
const CLEAN_POSE = { pos: [2.2, 6.4, 6.6], target: [-0.6, 1.45, -0.3], fov: 34 };
const ANNOS = [
  { id: "a-pv", node: "pv", key: "pv-array", at: [1.8, 1.75, 0.5], cls: "power" },
  { id: "a-wind", node: "wind", key: "vawt-rotor", at: [3.25, 3.1, -0.9], cls: "power" },
  { id: "a-batt", node: "battery", key: "lifepo4-battery", at: [1.2, -1.36, 1.97], cls: "power" },
  { id: "a-tank", node: "tank", key: "water-tank", at: [-2.8, 0.3, 1.67], cls: "water" },
  { id: "a-house", node: "house", key: null, at: [11.2, -1.0, -6.4], cls: "power" },
];
const CHARTS = [
  { id: "energy", q: "Where does the energy come from?" },
  { id: "battery", q: "Does the battery hold its reserve?" },
  { id: "water", q: "What does the rain give?" },
  { id: "dust", q: "What is dust costing?" },
];

function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

function Lab() {
  const [canvasRef, stage] = useStage({ env: "rooftop", orbit: true });
  const [tab, setTab] = useState(location.hash === "#cleaning" ? "clean" : "day");
  const [scenario, setScenario] = useState("dust");
  const [inputs, setInputs] = useState(() => defaultInputs("dust"));
  const [idx, setIdx] = useState(52);
  const [playing, setPlaying] = useState(false);
  const [chart, setChart] = useState("energy");
  const [compare, setCompare] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const annoRef = useRef(null);

  const simInputs = useDebounced(inputs, 120);
  const day = useMemo(() => simulateDay(scenario, simInputs), [scenario, simInputs]);
  const cmpDay = useMemo(() => (compare ? simulateDay(compare) : null), [compare]);
  const frame = day.frames[idx];

  // play: advance a quarter-hour every 160 ms
  useEffect(() => {
    if (!playing) return undefined;
    const t = setInterval(() => setIdx((i) => (i >= STEPS ? (setPlaying(false), i) : i + 1)), reduce() ? 400 : 160);
    return () => clearInterval(t);
  }, [playing]);

  useEffect(() => {
    if (!stage) return;
    stage.setFlows("active");
    stage.setHoverEnabled(false);
  }, [stage]);
  useEffect(() => { if (stage && tab === "day") { stage.setWeather(null); stage.setFrame(frame); } }, [stage, frame, tab]);
  useEffect(() => {
    if (!stage) return;
    stage.setPose(tab === "clean" ? CLEAN_POSE : DAY_POSE, 1500);
    stage.setFocus(tab === "clean" ? ["pv-array", "pv-racking", "soiling-sensor", "cleaning-manifold", "canopy", "water-pump", "water-tank", "pipe-4", "filter-train"] : null);
    history.replaceState(null, "", tab === "clean" ? "#cleaning" : location.pathname);
  }, [stage, tab]);

  useAnnotations(stage, annoRef, tab === "day" ? ANNOS : []);

  const pickScenario = (id) => { setScenario(id); setInputs(defaultInputs(id)); setPlaying(false); };
  const setInput = (id, v) => setInputs((s) => ({ ...s, [id]: v }));
  const ex = explainFrame(frame);
  const t = day.totals;

  return (
    <div className="lab">
      <section className="lab-top">
        <div className="lab-stage twin-stage">
          <canvas ref={canvasRef} aria-label="3D rooftop responding to the simulated conditions" />
          <div className="annos" ref={annoRef} aria-hidden="true">
            {tab === "day" && ANNOS.map((a) => { const n = nodeById[a.node]; return <div key={a.id} data-id={a.id} className={`vtag ${a.cls} ${n.on(frame) ? "on" : ""}`}><i /><span className="t-label">{n.label}</span><b className="t-num">{n.value(frame)}</b></div>; })}
          </div>
          {stage === false && <div className="lab-nogl"><p>3D view unavailable on this device. The timeline, charts and controller explanation below are complete without it.</p></div>}
          <div className="lab-tabs seg" role="tablist" aria-label="Lab mode">
            <button type="button" role="tab" aria-selected={tab === "day"} onClick={() => setTab("day")}>Operating day</button>
            <button type="button" role="tab" aria-selected={tab === "clean"} onClick={() => setTab("clean")}>Self-cleaning</button>
          </div>
          {tab === "day" && <div className="lab-clock">
            <span className="t-num">{frame.clock}</span>
            <span className="mode-pill" data-mode={frame.mode}><i />{modeLabel(frame.mode)}</span>
          </div>}
          {tab === "day" && <Timeline day={day} idx={idx} setIdx={(i) => { setIdx(i); setPlaying(false); }} playing={playing} setPlaying={setPlaying} />}
        </div>

        <aside className="lab-side sheet" aria-label={tab === "day" ? "Scenario and controller" : "Self-cleaning sequence"}>
          {tab === "day" ? <>
            <div className="ls-block">
              <p className="t-label">Scenario</p>
              <div className="scen">{SCENARIO_ORDER.map((id) => <button key={id} type="button" className="chip" aria-pressed={scenario === id} onClick={() => pickScenario(id)}>{SCENARIOS[id].label}</button>)}</div>
              <p className="ls-blurb">{SCENARIOS[scenario].blurb}</p>
            </div>
            <div className="ls-block">
              <button type="button" className="ls-toggle" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}><span className="t-label">Adjust conditions</span><span>{advanced ? "−" : "+"}</span></button>
              {advanced && <div className="inputs">
                {INPUT_DEFS.map((d) => {
                  const scale = d.scale || 1, v = inputs[d.id] * scale;
                  return <label key={d.id} className="inp"><span>{d.label}</span><b className="t-num">{d.unit === "×" ? `${v.toFixed(2)}×` : `${v.toFixed(d.step < 1 ? 2 : 0)} ${d.unit}`}</b>
                    <input className="range" type="range" min={d.min} max={d.max} step={d.step} value={v} style={{ "--p": `${((v - d.min) / (d.max - d.min)) * 100}%` }} onChange={(e) => setInput(d.id, +e.target.value / scale)} /></label>;
                })}
                <label className="inp inline"><span>Grid outage 18:00–22:00</span><button type="button" className="toggle" role="switch" aria-checked={!!inputs.gridOutage} onClick={() => setInput("gridOutage", !inputs.gridOutage)} /></label>
                <button type="button" className="btn btn--line btn--sm" onClick={() => setInputs(defaultInputs(scenario))}>Reset to scenario</button>
              </div>}
            </div>
            <div className="ls-block">
              <p className="t-label">What is happening</p>
              <p className="ls-narr">{narrate(frame)}</p>
            </div>
            <div className="ls-block">
              <p className="t-label">Controller actions</p>
              <ul className="acts">{ex.actions.map((a) => <li key={a.id} className={`${a.state} ${a.domain}`}><i /><b>{a.name}</b><small>{a.reason}</small></li>)}</ul>
            </div>
            <p className="notice">Deterministic simulation of the concept reference unit ({UNIT.pvRatedKw} kWp, {UNIT.batteryKwh} kWh, {UNIT.tankL} L). Controller logic: src/control/engine.js.</p>
          </> : <CleaningSequence stage={stage} />}
        </aside>
      </section>

      {tab === "day" && <section className="lab-below">
        <div className="lb-head">
          <div className="seg" role="tablist" aria-label="Question">{CHARTS.map((c) => <button key={c.id} type="button" role="tab" aria-selected={chart === c.id} onClick={() => setChart(c.id)}>{c.q}</button>)}</div>
          <label className="cmp-pick"><span className="t-label">Compare with</span>
            <select value={compare} onChange={(e) => setCompare(e.target.value)}><option value="">Nothing</option>{SCENARIO_ORDER.filter((s) => s !== scenario).map((s) => <option key={s} value={s}>{SCENARIOS[s].label} (default)</option>)}</select>
          </label>
        </div>
        <ChartFor id={chart} day={day} cmp={cmpDay} idx={idx} setIdx={setIdx} />
        <dl className="totals">
          <div><dt className="t-label">Solar</dt><dd className="t-num">{f1(t.pvKwh)} <small>kWh</small></dd></div>
          <div><dt className="t-label">Wind</dt><dd className="t-num">{f1(t.windKwh)} <small>kWh</small></dd></div>
          <div><dt className="t-label">Demand</dt><dd className="t-num">{f1(t.loadKwh)} <small>kWh</small></dd></div>
          <div><dt className="t-label">From grid</dt><dd className="t-num">{f1(t.importKwh)} <small>kWh</small></dd></div>
          <div><dt className="t-label">Unserved</dt><dd className={`t-num ${t.shedKwh > 0 ? "c-ember" : ""}`}>{f1(t.shedKwh)} <small>kWh</small></dd></div>
          <div><dt className="t-label">Lost to dust</dt><dd className="t-num">{f1(t.soilingLossKwh)} <small>kWh</small></dd></div>
          <div><dt className="t-label">Rain captured</dt><dd className="t-num">{t.capturedL.toFixed(0)} <small>L</small></dd></div>
          <div><dt className="t-label">Rinse cycles</dt><dd className="t-num">{t.cleaningCycles} <small>· {t.cleaningL} L</small></dd></div>
        </dl>
        <EventLog day={day} idx={idx} setIdx={setIdx} />
      </section>}
    </div>
  );
}

function Timeline({ day, idx, setIdx, playing, setPlaying }) {
  const n = STEPS;
  const sunMarks = day.frames.filter((f, i) => i > 0 && (day.frames[i - 1].env.irradiance < 5) !== (f.env.irradiance < 5));
  return <div className="timeline">
    <button type="button" className="icon-btn play" aria-label={playing ? "Pause" : "Play the day"} onClick={() => { if (!playing && idx >= n) setIdx(0); setPlaying(!playing); }}>{playing ? "❚❚" : "▶"}</button>
    <div className="tl-track">
      <ModeStrip frames={day.frames} idx={idx} />
      <div className="tl-events" aria-hidden="true">{day.events.filter((e) => e.level !== "info" || e.kind === "mode").map((e, k) => <span key={k} className={`te ${e.level} ${e.kind}`} style={{ left: `${(e.i / n) * 100}%` }} title={`${e.clock} ${e.title}`} />)}</div>
      {sunMarks.map((f) => <span key={f.i} className="tl-sun" style={{ left: `${(f.i / n) * 100}%` }} aria-hidden="true">{f.env.irradiance >= 5 ? "Sunrise" : "Sunset"}</span>)}
      <input className="range tl-range" type="range" min="0" max={n} step="1" value={idx} onChange={(e) => setIdx(+e.target.value)} aria-label="Time of day" aria-valuetext={day.frames[idx].clock} style={{ "--p": `${(idx / n) * 100}%` }} />
      <div className="tl-hours" aria-hidden="true">{[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => <span key={h} style={{ left: `${(h / 24) * 100}%` }}>{String(h).padStart(2, "0")}</span>)}</div>
    </div>
  </div>;
}

function ChartFor({ id, day, cmp, idx, setIdx }) {
  const F = day.frames, CF = cmp?.frames;
  const v = (fn, frames = F) => frames.map(fn);
  const shedBands = runs(F, (f) => f.result.power.loadShedKw > 0.01).map((r) => ({ ...r, cls: "crit" }));
  const outBands = runs(F, (f) => !f.sensors.gridAvailable).map((r) => ({ ...r, cls: "warn" }));
  const cleanMarks = F.filter((f) => f.cleaningRan).map((f) => ({ i: f.i, cls: "sky" }));
  if (id === "energy") return <DayChart label="Solar, wind and demand through the day, kW" frames={F} idx={idx} onIdx={setIdx} unit="kW" bands={[...outBands, ...shedBands]}
    series={[{ id: "pv", label: "Solar", values: v((f) => f.result.power.pvKw), color: C.amber, kind: "area" }, { id: "wind", label: "Wind", values: v((f) => f.result.power.windKw), color: C.ember }, { id: "load", label: "Demand", values: v((f) => f.result.power.demandKw), color: C.ink, dash: true }]}
    compare={CF ? [{ id: "pvc", values: v((f) => f.result.power.pvKw, CF), color: C.muted }] : []} />;
  if (id === "battery") return <DayChart label="Battery state of charge, percent" frames={F} idx={idx} onIdx={setIdx} unit="%" max={100} bands={outBands}
    refLines={[{ v: DEFAULT_CONFIG.batteryMinSoc, label: `Normal floor ${DEFAULT_CONFIG.batteryMinSoc}%` }, { v: DEFAULT_CONFIG.batteryStormReserveSoc, label: `Storm / outage reserve ${DEFAULT_CONFIG.batteryStormReserveSoc}%`, cls: "warn" }]}
    series={[{ id: "soc", label: "Battery", values: v((f) => f.soc), color: C.amber }]} compare={CF ? [{ id: "socc", values: v((f) => f.soc, CF), color: C.muted }] : []} />;
  if (id === "water") return <DayChart label="Tank level and rainfall" frames={F} idx={idx} onIdx={setIdx} unit="%" max={100} markers={cleanMarks}
    refLines={[{ v: DEFAULT_CONFIG.tankCleaningReservePct, label: `Cleaning reserve ${DEFAULT_CONFIG.tankCleaningReservePct}%` }]}
    series={[{ id: "rain", label: "Rain ×10 mm/h", values: v((f) => f.sensors.rainfallMmHr * 10), color: "#7fc7e8", kind: "bars" }, { id: "tank", label: "Tank", values: v((f) => f.tank), color: C.sky }]}
    compare={CF ? [{ id: "tankc", values: v((f) => f.tank, CF), color: C.muted }] : []} />;
  return <DayChart label="Soiling index and the output it costs" frames={F} idx={idx} onIdx={setIdx} unit="" max={30} markers={cleanMarks}
    refLines={[{ v: DEFAULT_CONFIG.cleaningAutoThreshold * 100, label: `Rinse trigger ${DEFAULT_CONFIG.cleaningAutoThreshold * 100}%`, cls: "warn" }]}
    series={[{ id: "soil", label: "Soiling %", values: v((f) => f.soiling * 100), color: C.dust }, { id: "loss", label: "Loss ×10 kW", values: v((f) => f.soilingLossKw * 10), color: C.ember, kind: "area" }]}
    compare={CF ? [{ id: "soilc", values: v((f) => f.soiling * 100, CF), color: C.muted }] : []} />;
}
function runs(frames, test) {
  const out = []; let cur = null;
  frames.forEach((f, i) => { if (test(f)) { if (!cur) cur = { from: i, to: i }; else cur.to = i; } else if (cur) { out.push(cur); cur = null; } });
  if (cur) out.push(cur);
  return out;
}

function EventLog({ day, idx, setIdx }) {
  return <div className="evlog">
    <p className="t-label">Event log · simulated</p>
    <ol>{day.events.map((e, k) => <li key={k} className={`${e.level} ${e.i <= idx ? "past" : ""}`}><button type="button" onClick={() => setIdx(e.i)}><time className="t-num">{e.clock}</time><b>{e.title}</b><span>{e.detail}</span></button></li>)}</ol>
  </div>;
}

/* ------------------------------------------------------------------ self-cleaning sequence */
function CleaningSequence({ stage }) {
  const [step, setStep] = useState(0);
  const [tank, setTank] = useState(defaultInputs("dust").startTank);
  const [wind, setWind] = useState(1);
  const day = useMemo(() => simulateDay("dust", { startTank: tank, windScale: wind }), [tank, wind]);
  const F = day.frames;
  const trig = DEFAULT_CONFIG.cleaningAutoThreshold;
  const propose = F.find((f) => f.soiling >= trig) || F[52];
  const cleanF = F.find((f) => f.cleaningRan);
  const after = cleanF ? F[cleanF.i + 1] : null;
  const noon = F[50];
  const clean = (fr) => (fr.env.irradiance / 1000) * UNIT.pvRatedKw * pvEfficiency(0, fr.sensors.panelTempC);
  const blockers = propose.result.cleaning.blockers;
  const anim = useRef(0);

  const checks = (fr) => {
    const s = fr.sensors, c = DEFAULT_CONFIG;
    return [
      ["Soiling ≥ 15% eligibility", pct(s.soilingIndex), s.soilingIndex >= c.cleaningSoilingThreshold],
      [`Tank ≥ ${c.tankCleaningReservePct}%`, `${s.tankLevelPct.toFixed(0)}%`, s.tankLevelPct >= c.tankCleaningReservePct],
      [`Wind < ${c.cleaningMaxWindMs} m/s`, `${f1(s.windSpeedMs)} m/s`, s.windSpeedMs < c.cleaningMaxWindMs],
      [`Irradiance ≤ ${c.cleaningMaxIrradianceWm2} W/m²`, `${s.solarIrradianceWm2} W/m²`, s.solarIrradianceWm2 <= c.cleaningMaxIrradianceWm2],
      [`Panel ≤ ${c.cleaningMaxPanelTempC} °C`, `${f1(s.panelTempC)} °C`, s.panelTempC <= c.cleaningMaxPanelTempC],
      ["No rain capture", `${f1(s.rainfallMmHr)} mm/h`, s.rainfallMmHr < c.rainCaptureStartMmHr],
      ["Water quality ≤ 5 NTU, no leak", `${s.waterTurbidityNtu} NTU`, s.waterTurbidityNtu <= 5 && !s.leakDetected],
    ];
  };

  const STEPS_ = [
    { t: "Clean glass", d: `A reference: the same canopy with no dust. Under the ${propose.clock} sun it would make ${f2(clean(propose))} kW.`, frame: propose, w: { soiling: 0, rinse: 0 } },
    { t: "Dust in the air", d: `A dust event: haze cuts the clear-sky irradiance to ${(F[40].env.clearness * 100).toFixed(0)}% by 10:00, and fine particles settle on the glass.`, frame: F[40] },
    { t: "Dust accumulates", d: `Soiling climbs from ${pct(F[24].soiling)} at dawn to ${pct(propose.soiling)} by ${propose.clock}.`, frame: propose, sweep: [24, propose.i] },
    { t: "Output falls", d: `At ${propose.clock} dust is costing ${(propose.soilingLossKw * 1000).toFixed(0)} W: ${((propose.soilingLossKw / Math.max(0.001, clean(propose))) * 100).toFixed(0)}% of what clean glass would give, using the simulator's soiling and temperature model.`, frame: propose },
    { t: "Soiling assessed", d: `The reference cell reads ${pct(propose.soiling)}. Rinsing becomes eligible at ${DEFAULT_CONFIG.cleaningSoilingThreshold * 100}% and is triggered at ${trig * 100}%.`, frame: propose, focus: ["soiling-sensor", "pv-array"] },
    { t: "Water reserve", d: `One cycle uses ${CLEAN_CYCLE.litres} L (${((CLEAN_CYCLE.litres / UNIT.tankL) * 100).toFixed(1)}% of the ${UNIT.tankL} L tank). The tank holds ${propose.tank.toFixed(0)}%; the controller keeps ${DEFAULT_CONFIG.tankCleaningReservePct}% back.`, frame: propose, focus: ["water-tank", "water-sensors", "water-pump"] },
    { t: "Safety checks", d: "Every condition must pass before water touches the panels.", frame: propose, checks: true },
    { t: blockers.length ? "Blocked, then permitted" : "Permitted", d: blockers.length ? `At ${propose.clock} the rinse is refused: ${blockers.join(", ").toLowerCase()}. ${cleanF ? `The controller waits until ${cleanF.clock}, when every check passes.` : "No moment today passes every check, so no rinse runs."}` : `Every check passes at ${propose.clock}, so the rinse starts immediately.`, frame: cleanF || propose, checks: true },
    { t: "Rinse", d: cleanF ? `The pump draws treated water from the tank through the filters to the spray rail. Duration ${CLEAN_CYCLE.minutes} minutes, ${CLEAN_CYCLE.litres} L. Simulated actuation only.` : "No rinse ran in this simulation.", frame: cleanF || propose, w: cleanF ? { rinse: 1 } : null, rinse: !!cleanF, flows: true },
    { t: "Recovery", d: cleanF && after ? `Soiling ${pct(cleanF.soiling)} → ${pct(after.soiling)}. At the ${noon.clock} sun that difference is worth ${(((noon.env.irradiance / 1000) * UNIT.pvRatedKw * (pvEfficiency(after.soiling, noon.sensors.panelTempC) - pvEfficiency(cleanF.soiling, noon.sensors.panelTempC))) * 1000).toFixed(0)} W of output, from the same model. Tank after the cycle: ${after.tank.toFixed(0)}%.` : "Without a rinse, the dust stays until rain or a manual clean.", frame: after || propose },
  ];
  const S = STEPS_[Math.min(step, STEPS_.length - 1)];

  useEffect(() => {
    if (!stage) return undefined;
    cancelAnimationFrame(anim.current);
    stage.setFrame(S.frame);
    stage.setFlows(S.flows ? "active" : "off", S.flows ? new Set(["water"]) : null);
    stage.setWeather(S.w ? { ...S.w } : null);
    if (S.focus) stage.setFocus(S.focus);
    else stage.setFocus(["pv-array", "pv-racking", "soiling-sensor", "cleaning-manifold", "canopy", "water-pump", "water-tank", "pipe-4", "filter-train"]);
    if (S.sweep && !reduce()) {
      const [a, b] = S.sweep, t0 = performance.now();
      const tick = () => { const u = Math.min(1, (performance.now() - t0) / 2600); stage.setFrame(F[Math.round(a + (b - a) * u)]); if (u < 1) anim.current = requestAnimationFrame(tick); };
      tick();
    }
    if (S.rinse && !reduce()) {
      const t0 = performance.now(), s0 = S.frame.soiling, s1 = after ? after.soiling : s0;
      const tick = () => { const u = Math.min(1, (performance.now() - t0) / 3200); stage.setWeather({ rinse: u < 0.92 ? 1 : 0, soiling: s0 + (s1 - s0) * u }); if (u < 1) anim.current = requestAnimationFrame(tick); };
      tick();
    }
    return () => cancelAnimationFrame(anim.current);
  }, [stage, step, day]);
  useEffect(() => () => { stage && stage.setWeather(null); }, [stage]);

  return <div className="clean">
    <p className="t-label">Self-cleaning · dust-day simulation</p>
    <ol className="cl-steps" aria-label="Sequence">{STEPS_.map((s, k) => <li key={k}><button type="button" aria-current={k === step ? "step" : undefined} className={k < step ? "done" : ""} onClick={() => setStep(k)}><span className="t-num">{String(k + 1).padStart(2, "0")}</span><span className="sr-only">{s.t}</span></button></li>)}</ol>
    <div className="cl-body" aria-live="polite">
      <div className="cl-meta"><span className="t-num cl-clock">{S.frame.clock}</span><span className="t-label">Step {step + 1} of {STEPS_.length}</span></div>
      <h2 className="t-h2">{S.t}</h2>
      <p>{S.d}</p>
      {S.checks && <ul className="cl-checks">{checks(S.frame).map(([k, v, ok]) => <li key={k} className={ok ? "ok" : "no"}><i aria-label={ok ? "passes" : "fails"}>{ok ? "✓" : "✕"}</i><span>{k}</span><b className="t-num">{v}</b></li>)}</ul>}
      <div className="cl-gauges">
        <Gauge label="Soiling" v={S.w?.soiling ?? S.frame.soiling} max={0.3} mark={trig} fmt={pct} cls="dust" />
        <Gauge label="Tank" v={S.frame.tank / 100} max={1} mark={DEFAULT_CONFIG.tankCleaningReservePct / 100} fmt={(x) => `${(x * 100).toFixed(0)}%`} cls="sky" />
      </div>
    </div>
    <div className="cl-nav">
      <button type="button" className="btn btn--line btn--sm" disabled={step === 0} onClick={() => setStep(step - 1)}>← Back</button>
      <button type="button" className="btn btn--sm" disabled={step === STEPS_.length - 1} onClick={() => setStep(step + 1)}>Next step →</button>
    </div>
    <details className="cl-try">
      <summary className="t-label">Change the conditions</summary>
      <label className="inp"><span>Tank at 00:00</span><b className="t-num">{tank}%</b><input className="range" type="range" min="0" max="100" value={tank} style={{ "--p": `${tank}%` }} onChange={(e) => setTank(+e.target.value)} /></label>
      <label className="inp"><span>Wind strength</span><b className="t-num">{wind.toFixed(2)}×</b><input className="range" type="range" min="0" max="1.8" step="0.05" value={wind} style={{ "--p": `${(wind / 1.8) * 100}%` }} onChange={(e) => setWind(+e.target.value)} /></label>
      <p className="t-fine">Try a tank below {DEFAULT_CONFIG.tankCleaningReservePct}% or a windier evening: the rinse is refused and the explanation changes.</p>
    </details>
  </div>;
}
function Gauge({ label, v, max, mark, fmt, cls }) {
  return <div className={`gauge ${cls}`}><span className="t-label">{label}</span><div className="g-track"><i style={{ width: `${Math.min(100, (v / max) * 100)}%` }} /><em style={{ left: `${(mark / max) * 100}%` }} /></div><b className="t-num">{fmt(v)}</b></div>;
}

createRoot(document.getElementById("lab-root")).render(<Lab />);
