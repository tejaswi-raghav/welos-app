import React, { useEffect, useMemo, useRef, useState } from "react";
import { partById, parts, systems } from "./parts.js";
import { softwareLayers } from "./software.js";
import { createWelosScene } from "./scene.js";
import { icon } from "../design/icons.js";
import "./model.css";

const SYSTEM_ICON = { overview: "cube", controller: "chip", solar: "sun", wind: "wind", water: "drop", storage: "battery" };
const SHORT = { overview: "Whole unit", controller: "Control", solar: "Solar", wind: "Wind", water: "Water", storage: "Energy" };
const Ico = ({ name }) => <span className="mv-ico" dangerouslySetInnerHTML={{ __html: icon(name) }} />;

export function ModelView({ header, modules }) {
  const initiallyExploded = new URLSearchParams(window.location.search).get("exploded") === "1";
  const viewportRef = useRef(null);
  const sceneRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState("overview");
  const [selectedId, setSelectedId] = useState(null);
  const [separation, setSeparation] = useState(initiallyExploded ? 72 : 0);
  const [tab, setTab] = useState("hardware");
  const [softwareId, setSoftwareId] = useState("runtime");
  const [cardOpen, setCardOpen] = useState(true);
  const [more, setMore] = useState(false);

  const system = systems.find((s) => s.id === view) || systems[0];
  const selected = selectedId ? partById[selectedId] : null;
  const layer = softwareLayers.find((l) => l.id === softwareId) || softwareLayers[0];
  const shownSystems = useMemo(() => systems.filter((s) => s.id !== "wind" || modules?.wind !== false), [modules?.wind]);
  const systemParts = useMemo(() => parts.filter((p) => p.system === (selected?.system || view)), [view, selected?.system]);

  useEffect(() => {
    if (!viewportRef.current) return undefined;
    sceneRef.current = createWelosScene(viewportRef.current, {
      theme: "light",
      onReady: () => setReady(true),
      onSelect: (id) => {
        setSelectedId(id); setTab("hardware"); setCardOpen(true);
        const sys = partById[id]?.system;
        if (sys) { setView(sys); sceneRef.current?.setView(sys); }
      },
      onError: () => setError("This browser could not start the 3D renderer."),
    });
    if (initiallyExploded) sceneRef.current?.setExploded(0.72);
    return () => sceneRef.current?.dispose();
  }, []);

  useEffect(() => {
    if (!modules) return;
    sceneRef.current?.setModules?.(modules);
  }, [modules?.solar, modules?.wind, modules?.water, modules?.hydro, ready]);

  function choosePart(id) { setSelectedId(id); setCardOpen(true); sceneRef.current?.selectPart(id); }
  function chooseSystem(id) {
    setView(id); setSelectedId(null); setCardOpen(true); setTab("hardware");
    sceneRef.current?.selectPart(null); sceneRef.current?.setView(id);
  }
  function updateSeparation(value) { const next = Number(value); setSeparation(next); sceneRef.current?.setExploded(next / 100); }
  function resetScene() { setView("overview"); setSeparation(0); setSelectedId(null); setCardOpen(true); sceneRef.current?.reset(); }

  return (
    <div className="model-app">
      {header}
      <section className="mv" aria-label="Interactive WELOS 3D model">
        <div ref={viewportRef} className="model-viewport" />
        <p className="mv-tag"><span className="w-src target">Concept model</span></p>
        <p className="mv-hint">Drag to turn · scroll to zoom · tap any part</p>
        {!ready && !error && <div className="model-loading" role="status"><span className="spin" />Assembling the model</div>}
        {error && <div className="model-error" role="alert"><strong>3D view unavailable</strong><p>{error}</p></div>}

        {cardOpen && <aside className={`mv-card ${more ? "more" : ""}`} aria-live="polite">
          <button type="button" className="mv-more" aria-expanded={more} onClick={() => setMore(!more)}>{more ? "Less" : "Details"}</button>
          <button type="button" className="mv-x" onClick={() => setCardOpen(false)} aria-label="Hide details">×</button>
          {view === "controller" && <div className="mv-tabs" role="tablist" aria-label="Control core">
            <button role="tab" aria-selected={tab === "hardware"} className={tab === "hardware" ? "on" : ""} onClick={() => setTab("hardware")}>Hardware</button>
            <button role="tab" aria-selected={tab === "software"} className={tab === "software" ? "on" : ""} onClick={() => setTab("software")}>WELOS OS</button>
          </div>}
          {tab === "software" && view === "controller" ? <>
            <p className="mv-code">{layer.code} · {layer.category}</p>
            <h2>{layer.name}</h2>
            <p className="mv-role">{layer.role}</p>
            <dl><dt>Runs in</dt><dd><code>{layer.implementation}</code></dd><dt>Boundary</dt><dd>{layer.boundary}</dd></dl>
            <div className="mv-parts">{softwareLayers.map((l) => <button key={l.id} type="button" className={l.id === softwareId ? "on" : ""} onClick={() => setSoftwareId(l.id)}>{l.name}</button>)}</div>
            <a className="mv-link" href="/control.html">Run it in Control OS →</a>
          </> : selected ? <>
            <p className="mv-code"><span className="w-code">{selected.code}</span>{SHORT[selected.system] || selected.category}</p>
            <h2>{selected.name}</h2>
            <p className="mv-role">{selected.role}</p>
            <dl><dt>Basis</dt><dd>{selected.evidence}</dd><dt>Still to prove</dt><dd>{selected.status}</dd></dl>
            <div className="mv-parts" aria-label="Other parts in this system">{systemParts.map((p) => <button key={p.id} type="button" className={p.id === selectedId ? "on" : ""} onClick={() => choosePart(p.id)}>{p.name}</button>)}</div>
          </> : <>
            <p className="mv-code"><Ico name={SYSTEM_ICON[view]} />{system.code === "00" ? "Overview" : `System ${system.code}`}</p>
            <h2>{system.name}</h2>
            <p className="mv-role">{system.summary}</p>
            {view !== "overview" && <div className="mv-parts" aria-label="Parts in this system">{systemParts.map((p) => <button key={p.id} type="button" onClick={() => choosePart(p.id)}>{p.name}</button>)}</div>}
            {view === "overview" && <p className="mv-tip">Pick a system below, or tap any part of the model.</p>}
          </>}
        </aside>}

        <div className="mv-dock">
          <div className="mv-systems" role="tablist" aria-label="Systems">
            {shownSystems.map((s) => (
              <button key={s.id} type="button" role="tab" aria-selected={view === s.id} className={view === s.id ? "on" : ""} onClick={() => chooseSystem(s.id)}>
                <Ico name={SYSTEM_ICON[s.id]} /><span>{SHORT[s.id]}</span>
              </button>
            ))}
          </div>
          <div className="mv-explode">
            <label htmlFor="separation"><Ico name="explode" /><span>Take apart</span></label>
            <input id="separation" type="range" min="0" max="100" step="1" value={separation} onChange={(e) => updateSeparation(e.target.value)} aria-valuetext={separation === 0 ? "Assembled" : `${separation}% apart`} />
            <button type="button" onClick={resetScene} aria-label="Reset the view"><Ico name="reset" /></button>
          </div>
        </div>
      </section>
    </div>
  );
}
