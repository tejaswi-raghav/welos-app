import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../ui/chrome.js";
import "./explorer.css";
import { useStage, useAnnotations } from "../twin/useStage.js";
import { LAYERS } from "../twin/model.js";
import { simulateDay, modeLabel } from "../twin/sim.js";
import { NODES, nodeById, nodeForPart, traceFrom, routesFor } from "../twin/topology.js";
import { parts, partById, systems } from "../model/parts.js";
import bom from "../../hardware/bom.json";

const BOM = Object.fromEntries(bom.assemblies.flatMap((a) => a.items.map((i) => [i.ref, i])));
const days = { clear: simulateDay("clear"), dust: simulateDay("dust"), rain: simulateDay("rain") };
const MOMENTS = [
  { id: "noon", label: "Noon", frame: days.clear.frames[50], note: "Clear day 12:30" },
  { id: "dusk", label: "Dusk rinse", frame: days.dust.frames[69], note: "Dust day 17:15" },
  { id: "storm", label: "Storm", frame: days.rain.frames[67], note: "Rain day 16:45" },
  { id: "night", label: "Night", frame: days.clear.frames[88], note: "Clear day 22:00" },
];
const SYSTEMS = systems.filter((s) => s.id !== "overview");
const HOME = { pos: [13, 7.2, 15.5], target: [0, 0.4, 0], fov: 32 };

const VALUE_ANNOS = [
  { id: "v-pv", node: "pv", key: "pv-array", at: [1.8, 1.75, 0.5], cls: "power" },
  { id: "v-wind", node: "wind", key: "vawt-rotor", at: [3.25, 3.1, -0.9], cls: "power" },
  { id: "v-batt", node: "battery", key: "lifepo4-battery", at: [1.2, -1.36, 1.97], cls: "power" },
  { id: "v-tank", node: "tank", key: "water-tank", at: [-2.8, 0.3, 1.67], cls: "water" },
  { id: "v-ctrl", node: "ctrl", key: "controller-pcb", at: [-0.37, -0.3, 1.63], cls: "" },
];

function partsOfNodes(ids) {
  const out = new Set();
  ids.forEach((id) => nodeById[id]?.parts.forEach((p) => out.add(p)));
  return out;
}

function Explorer() {
  const [canvasRef, stage] = useStage({ env: "exhibit", orbit: true });
  const [sel, setSel] = useState(() => (partById[location.hash.slice(1)] ? location.hash.slice(1) : null));
  const [layer, setLayer] = useState(null);
  const [explode, setExplode] = useState(0);
  const [view, setView] = useState("physical");
  const [flows, setFlows] = useState("active");
  const [values, setValues] = useState(true);
  const [trace, setTrace] = useState(true);
  const [moment, setMoment] = useState("noon");
  const [query, setQuery] = useState("");
  const [panel, setPanel] = useState("parts");
  const [hover, setHover] = useState(null);
  const annoRef = useRef(null);
  const frame = MOMENTS.find((m) => m.id === moment).frame;

  const node = sel ? nodeForPart(sel) : null;
  const traced = useMemo(() => (node && trace ? traceFrom(node.id) : null), [node, trace]);

  // stage wiring
  useEffect(() => {
    if (!stage) return undefined;
    stage.setPose(HOME, 0);
    stage.setHoverEnabled(true);
    const offPick = stage.on("pick", (id) => { if (id && partById[id]) { setSel(id); setLayer(null); } else if (!id) setSel(null); });
    const offHover = stage.on("hover", (id) => setHover(id && partById[id] ? id : null));
    return () => { offPick(); offHover(); };
  }, [stage]);
  useEffect(() => { stage && stage.setFrame(frame); }, [stage, frame]);
  useEffect(() => { stage && stage.setExplode(explode); }, [stage, explode]);
  useEffect(() => { stage && stage.setSchematic(view === "schematic" ? 1 : 0); }, [stage, view]);
  useEffect(() => {
    if (!stage) return;
    let routeFilter = null;
    if (traced && node) routeFilter = routesFor(new Set([node.id, ...traced.up, ...traced.down]));
    else if (layer) routeFilter = new Set(LAYERS.find((l) => l.id === layer).id === "water" ? ["water"] : ["power"]);
    stage.setFlows(flows === "off" ? "off" : flows === "all" ? "all" : "active", routeFilter && routeFilter.size ? routeFilter : null);
  }, [stage, flows, traced, node, layer]);
  useEffect(() => {
    if (!stage) return;
    stage.setSelected(sel);
    if (sel) {
      const focus = new Set([sel]);
      if (traced && node) partsOfNodes([node.id, ...traced.up, ...traced.down]).forEach((p) => focus.add(p));
      else parts.filter((p) => p.system === partById[sel].system).forEach((p) => focus.add(p.id));
      ["pv-cable", "wind-cable", "canopy", "wind-mast"].forEach((k) => { if ([...focus].some((p) => (k === "pv-cable" && p === "pv-array") || (k === "wind-cable" && p === "wind-rectifier"))) focus.add(k); });
      stage.setFocus([...focus]);
      stage.focusPart(sel);
      history.replaceState(null, "", `#${sel}`);
    } else if (layer) {
      const L = LAYERS.find((l) => l.id === layer);
      stage.setFocus(L.keys);
      stage.frameKeys(L.keys, 1300, { distance: 2.7 });
    } else {
      stage.setFocus(null);
      history.replaceState(null, "", location.pathname);
    }
  }, [stage, sel, layer, traced, node]);
  useEffect(() => { if (layer && explode < 0.5) setExplode(0.6); }, [layer]);

  useAnnotations(stage, annoRef, values ? VALUE_ANNOS : []);
  const reset = () => { setSel(null); setLayer(null); setExplode(0); stage && stage.setPose(HOME, 1200); };

  const q = query.trim().toLowerCase();
  const p = sel ? partById[sel] : null;
  const sys = p ? SYSTEMS.find((s) => s.id === p.system) : null;
  const spec = p ? BOM[p.code] : null;

  return (
    <div className={`explorer view-${view} panel-${panel}`}>
      <div className="ex-stage twin-stage">
        <i className="stage-sun" aria-hidden="true" />
        <canvas ref={canvasRef} aria-label="Interactive 3D model of the WELOS unit. Use the parts list to select components without the model." />
        <div className="annos" ref={annoRef} aria-hidden="true">
          {values && VALUE_ANNOS.map((a) => {
            const n = nodeById[a.node];
            return <div key={a.id} data-id={a.id} className={`vtag ${a.cls} ${n.on(frame) ? "on" : ""}`}><i /><span className="t-label">{n.code}</span><b className="t-num">{n.value(frame)}</b></div>;
          })}
        </div>
        {hover && hover !== sel && <div className="ex-hover t-label">{partById[hover].code} · {partById[hover].name}</div>}
        {stage === false && <div className="ex-nogl"><img src="/explore/ref-full.jpg" alt="Reference rendering of the WELOS unit" /><p>The 3D model needs WebGL. Every part, layer and connection is still available in the panels.</p></div>}
        {stage === null && <div className="loader ex-loader"><svg viewBox="0 0 72 40" aria-hidden="true"><path d="M4 36 Q36 -8 68 36" /><path className="sun" d="M4 36 Q36 -8 68 36" /></svg><span>Assembling the model</span></div>}
      </div>

      <aside className="ex-left sheet" aria-label="Components and layers">
        <div className="seg ex-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={panel === "parts"} onClick={() => setPanel("parts")}>Components</button>
          <button type="button" role="tab" aria-selected={panel === "layers"} onClick={() => setPanel("layers")}>Layers</button>
        </div>
        {panel === "parts" ? <>
          <label className="ex-search"><span className="sr-only">Filter components</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter, e.g. pump or E03" /></label>
          <div className="ex-tree">
            {SYSTEMS.map((s) => {
              const list = parts.filter((x) => x.system === s.id && (!q || `${x.code} ${x.name} ${x.category}`.toLowerCase().includes(q)));
              if (!list.length) return null;
              return <section key={s.id}>
                <h3 className="t-label"><span>{s.code}</span>{s.name}</h3>
                <ul>{list.map((x) => <li key={x.id}><button type="button" aria-pressed={sel === x.id} className={hover === x.id ? "hov" : ""} onClick={() => { setSel(sel === x.id ? null : x.id); setLayer(null); }} onMouseEnter={() => stage && (stage.hovered = x.id)} onMouseLeave={() => stage && (stage.hovered = null)}>
                  <span className="t-num">{x.code}</span><span>{x.name}</span>
                </button></li>)}</ul>
              </section>;
            })}
          </div>
        </> : <ol className="ex-layers">
          {LAYERS.map((L) => <li key={L.id}><button type="button" aria-pressed={layer === L.id} className={`lc-${L.color}`} onClick={() => { setLayer(layer === L.id ? null : L.id); setSel(null); }}>
            <span className="t-num">{L.code}</span><b>{L.name}</b><small>{L.blurb}</small>
          </button></li>)}
        </ol>}
      </aside>

      <aside className={`ex-info sheet ${p ? "on" : ""}`} aria-live="polite" aria-label="Selected component">
        {p ? <>
          <div className="ex-info-head">
            <p className="t-label">{p.code} · {p.category}</p>
            <button type="button" className="icon-btn" aria-label="Clear selection" onClick={() => setSel(null)}>✕</button>
          </div>
          <h2 className="t-h2">{p.name}</h2>
          <p className="ex-role">{p.role}</p>
          {node && <div className="ex-live">
            <span className="t-label">Simulated · {MOMENTS.find((m) => m.id === moment).note}</span>
            <div><b className="t-num">{node.value(frame)}</b>{node.sub && <small>{node.sub(frame)}</small>}</div>
          </div>}
          <dl className="ex-dl">
            <div><dt className="t-label">Part of</dt><dd>{sys.name} <span className="muted">— {sys.summary}</span></dd></div>
            {node && traced && <div><dt className="t-label">Fed by</dt><dd className="ex-links">{[...traced.up].map((id) => <span key={id} className={`lnk ${nodeById[id].domain}`}>{nodeById[id].label}</span>)}{!traced.up.size && <span className="muted">Nothing upstream: this is a source</span>}</dd></div>}
            {node && traced && <div><dt className="t-label">Feeds</dt><dd className="ex-links">{[...traced.down].map((id) => <span key={id} className={`lnk ${nodeById[id].domain}`}>{nodeById[id].label}</span>)}{!traced.down.size && <span className="muted">Nothing downstream</span>}</dd></div>}
            {spec && <div><dt className="t-label">BOM {spec.ref}</dt><dd>{spec.item}<span className="muted"> · {spec.selection}</span></dd></div>}
            <div><dt className="t-label">Concept basis</dt><dd>{p.evidence}</dd></div>
            <div><dt className="t-label">Still to engineer</dt><dd className="muted">{p.status}</dd></div>
          </dl>
        </> : layer ? (() => { const L = LAYERS.find((l) => l.id === layer); return <div className="ex-empty">
          <p className="t-label">{L.code} · Layer</p>
          <h2 className="t-h2">{L.name}</h2>
          <p>{L.blurb}</p>
          <ul className="ex-layer-parts">{L.keys.filter((k) => partById[k]).map((k) => <li key={k}><button type="button" onClick={() => { setSel(k); setLayer(null); }}><span className="t-num">{partById[k].code}</span>{partById[k].name}</button></li>)}</ul>
        </div>; })() : <div className="ex-empty">
          <p className="t-label">System Explorer</p>
          <h2 className="t-h2">Select any part.</h2>
          <p>Click the model or the list. The camera moves to it, its subsystem stays lit, and its power and water connections are traced upstream and downstream.</p>
          <ul className="ex-legend"><li className="key">Electrical power</li><li className="key water">Water</li></ul>
        </div>}
      </aside>

      <div className="ex-tools" role="toolbar" aria-label="Scene controls">
        <div className="seg" aria-label="View">
          <button type="button" aria-pressed={view === "physical"} onClick={() => setView("physical")}>Physical</button>
          <button type="button" aria-pressed={view === "schematic"} onClick={() => setView("schematic")}>Schematic</button>
        </div>
        <label className="ex-explode"><span className="t-label">Separate</span>
          <input className="range" type="range" min="0" max="1" step="0.01" value={explode} style={{ "--p": `${explode * 100}%` }} onChange={(e) => setExplode(+e.target.value)} aria-label="Layer separation" />
        </label>
        <div className="seg" aria-label="Resource flows">
          {[["off", "No flows"], ["active", "Live flows"], ["all", "All paths"]].map(([id, l]) => <button key={id} type="button" aria-pressed={flows === id} onClick={() => setFlows(id)}>{l}</button>)}
        </div>
        <button type="button" className="chip" aria-pressed={trace} onClick={() => setTrace(!trace)}>Trace</button>
        <button type="button" className="chip" aria-pressed={values} onClick={() => setValues(!values)}>Values</button>
        <div className="seg ex-moment" aria-label="Simulated moment">
          {MOMENTS.map((m) => <button key={m.id} type="button" aria-pressed={moment === m.id} onClick={() => setMoment(m.id)}>{m.label}</button>)}
        </div>
        <span className="ex-zoom">
          <button type="button" className="icon-btn" aria-label="Zoom in" onClick={() => stage && stage.dolly(0.8)}>+</button>
          <button type="button" className="icon-btn" aria-label="Zoom out" onClick={() => stage && stage.dolly(1.25)}>−</button>
          <button type="button" className="btn btn--line btn--sm" onClick={reset}>Reset</button>
        </span>
      </div>
      <p className="ex-mode t-label"><span className="mode-pill" data-mode={frame.mode}><i />{modeLabel(frame.mode)}</span></p>
    </div>
  );
}

createRoot(document.getElementById("explorer-root")).render(<Explorer />);
