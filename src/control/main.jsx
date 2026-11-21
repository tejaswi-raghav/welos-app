import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createControllerState, DEFAULT_CONFIG, evaluateController, MODES } from "./engine.js";
import { advanceSimulation, createInitialSensors, SCENARIOS } from "./simulator.js";
import "../design/tokens.css";
import "./control.css";
import { modeReason } from "../os/explain.js";
import "../ai/mount.jsx";

const TICK_SECONDS = 60;
const MAX_HISTORY = 48;

const scenarioLabels = {
  [SCENARIOS.CLEAR]: "Clear day",
  [SCENARIOS.DUST]: "Dust event",
  [SCENARIOS.STORM]: "Storm front",
  [SCENARIOS.OUTAGE]: "Grid outage",
};

const modeLabels = {
  [MODES.STARTUP]: "Starting up",
  [MODES.NORMAL]: "Normal operation",
  [MODES.CONSERVE]: "Protecting reserve",
  [MODES.STORM]: "Storm mode",
  [MODES.CLEANING]: "Cleaning panels",
  [MODES.MANUAL]: "Supervisor control",
  [MODES.FAULT]: "Safety isolation",
};

function fmt(value, unit = "", digits = 1) {
  return `${Number(value).toFixed(digits)}${unit}`;
}

function App() {
  const initialSensors = useMemo(() => createInitialSensors(), []);
  const initialState = useMemo(() => ({ ...createControllerState(), uptimeSeconds: 10 }), []);
  const initialResult = useMemo(() => evaluateController({ sensors: initialSensors, previousState: initialState, dtSeconds: TICK_SECONDS }), [initialSensors, initialState]);
  const [sensors, setSensors] = useState(initialSensors);
  const [shown, setShown] = useState(initialSensors); // the inputs the current decision was made from
  const [controller, setController] = useState(initialResult.nextState);
  const [result, setResult] = useState(initialResult);
  const [scenario, setScenario] = useState(SCENARIOS.CLEAR);
  const [manualEnabled, setManualEnabled] = useState(false);
  const [manualMode, setManualMode] = useState(MODES.NORMAL);
  const [paused, setPaused] = useState(false);
  const [history, setHistory] = useState(() => [historyPoint(initialSensors, initialResult)]);
  const [events, setEvents] = useState(() => [{ id: 1, time: initialSensors.timestamp, level: "info", text: "Control engine online; all interlocks validated" }]);
  const [acknowledged, setAcknowledged] = useState([]);
  const controllerRef = useRef(initialResult.nextState);
  const scenarioRef = useRef(scenario);
  const manualRef = useRef({ enabled: manualEnabled, requestedMode: manualMode });
  const elapsedRef = useRef(0);
  const lastModeRef = useRef(initialResult.mode);
  const lastAlarmIdsRef = useRef(new Set(initialResult.alarms.map((item) => item.id)));

  useEffect(() => { scenarioRef.current = scenario; }, [scenario]);
  useEffect(() => { manualRef.current = { enabled: manualEnabled, requestedMode: manualMode }; }, [manualEnabled, manualMode]);

  useEffect(() => {
    if (paused) return undefined;
    const interval = window.setInterval(() => {
      setSensors((currentSensors) => {
        const evaluated = evaluateController({
          sensors: currentSensors,
          previousState: controllerRef.current,
          manual: manualRef.current,
          dtSeconds: TICK_SECONDS,
        });
        elapsedRef.current += TICK_SECONDS;
        const nextSensors = advanceSimulation({
          sensors: currentSensors,
          result: evaluated,
          scenario: scenarioRef.current,
          elapsedSeconds: elapsedRef.current,
          dtSeconds: TICK_SECONDS,
        });
        controllerRef.current = evaluated.nextState;
        setShown(currentSensors);
        setController(evaluated.nextState);
        setResult(evaluated);
        setHistory((items) => [...items, historyPoint(nextSensors, evaluated)].slice(-MAX_HISTORY));

        const newEvents = [];
        if (lastModeRef.current !== evaluated.mode) {
          newEvents.push({ id: Date.now(), time: nextSensors.timestamp, level: evaluated.mode === MODES.FAULT ? "critical" : "info", text: `Mode changed: ${modeLabels[lastModeRef.current]} → ${modeLabels[evaluated.mode]}` });
          lastModeRef.current = evaluated.mode;
        }
        const alarmIds = new Set(evaluated.alarms.map((item) => item.id));
        evaluated.alarms.forEach((item) => {
          if (!lastAlarmIdsRef.current.has(item.id)) newEvents.push({ id: `${Date.now()}-${item.id}`, time: nextSensors.timestamp, level: item.severity, text: item.title });
        });
        lastAlarmIdsRef.current = alarmIds;
        if (newEvents.length) setEvents((items) => [...newEvents, ...items].slice(0, 20));
        return nextSensors;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [paused]);

  const activeAlarms = result.alarms.filter((item) => !acknowledged.includes(item.id));

  const applyScenario = (nextScenario) => {
    setScenario(nextScenario);
    setAcknowledged([]);
    setEvents((items) => [{ id: Date.now(), time: sensors.timestamp, level: "info", text: `Simulation profile loaded: ${scenarioLabels[nextScenario]}` }, ...items].slice(0, 20));
  };

  const [showIO, setShowIO] = useState(false);
  const [inspect, setInspect] = useState("Battery");
  const reason = modeReason(result, shown, DEFAULT_CONFIG);
  const decision = controller.lastDecision.replace(/^Storm mode: /, "").replace(/^./, (c) => c.toUpperCase());
  const clock = new Date(sensors.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="control-app">
      <header className="c-top">
        <a className="c-brand" href="/" aria-label="WELOS home"><img src="/brand/welos-header-ink.png" alt="welos" width="120" height="26" /></a>
        <div className="c-title"><b>Control OS</b><span className="c-sim"><i aria-hidden="true" />Simulator<span className="c-long"> · not connected to hardware</span></span></div>
        <nav className="c-links" aria-label="Site"><a href="/">Overview</a><a href="/studio.html">Studio</a><button type="button" className="c-ai" data-ai-open>Ask WELOS</button></nav>
      </header>

      <main className="c-main">
        <section className={`c-state mode-${result.mode.toLowerCase()}`} aria-live="polite">
          <div className="c-state-main">
            <p className="c-eyebrow"><span className="c-clock">{clock}</span> simulated time · 1 s = 1 min</p>
            <h1><span className="c-mode">{modeLabels[result.mode]}</span></h1>
            <p className="c-decision">{decision}.</p>
            <p className="c-why"><b>Why:</b> {reason}</p>
          </div>
          <div className="c-actions">
            <p className="c-eyebrow" id="scenLabel">Inject a condition</p>
            <div className="c-seg" role="radiogroup" aria-labelledby="scenLabel">
              {Object.values(SCENARIOS).map((item) => (
                <button key={item} type="button" role="radio" aria-checked={scenario === item} className={scenario === item ? "on" : ""} onClick={() => applyScenario(item)}>
                  <b>{scenarioLabels[item]}</b><small>{scenarioDescription(item)}</small>
                </button>
              ))}
            </div>
            <button type="button" className="c-pause" onClick={() => setPaused(!paused)} aria-pressed={paused}>{paused ? "Resume simulation" : "Pause simulation"}</button>
          </div>
        </section>

        <section className="c-flow-wrap" aria-labelledby="flowTitle">
          <header className="c-sec-head"><h2 id="flowTitle">Where the power is going</h2><p>Arrows point the way energy moves right now; thickness follows kW.</p></header>
          <div className="c-flow-grid">
            <div className="c-flow-col"><EnergyFlow result={result} sensors={shown} inspect={inspect} setInspect={setInspect} /><NodeWhy id={inspect} result={result} sensors={shown} /></div>
            <Trend history={history} />
          </div>
        </section>

        <section className="c-cards" aria-label="Subsystems">
          <Card title="Battery" kicker={`${result.power.reserveSoc}% reserve protected`} id="energy">
            <BatteryPanel sensors={sensors} result={result} history={history} />
          </Card>
          <Card title="Water" kicker={result.water.storageActive ? "Capturing rain" : result.water.firstFlushActive ? "Diverting first flush" : "Standby"} id="water">
            <WaterPanel sensors={sensors} result={result} />
          </Card>
          <Card title="Panel cleaning" kicker={result.cleaning.eligible ? "Safe to clean" : "Deferred"} id="maintenance">
            <Maintenance sensors={sensors} result={result} controller={controller} />
          </Card>
        </section>

        <section className="c-cards c-cards-2" aria-label="Operations">
          <Card title="Alarms and events" kicker={activeAlarms.length ? `${activeAlarms.length} open` : "No open alarms"} id="events">
            <EventJournal alarms={activeAlarms} events={events} onAcknowledge={(id) => setAcknowledged((items) => [...items, id])} />
          </Card>
          <Card title="Supervisor control" kicker={manualEnabled ? "Supervisor in control" : "Automatic engine"}>
            <ControlAuthority manualEnabled={manualEnabled} setManualEnabled={setManualEnabled} manualMode={manualMode} setManualMode={setManualMode} />
          </Card>
          <Card title="Conditions" kicker="Simulated sensors">
            <Conditions sensors={shown} />
            <button type="button" className="c-io-toggle" aria-expanded={showIO} onClick={() => setShowIO(!showIO)}>{showIO ? "Hide" : "Show"} actuator states (11)</button>
            {showIO && <ActuatorTable outputs={result.outputs} />}
          </Card>
        </section>

        <footer className="c-foot">Reference control software running in your browser on simulated sensors for a 3.6 kWp, 24 kWh reference unit. Hardware calibration and certification are required before field actuation. The same state machine ships in the ESP32 reference firmware.</footer>
      </main>
    </div>
  );
}

function Card({ title, kicker, id, children }) {
  return <section className="c-card" id={id}><header><h2>{title}</h2><span>{kicker}</span></header>{children}</section>;
}

function EnergyFlow({ result, sensors, inspect, setInspect }) {
  const p = result.power, o = result.outputs;
  const bat = p.batteryChargeKw - p.batteryDischargeKw;
  const grid = p.gridExportKw - p.gridImportKw;
  const w = (kw) => Math.max(1.5, Math.min(9, 1.5 + kw * 2.2));
  const link = (id, d, kw, dir, color) => kw > 0.02
    ? <path key={id} d={d} className={`c-link ${dir < 0 ? "rev" : ""}`} stroke={color} strokeWidth={w(kw)} />
    : <path key={id} d={d} className="c-link idle" />;
  const node = (x, y, label, value, sub, cls = "") => (
    <g className={`c-node ${cls} ${inspect === label ? "sel" : ""}`} transform={`translate(${x} ${y})`} role="button" tabIndex={0} aria-pressed={inspect === label} aria-label={`Why: ${label}`}
      onClick={() => setInspect(label)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setInspect(label); } }}>
      <rect x="-74" y="-30" width="148" height="60" rx="6" />
      <text className="n-l" y="-9">{label}</text>
      <text className="n-v" y="13">{value}</text>
      {sub && <text className="n-s" y="46">{sub}</text>}
    </g>
  );
  const rows = [
    ["Sun", "→", "bus", fmt(p.pvKw, " kW", 1), "s"],
    ["Wind", "→", "bus", o.windBrake ? "Braked" : fmt(p.windKw, " kW", 1), "w"],
    ["Bus", "→", "Home", fmt(p.servedLoadKw, " kW", 1), "h"],
    ["Bus", bat >= 0 ? "→" : "←", "Battery", Math.abs(bat) < 0.02 ? "Idle" : fmt(Math.abs(bat), " kW", 1), "b"],
    ["Bus", grid >= 0 ? "→" : "←", "Grid", !sensors.gridAvailable ? "Offline" : fmt(Math.abs(grid), " kW", 1), "g"],
  ];
  return <figure className="c-flow">
    <ul className="c-flow-list">{rows.map(([a, d, b, v, c]) => { const n = a === "Bus" ? b : a; return <li key={b + a} className={c}><button type="button" aria-pressed={inspect === n} onClick={() => setInspect(n)}><span>{a} <i>{d}</i> {b}</span><b>{v}</b></button></li>; })}</ul>
    <svg viewBox="0 0 640 330" role="img" aria-label={`Sun ${fmt(p.pvKw, " kW", 1)}, wind ${fmt(p.windKw, " kW", 1)}, home ${fmt(p.servedLoadKw, " kW", 1)}, battery ${bat >= 0 ? "charging" : "discharging"} ${fmt(Math.abs(bat), " kW", 1)}, grid ${sensors.gridAvailable ? (grid >= 0 ? "export" : "import") + " " + fmt(Math.abs(grid), " kW", 1) : "unavailable"}`}>
      {link("pv", "M150 70 C 230 70 250 165 290 165", p.pvKw, 1, "var(--sun)")}
      {link("wind", "M150 260 C 230 260 250 165 290 165", p.windKw, 1, "var(--ember)")}
      {link("home", "M350 165 C 400 165 420 70 490 70", p.servedLoadKw, 1, "var(--ink)")}
      {link("bat", "M350 165 L 490 165", Math.abs(bat), bat >= 0 ? 1 : -1, "var(--ember)")}
      {link("grid", "M350 165 C 400 165 420 260 490 260", Math.abs(grid), grid >= 0 ? 1 : -1, "var(--grid)")}
      <g className="c-bus" transform="translate(320 165)"><rect x="-30" y="-46" width="60" height="92" rx="5" /><text y="-4">48 V</text><text y="12">bus</text></g>
      {node(76, 70, "Sun", fmt(p.pvKw, " kW", 1), `${fmt(sensors.solarIrradianceWm2, " W/m²", 0)}`, "sun")}
      {node(76, 260, "Wind", o.windBrake ? "Braked" : fmt(p.windKw, " kW", 1), `${fmt(sensors.windSpeedMs, " m/s", 1)}`, "wind")}
      {node(564, 70, "Home", fmt(p.servedLoadKw, " kW", 1), p.loadShedKw > 0 ? `${fmt(p.loadShedKw, " kW shed", 1)}` : "all loads served")}
      {node(564, 165, "Battery", Math.abs(bat) < 0.02 ? "Idle" : `${bat > 0 ? "+" : "−"}${fmt(Math.abs(bat), " kW", 1)}`, null, "bat")}
      {node(564, 260, "Grid", !sensors.gridAvailable ? "Offline" : Math.abs(grid) < 0.02 ? "0 kW" : `${grid > 0 ? "export " : "import "}${fmt(Math.abs(grid), " kW", 1)}`, null, "grid")}
    </svg>
  </figure>;
}

// Why is this node doing what it is doing? Measurements and limits straight from the engine.
function NodeWhy({ id, result, sensors }) {
  const c = DEFAULT_CONFIG, p = result.power, o = result.outputs;
  const kw = (x) => fmt(x, " kW", 2);
  const W = {
    Sun: () => [p.pvKw > 0.02 ? `Producing ${kw(p.pvKw)}.` : "Not producing: no usable sunlight.",
      [["Sunlight", fmt(sensors.solarIrradianceWm2, " W/m²", 0)], ["Dust loss", fmt(sensors.soilingIndex * 100, "%", 0)], ["Panel temp", fmt(sensors.panelTempC, " °C", 0)], ["Cleans at", `${c.cleaningAutoThreshold * 100}% dust`]],
      sensors.soilingIndex >= c.cleaningAutoThreshold ? (result.cleaning.eligible ? "Dust passed the trigger and every safety check passes, so a rinse runs." : `Dust passed the trigger but cleaning is held: ${result.cleaning.blockers.join(", ").toLowerCase()}.`) : "Output follows sunlight, minus dust and heat losses."],
    Wind: () => [o.windBrake ? "Braked." : p.windKw > 0.02 ? `Producing ${kw(p.windKw)}.` : "Turning too slowly to produce.",
      [["Wind", fmt(sensors.windSpeedMs, " m/s", 1)], ["Starts at", `${c.windCutInMs} m/s`], ["Brakes at", `${c.windCutOutMs} m/s`], ["Storm mode at", `${c.windStormMs} m/s`]],
      o.windBrake ? `Wind is outside the safe band (${c.windCutInMs}–${c.windCutOutMs} m/s) or a fault is active, so the rotor is braked and its contactor opened.` : "Inside the safe band: the rectifier feeds the DC bus."],
    Home: () => [`Supplying ${kw(p.servedLoadKw)}${p.loadShedKw > 0 ? `, shedding ${kw(p.loadShedKw)}` : ""}.`,
      [["Demand", kw(p.demandKw)], ["From sun + wind", kw(Math.min(p.renewableKw, p.servedLoadKw))], ["From battery", kw(p.batteryDischargeKw)], ["From grid", kw(p.gridImportKw)]],
      p.loadShedKw > 0 ? "Islanded with the battery at its reserve: non-critical circuits are shed to protect it." : "The home is always served first; the battery and grid only fill what the roof can't."],
    Battery: () => [p.batteryChargeKw > 0.01 ? `Charging ${kw(p.batteryChargeKw)}.` : p.batteryDischargeKw > 0.01 ? `Supplying ${kw(p.batteryDischargeKw)}.` : "Holding.",
      [["Charge", fmt(sensors.batterySoc, "%", 0)], ["Reserve now", `${p.reserveSoc}%`], ["Max rate", kw(c.batteryMaxChargeKw)], ["Temperature", fmt(sensors.batteryTempC, " °C", 0)]],
      p.batteryChargeKw > 0.01 ? "Sun and wind exceed the home's demand, so the surplus goes here before any export."
        : p.batteryDischargeKw > 0.01 ? `Demand is above generation, so the battery covers the gap down to its ${p.reserveSoc}% reserve.`
        : sensors.batterySoc <= p.reserveSoc + 0.5 ? `At its ${p.reserveSoc}% reserve: kept for outages and storms.` : "Generation and demand are balanced."],
    Grid: () => [!sensors.gridAvailable ? "Offline: the unit is running as an island." : p.gridImportKw > 0.01 ? `Importing ${kw(p.gridImportKw)}.` : p.gridExportKw > 0.01 ? `Exporting ${kw(p.gridExportKw)}.` : "Idle.",
      [["Grid", sensors.gridAvailable ? "Available" : "Down"], ["Import", kw(p.gridImportKw)], ["Export", kw(p.gridExportKw)], ["Curtailed", kw(p.curtailedKw)]],
      !sensors.gridAvailable ? "Without the grid the reserve rises to 35% and only the home is supplied." : p.gridImportKw > 0.01 ? "Last resort: used only after the battery reaches its reserve." : p.gridExportKw > 0.01 ? "Battery is full or at its charge limit, so surplus is exported." : "Nothing to buy or sell right now."],
  };
  const f = W[id] || W.Battery;
  const [head, facts, why] = f();
  return <aside className="c-why-card" aria-live="polite">
    <p className="c-eyebrow">Why · {id}</p>
    <h3>{head}</h3>
    <p>{why}</p>
    <dl>{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    <p className="c-hint">Select any box in the diagram to ask why.</p>
  </aside>;
}

function Trend({ history }) {
  const W = 300, H = 150, n = history.length;
  const max = Math.max(1, ...history.map((h) => Math.max(h.renewable, h.load))) * 1.1;
  const x = (i) => (n < 2 ? 0 : (i / (n - 1)) * W);
  const y = (v) => H - (v / max) * H;
  const line = (k) => history.map((h, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(h[k]).toFixed(1)}`).join("");
  const last = history[n - 1] || { renewable: 0, load: 0 };
  const surplus = last.renewable >= last.load;
  return <figure className="c-trend">
    <figcaption><b>{surplus ? "Generation is covering demand" : "Demand is above generation"}</b><span>Last {n} simulated minutes</span></figcaption>
    <svg viewBox={`0 0 ${W} ${H + 18}`} preserveAspectRatio="none" role="img" aria-label="Generation and demand over the last simulated minutes">
      <line x1="0" x2={W} y1={H} y2={H} stroke="var(--rule-strong)" />
      <path d={`${line("renewable")}L${x(n - 1)} ${H}L0 ${H}Z`} fill="rgba(255,184,0,.22)" />
      <path d={line("renewable")} fill="none" stroke="var(--sun)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <path d={line("load")} fill="none" stroke="var(--ink)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
    <ul className="c-trend-key"><li><i className="s" />Sun + wind {fmt(last.renewable, " kW", 1)}</li><li><i className="l" />Demand {fmt(last.load, " kW", 1)}</li></ul>
  </figure>;
}

function BatteryPanel({ sensors, result, history }) {
  const trend = history.map((item) => item.soc);
  return <div className="battery-wrap">
    <div className="soc"><div className="soc-top"><strong>{fmt(sensors.batterySoc, "%", 0)}</strong><span>{result.power.batteryChargeKw > 0 ? `charging ${fmt(result.power.batteryChargeKw, " kW", 1)}` : result.power.batteryDischargeKw > 0 ? `supplying ${fmt(result.power.batteryDischargeKw, " kW", 1)}` : "holding"}</span></div><div className="soc-bar"><i style={{ width: `${sensors.batterySoc}%` }} /><b style={{ left: `${result.power.reserveSoc}%` }} title="Reserve" /></div><small>Reserve line at {result.power.reserveSoc}%</small></div>
    <Sparkline values={trend} color="#F86A00" />
    <div className="instrument-row"><Instrument label="Voltage" value={fmt(sensors.batteryVoltageV, " V", 1)} /><Instrument label="Current" value={fmt(sensors.batteryCurrentA, " A", 1)} /><Instrument label="Temperature" value={fmt(sensors.batteryTempC, "°C", 1)} /></div>
  </div>;
}

function WaterPanel({ sensors, result }) {
  const route = result.water.firstFlushActive ? "First flush" : result.water.storageActive ? "Filter to storage" : result.water.overflowActive ? "Bypass / overflow" : "Standby";
  return <div className="water-layout"><div className="tank"><div className="tank-fill" style={{ height: `${sensors.tankLevelPct}%` }} /><span>{fmt(sensors.tankLevelPct, "%", 0)}</span></div><div className="water-data"><Instrument label="Rainfall" value={fmt(sensors.rainfallMmHr, " mm/h", 1)} /><Instrument label="Capture" value={fmt(result.water.captureRateLpm, " L/min", 1)} /><Instrument label="Turbidity" value={fmt(sensors.waterTurbidityNtu, " NTU", 1)} /><div className="route-state"><span>Active route</span><b>{route}</b></div></div></div>;
}

function Conditions({ sensors }) {
  return <div className="condition-grid"><Instrument label="Irradiance" value={fmt(sensors.solarIrradianceWm2, " W/m²", 0)} /><Instrument label="Wind" value={fmt(sensors.windSpeedMs, " m/s", 1)} /><Instrument label="Ambient" value={fmt(sensors.ambientTempC, "°C", 1)} /><Instrument label="Panel" value={fmt(sensors.panelTempC, "°C", 1)} /><Instrument label="Humidity" value={fmt(sensors.humidityPct, "% RH", 0)} /><Instrument label="Grid" value={sensors.gridAvailable ? "Available" : "Offline"} /></div>;
}

function Maintenance({ sensors, result, controller }) {
  return <div className="maintenance-layout"><div className="soiling-index"><div className="soc-top"><strong>{fmt(sensors.soilingIndex * 100, "%", 0)}</strong><span>output lost to dust</span></div><div className="soc-bar dust"><i style={{ width: `${Math.min(100, sensors.soilingIndex / 0.25 * 100)}%` }} /><b style={{ left: `${DEFAULT_CONFIG.cleaningAutoThreshold / 0.25 * 100}%` }} /></div><small>Cleans automatically at {fmt(DEFAULT_CONFIG.cleaningAutoThreshold * 100, "%", 0)}</small></div><div className="eligibility"><span className={result.cleaning.eligible ? "eligible" : "blocked"}>{result.cleaning.eligible ? "Cleaning eligible" : "Cleaning deferred"}</span>{result.cleaning.eligible ? <p>Water, wind, irradiance and panel temperature are inside the safe envelope.</p> : <ul>{result.cleaning.blockers.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul>}<small>{controller.cleaningCycles} completed cycles</small></div></div>;
}

function ControlAuthority({ manualEnabled, setManualEnabled, manualMode, setManualMode }) {
  return <div className="authority">
    <label className="c-switch"><input type="checkbox" checked={manualEnabled} onChange={(e) => setManualEnabled(e.target.checked)} /><span>Take supervisor control</span></label>
    <fieldset className="mode-buttons" disabled={!manualEnabled}><legend className="sr-only">Requested mode</legend>{[MODES.NORMAL, MODES.CONSERVE, MODES.STORM, MODES.CLEANING].map((mode) => <button key={mode} type="button" onClick={() => setManualMode(mode)} aria-pressed={manualMode === mode} className={manualMode === mode ? "on" : ""}>{modeLabels[mode]}</button>)}</fieldset>
    <p className="safety-copy">{manualEnabled ? "Requests are applied only when no higher-priority condition applies. " : "Turn on to request a mode. "}Emergency, battery, inverter, wind and water interlocks always override supervisor commands.</p>
  </div>;
}

function EventJournal({ alarms, events, onAcknowledge }) {
  const rows = alarms.length ? alarms.map((item) => ({ ...item, alarm: true, time: Date.now(), text: item.title })) : events;
  return <div className="event-list">{rows.slice(0, 6).map((item) => <div key={item.id} className={`event event-${item.severity || item.level}`}><i /><time>{new Date(item.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time><div><b>{item.text}</b>{item.detail && <small>{item.detail}</small>}</div>{item.alarm && <button type="button" onClick={() => onAcknowledge(item.id)}>Acknowledge</button>}</div>)}</div>;
}

function ActuatorTable({ outputs }) {
  const labels = { pvContactor: "PV contactor", windContactor: "Wind contactor", windBrake: "Turbine brake", batteryContactor: "Battery contactor", gridContactor: "Grid contactor", firstFlushValve: "First-flush valve", storageValve: "Storage valve", overflowValve: "Overflow valve", cleaningPump: "Cleaning pump", filtrationPump: "Filtration pump", loadShedRelay: "Load-shed relay" };
  return <div className="actuator-grid">{Object.entries(outputs).map(([key, value]) => <div key={key}><span>{labels[key]}</span><b className={value ? "state-on" : "state-off"}>{value ? "Energized" : "Open"}</b></div>)}</div>;
}

function Instrument({ label, value }) {
  return <div className="instrument"><span>{label}</span><b>{value}</b></div>;
}

function Sparkline({ values, color }) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(1, max - min);
  const points = values.map((value, index) => `${(index / Math.max(1, values.length - 1)) * 100},${36 - ((value - min) / range) * 30}`).join(" ");
  return <svg className="sparkline" viewBox="0 0 100 40" preserveAspectRatio="none" aria-label="Battery state-of-charge trend"><polyline points={points} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg>;
}

function historyPoint(sensors, result) {
  return { time: sensors.timestamp, renewable: result.power.renewableKw, load: result.power.demandKw, soc: sensors.batterySoc, tank: sensors.tankLevelPct };
}

function scenarioDescription(scenario) {
  if (scenario === SCENARIOS.DUST) return "Rising soiling and wind";
  if (scenario === SCENARIOS.STORM) return "High wind and rain capture";
  if (scenario === SCENARIOS.OUTAGE) return "Islanded reserve protection";
  return "Nominal solar production";
}

createRoot(document.getElementById("control-root")).render(<App />);
