import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createStage } from "../stage/stage.js";
import { simulateDay, flowsFor, at, chartPaths } from "../stage/day.js";
import { sizeSystem, TIERS, PACKAGES, CURRENCY, RATES, hubWind } from "../site/sizing.js";
import { PRESETS, DEFAULT_PRESET, saveBuild, loadBuild } from "../site/presets.js";
import { partById } from "../model/parts.js";
import "../ai/mount.jsx";
import "./studio.css";

const fmt = (x, d = 0) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: 0 });
const money = (x) => `${CURRENCY} ${fmt(x)}`;
const short = (name) => String(name).split(",").slice(0, 2).join(",").trim();
const clock = (h) => `${String(Math.floor(h) % 24).padStart(2, "0")}:${String(Math.floor((h % 1) * 60)).padStart(2, "0")}`;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

// which sizing component explains each 3D part
const PART_TO_COMPONENT = {
  "pv-array": "solar", "pv-racking": "solar", "rain-gutter": "water", "soiling-sensor": "cleaning", "cleaning-manifold": "cleaning",
  "vawt-rotor": "wind", "wind-generator": "wind", "wind-brake": "wind", "wind-rectifier": "wind",
  "first-flush": "water", "filter-train": "water", "water-tank": "water", "water-pump": "water", "water-sensors": "water",
  "lifepo4-battery": "battery", mppt: "inverter", "dc-bus": "inverter", "hybrid-inverter": "inverter", "load-panel": "inverter",
};
const INPUTS = [["roofM2", "Usable roof", "m²", 5, 200000, 1], ["loadKwhDay", "Daily electricity", "kWh", 0, 500000, 1], ["waterLDay", "Daily non-drinking water", "L", 0, 5000000, 10]];
const ICON = {
  S: <svg viewBox="0 0 48 32" aria-hidden="true"><path d="M6 28V16l11-6 11 6v12ZM28 28v-9h14v9" /><path className="c" d="M12 12l13-4 8 1-13 4z" /></svg>,
  M: <svg viewBox="0 0 48 32" aria-hidden="true"><path d="M10 28V8h16v20M26 28V14h12v14" /><path className="c" d="M9 6l10-3 8 1-10 3z" /></svg>,
  L: <svg viewBox="0 0 48 32" aria-hidden="true"><path d="M3 28V18h19v10M22 28V14h23v14" /><path className="c" d="M4 16l7-2 7 1-7 2zM24 12l8-2 8 1-8 2z" /></svg>,
};

function initialBuild() {
  const fresh = { place: DEFAULT_PRESET.name, lat: DEFAULT_PRESET.lat, lon: DEFAULT_PRESET.lon, climate: DEFAULT_PRESET.climate, source: "reference", tier: "S", package: "recommended", inputs: {}, choices: {} };
  const saved = loadBuild();
  const b = saved ? { ...fresh, ...saved, package: PACKAGES[saved.package] ? saved.package : "recommended" } : fresh;
  const tier = new URLSearchParams(location.search).get("tier");
  return TIERS[tier] ? { ...b, tier, inputs: {} } : b;
}

function DayChart({ sim, hour, onScrub }) {
  const W = 340, H = 120;
  const P = useMemo(() => chartPaths(sim, W, H, 2), [sim]);
  const ref = useRef(null);
  const scrub = (e) => {
    const r = ref.current.getBoundingClientRect();
    onScrub(Math.max(0, Math.min(23.9, ((e.clientX - r.left) / r.width) * 24)));
  };
  return (
    <svg ref={ref} className="day" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); scrub(e); }} onPointerMove={(e) => e.buttons && scrub(e)} role="img" aria-label="Your simulated day: solar, wind, house use and battery">
      {[6, 12, 18].map((h) => <line key={h} className="g" x1={P.x(h)} x2={P.x(h)} y1="0" y2={H} />)}
      <path className="aw" d={P.wind} /><path className="as" d={P.solar} />
      <path className="ll" d={P.load} /><path className="lb" d={P.soc} />
      <line className="cur" x1={P.x(hour)} x2={P.x(hour)} y1="0" y2={H} />
    </svg>
  );
}

function Studio() {
  const [build, setBuild] = useState(initialBuild);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("build");
  const [picked, setPicked] = useState(null);
  const [hour, setHour] = useState(12.5);
  const [playing, setPlaying] = useState(false);
  const [why, setWhy] = useState(null);
  const [adjust, setAdjust] = useState(false);
  const mount = useRef(null);
  const stage = useRef(null);
  const lookup = useRef(0);

  const { tier, climate, inputs, choices } = build;
  const pkg = build.package;
  const result = useMemo(() => sizeSystem(climate, tier, inputs, choices, pkg), [climate, tier, inputs, choices, pkg]);
  const prices = useMemo(() => Object.fromEntries(Object.keys(PACKAGES).map((id) => [id, sizeSystem(climate, tier, inputs, choices, id).totals])), [climate, tier, inputs, choices]);
  const sim = useMemo(() => simulateDay(result), [result]);
  const by = Object.fromEntries(result.components.map((c) => [c.id, c]));
  const t = result.totals;
  const update = (patch) => setBuild((b) => ({ ...b, ...patch }));

  useEffect(() => { saveBuild(build); }, [build]);

  // stage
  useEffect(() => {
    const s = createStage(mount.current, {
      interactive: true,
      onPick: (id) => { setPicked(id); if (id) setMode((m) => (m === "build" ? "inspect" : m)); },
      frame: (w) => (w > 1100 ? [-0.03, 0.02] : [0, 0.04]),
    });
    stage.current = s;
    s?.shot("studio", { instant: true });
    return () => s?.dispose();
  }, []);
  useEffect(() => {
    const s = stage.current; if (!s) return;
    const f = flowsFor(sim, hour);
    const rinse = by.cleaning.included && by.cleaning.name.includes("Rain-fed") && hour > 13.8 && hour < 14.6 ? 1 : 0;
    s.set({
      modules: { wind: by.wind.included, water: true },
      hour, soc: f.soc, wind: f.wind, tank: 0.55, rinse,
      flows: { ...f.flows, condensate: by.condensate.included ? 0.6 : 0, rain: 0, treat: rinse, rinse },
    });
  }, [sim, hour, by.wind.included, by.condensate.included, by.cleaning.included]);
  useEffect(() => { stage.current?.set({ explode: mode === "apart" ? 1 : 0 }); if (mode === "build") { setPicked(null); } }, [mode]);
  useEffect(() => { stage.current?.highlight(mode !== "build" ? picked : null); }, [picked, mode]);

  // play the day
  useEffect(() => {
    if (!playing) return undefined;
    let raf, last = performance.now();
    const tick = (now) => { const dt = (now - last) / 1000; last = now; setHour((h) => (h + dt * 2.4) % 24); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  async function choosePlace(place) {
    const id = ++lookup.current;
    setResults([]); setQuery("");
    const preset = PRESETS.find((p) => p.name === place.name);
    update({ place: place.name, lat: place.lat, lon: place.lon, ...(preset ? { climate: preset.climate, source: "reference" } : {}) });
    setBusy(true); setStatus(preset ? "" : `Loading 20 years of NASA climate data for ${short(place.name)}…`);
    try {
      const r = await fetch(`/api/climate?lat=${place.lat}&lon=${place.lon}`);
      const data = await r.json();
      if (!r.ok || !data.climate) throw new Error();
      if (id !== lookup.current) return;
      update({ climate: data.climate, source: "nasa", period: data.period });
      setStatus("");
    } catch {
      if (id === lookup.current) setStatus(preset ? "" : "NASA climate data didn't load. Try again, or pick a city below.");
    } finally { if (id === lookup.current) setBusy(false); }
  }
  async function search(e) {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) return setStatus("Type a city, district or address.");
    const c = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (c) return choosePlace({ name: `${(+c[1]).toFixed(3)}, ${(+c[2]).toFixed(3)}`, lat: +c[1], lon: +c[2] });
    setBusy(true); setStatus("Searching…");
    try {
      const r = await fetch(`/api/location?q=${encodeURIComponent(q)}`);
      const data = await r.json();
      if (!r.ok) throw new Error();
      if (!data.results?.length) { setResults([]); setStatus("No match. Try a nearby city, or coordinates like 25.2, 55.27."); return; }
      setResults(data.results); setStatus("Choose the closest match.");
    } catch {
      const preset = PRESETS.find((p) => p.name.toLowerCase().startsWith(q.toLowerCase()));
      if (preset) return choosePlace(preset);
      setStatus("Place search isn't available. Enter coordinates, for example 25.2, 55.27, or pick a city below.");
    } finally { setBusy(false); }
  }

  const now = at(sim, hour);
  const part = picked ? partById[picked] : null;
  const partComp = picked ? by[PART_TO_COMPONENT[picked]] : null;
  const optional = result.components.filter((c) => !c.core);

  return (
    <div className={`studio mode-${mode}`}>
      <header className="sbar">
        <a className="logo" href="/" aria-label="WELOS home"><img src="/brand/welos-header.png" alt="welos" /></a>
        <h1>Design your roof</h1>
        <nav aria-label="Site"><a href="/">How it works</a><a href="/control.html">Control OS</a></nav>
        <button type="button" className="ai" data-ai-open><span className="pulse" aria-hidden="true" />Ask WELOS AI</button>
      </header>

      <div className="room">
        <div className="stage" ref={mount} />

        <div className="overlay">
          <div className="modes" role="tablist" aria-label="View">
            {[["build", "Your build"], ["inspect", "Inspect parts"], ["apart", "Take it apart"]].map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={mode === id} className={mode === id ? "on" : ""} onClick={() => setMode(id)}>{label}</button>
            ))}
          </div>
          {mode !== "build" && !part && <p className="hint">Select any part of the unit.</p>}
          {mode !== "build" && part && (
            <article className="pcard">
              <button type="button" className="x" onClick={() => setPicked(null)} aria-label="Close part details">✕</button>
              <h2>{part.name}</h2>
              <p>{part.role}</p>
              {partComp && <p className="cap"><span>In this build</span>{partComp.included ? partComp.capacity.text : "Not fitted in this build"}</p>}
              <p className="st"><span>Before production</span>{part.status}</p>
            </article>
          )}
          <div className="time">
            <button type="button" className="play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause the day" : "Play the day"}>{playing ? <svg viewBox="0 0 16 16"><path d="M4 3h3v10H4zM9 3h3v10H9z" /></svg> : <svg viewBox="0 0 16 16"><path d="M4 2.5v11l9-5.5z" /></svg>}</button>
            <label className="sr" htmlFor="hour">Time of day</label>
            <input id="hour" type="range" min="0" max="23.9" step="0.1" value={hour} onChange={(e) => { setPlaying(false); setHour(+e.target.value); }} />
            <output htmlFor="hour">{clock(hour)}</output>
            <span className="now"><span><b>{fmt(now.pv + now.wind, 1)}</b> kW made</span><span><b>{fmt(now.load, 1)}</b> kW used</span><span>Battery <b>{fmt(now.soc * 100)}%</b></span></span>
          </div>
        </div>

        <aside className="left" aria-label="Design">
          <section className="step">
            <h2><span>1</span>Where is the roof?</h2>
            <form className="find" onSubmit={search} role="search">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="City, district or address" aria-label="Location" autoComplete="off" />
              <button type="submit" disabled={busy}>{busy ? "…" : "Find"}</button>
              {results.length > 0 && <ul className="results">{results.map((r) => <li key={`${r.lat},${r.lon}`}><button type="button" onClick={() => choosePlace(r)}>{r.name}</button></li>)}</ul>}
            </form>
            <div className="chips">{PRESETS.map((p) => <button type="button" key={p.id} className={build.place === p.name ? "on" : ""} aria-pressed={build.place === p.name} onClick={() => choosePlace(p)}>{short(p.name).split(",")[0]}</button>)}</div>
            {status && <p className="status" role="status">{status}</p>}
            <p className="site"><b>{short(build.place)}</b> {fmt(result.climate.solar, 1)} kWh/m² sun a day, {fmt(hubWind(result.climate.wind, result.tier.hubHeightM), 1)} m/s wind at the turbine, {fmt(result.climate.rain)} mm rain a year</p>
          </section>

          <section className="step">
            <h2><span>2</span>What does it power?</h2>
            <div className="tiers">{Object.values(TIERS).map((x) => (
              <button type="button" key={x.id} className={tier === x.id ? "on" : ""} aria-pressed={tier === x.id} onClick={() => update({ tier: x.id, inputs: {} })}>
                {ICON[x.id]}<b>{x.name}</b><small>{x.audience}</small>
              </button>))}
            </div>
          </section>

          <section className="step">
            <h2><span>3</span>How much of the bill?</h2>
            <div className="pkgs">{Object.values(PACKAGES).map((p) => (
              <button type="button" key={p.id} className={pkg === p.id ? "on" : ""} aria-pressed={pkg === p.id} onClick={() => update({ package: p.id })}>
                <b>{p.name}</b><em>{money(prices[p.id].totalAed)}</em><small>About {fmt(Math.min(prices[p.id].energyCoveragePct, 100))}% of your electricity</small>
              </button>))}
            </div>
          </section>

          <section className="step">
            <h2><span>4</span>Add-ons</h2>
            {optional.map((c) => (
              <label key={c.id} className={`addon ${c.included ? "on" : ""}`}>
                <span><b>{c.name}</b><small className={c.recommended ? "yes" : ""}>{c.recommended ? "Worth it on this site" : "Not worth it on this site"}</small><small>{c.capacity.text}</small></span>
                <input type="checkbox" checked={c.included} onChange={(e) => update({ choices: { ...choices, [c.id]: e.target.checked } })} />
                <i aria-hidden="true" />
              </label>
            ))}
          </section>

          <section className="step">
            <button type="button" className="more" aria-expanded={adjust} onClick={() => setAdjust((a) => !a)}><span>5</span>Your building{adjust ? "" : <small>Roof {fmt(result.site.roofM2)} m², {fmt(result.site.loadKwhDay)} kWh and {fmt(result.site.waterLDay)} L a day</small>}</button>
            {adjust && <div className="inputs">{INPUTS.map(([id, label, unit, min, max, step]) => (
              <label key={id}><span>{label}</span><span className="in"><input type="number" min={min} max={max} step={step} value={inputs[id] ?? result.site[id]} onChange={(e) => update({ inputs: { ...inputs, [id]: e.target.value === "" ? undefined : Number(e.target.value) } })} /><em>{unit}</em></span></label>
            ))}</div>}
          </section>
        </aside>

        <aside className="right" aria-label="Your build" aria-live="polite">
          <p className="for">WELOS {tier} {result.tier.name}, {result.package.name.toLowerCase()} package</p>
          <p className="price">{money(t.totalAed)}<small>installed, indicative</small></p>
          <div className="money">
            <div><b>{money(t.monthlySavingsAed)}</b><span>saved a month</span></div>
            <div><b>{money(t.monthlyAed)}</b><span>a month financed over {RATES.financeYears} years</span></div>
            <div><b>{t.paybackYears ? `${fmt(t.paybackYears, 1)} years` : "—"}</b><span>to pay back</span></div>
          </div>
          <div className="cover">
            <div className="bar e"><span>Electricity</span><i style={{ "--v": Math.min(1, t.energyCoveragePct / 100) }} /><b>{fmt(Math.min(t.energyCoveragePct, 100))}%</b></div>
            <div className="bar w"><span>Water</span><i style={{ "--v": Math.min(1, t.waterCoveragePct / 100) }} /><b>{fmt(Math.min(t.waterCoveragePct, 100))}%</b></div>
          </div>
          <figure className="chart">
            <figcaption>Your day, {clock(hour)}</figcaption>
            <DayChart sim={sim} hour={hour} onScrub={(h) => { setPlaying(false); setHour(h); }} />
            <div className="keys"><span className="k s">Solar</span>{by.wind.included && <span className="k w">Wind</span>}<span className="k l">House</span><span className="k b">Battery</span></div>
          </figure>
          <h3>What's in it</h3>
          <ul className="parts">
            {result.components.filter((c) => c.included).map((c) => (
              <li key={c.id}>
                <button type="button" aria-expanded={why === c.id} onClick={() => setWhy(why === c.id ? null : c.id)}>
                  <span><b>{c.name}</b><small>{c.capacity.text}</small></span><em>{c.costAed ? money(c.costAed) : "Included"}</em>
                </button>
                {why === c.id && <div className="why"><p>{c.why}</p><ul>{c.rules.map((r) => <li key={r.test} className={r.pass ? "y" : "n"}><b aria-label={r.pass ? "met" : "not met"}>{r.pass ? "✓" : "✕"}</b><span>{r.test}<i>{r.effect}</i></span></li>)}</ul></div>}
              </li>
            ))}
          </ul>
          <button type="button" className="askai" data-ai-open>Ask WELOS AI about this build</button>
          <p className="fine">Indicative UAE prices at AED {RATES.tariffPerKwh}/kWh. Final design needs a site survey, structural review and local approvals.</p>
        </aside>
      </div>
    </div>
  );
}

createRoot(document.getElementById("studio-root")).render(<Studio />);
