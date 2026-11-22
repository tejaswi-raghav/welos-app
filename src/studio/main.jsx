import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../ui/chrome.js";
import "./studio.css";
import { useStage, useAnnotations } from "../twin/useStage.js";
import { simulateDay } from "../twin/sim.js";
import { sizeSystem, TIERS, PACKAGES, hubWind, CURRENCY, RATES } from "../site/sizing.js";
import { PRESETS, DEFAULT_PRESET, saveBuild, loadBuild } from "../site/presets.js";

const fmt = (x, d = 0) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: 0 });
const money = (x) => `${CURRENCY} ${fmt(x)}`;
const shortPlace = (name) => String(name).split(",").slice(0, 2).join(",").trim();
const INPUTS = [["roofM2", "Usable roof", "m²", 5, 200000, 1], ["loadKwhDay", "Daily electricity", "kWh/day", 0, 500000, 1], ["waterLDay", "Non-potable water", "L/day", 0, 5000000, 10]];
const POSES = { S: { pos: [13.5, 7, 16], target: [0.4, 0.4, 0], fov: 32 }, M: { pos: [22, 15, 26], target: [1, -0.5, -1.5], fov: 32 }, L: { pos: [26, 19, 30], target: [1, -0.8, -1.5], fov: 32 } };
const VIEW_FRAME = simulateDay("clear").frames[56];

function initialState() {
  const fresh = { place: DEFAULT_PRESET.name, lat: DEFAULT_PRESET.lat, lon: DEFAULT_PRESET.lon, climate: DEFAULT_PRESET.climate, source: "reference", tier: "S", package: "recommended", inputs: {}, choices: {} };
  const saved = loadBuild();
  const tier = new URLSearchParams(location.search).get("tier");
  const s = saved ? { ...fresh, ...saved, package: PACKAGES[saved.package] ? saved.package : "recommended" } : fresh;
  return TIERS[tier] ? { ...s, tier, inputs: {} } : s;
}

function Studio() {
  const [canvasRef, stage] = useStage({ env: "rooftop", orbit: true });
  const [state, setState] = useState(initialState);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState({});
  const [showCompare, setShowCompare] = useState(false);
  const lookup = useRef(0);
  const annoRef = useRef(null);

  const { tier, climate, inputs, choices } = state;
  const pkg = state.package;
  const result = useMemo(() => sizeSystem(climate, tier, inputs, choices, pkg), [climate, tier, inputs, choices, pkg]);
  const all = useMemo(() => Object.fromEntries(Object.keys(PACKAGES).map((id) => [id, sizeSystem(climate, tier, inputs, choices, id)])), [climate, tier, inputs, choices]);
  const by = Object.fromEntries(result.components.map((p) => [p.id, p]));
  const t = result.totals;
  const update = (patch) => setState((s) => ({ ...s, ...patch }));
  const bays = Math.max(1, Math.ceil(by.solar.metrics.modules / 6));

  useEffect(() => { saveBuild(state); }, [state]);
  useEffect(() => {
    if (!stage) return;
    stage.setFrame(VIEW_FRAME);
    stage.setFlows("off");
  }, [stage]);
  useEffect(() => {
    if (!stage) return;
    const shown = stage.setBays(Math.max(0, bays - 1));
    stage.setModules({ wind: !!by.wind.included, rinse: by.cleaning.name.includes("rinse") || by.cleaning.name.includes("Rinse") });
    stage.setPose(POSES[tier === "S" && bays > 1 ? "M" : tier], 1400);
    stage.__shownBays = shown;
  }, [stage, bays, by.wind.included, by.cleaning.name, tier]);

  const annos = [
    { id: "a-pv", key: "pv-array", at: [2.9, 1.9, 1.75], title: `${fmt(by.solar.metrics.pvKwp, 1)} kWp`, sub: `${by.solar.metrics.modules} × 550 W modules${bays > 1 ? ` · ${bays} canopy bays` : ""}` },
    { id: "a-batt", key: "lifepo4-battery", at: [1.2, -1.36, 1.97], title: `${fmt(by.battery.metrics.batteryKwh)} kWh`, sub: "LiFePO4 storage" },
    { id: "a-tank", key: "water-tank", at: [-2.8, 0.4, 1.67], title: `${fmt(by.water.metrics.tankL)} L`, sub: "rain tank", water: true },
    ...(by.wind.included ? [{ id: "a-wind", key: "vawt-rotor", at: [3.25, 3.3, -0.9], title: `${by.wind.metrics.turbines} × ${tier === "S" ? 1 : TIERS[tier].turbineKw} kW`, sub: `hub ~${TIERS[tier].hubHeightM} m` }] : []),
  ];
  useAnnotations(stage, annoRef, annos);

  async function choosePlace(place) {
    const id = ++lookup.current;
    setResults([]); setQuery("");
    const preset = PRESETS.find((p) => p.name === place.name);
    update({ place: place.name, lat: place.lat, lon: place.lon, ...(preset ? { climate: preset.climate, source: "reference" } : {}) });
    setBusy(true);
    setStatus(preset ? "" : `Fetching 20-year climate data for ${shortPlace(place.name)}…`);
    try {
      const response = await fetch(`/api/climate?lat=${place.lat}&lon=${place.lon}`);
      const data = await response.json();
      if (!response.ok || !data.climate) throw new Error(data.error || "Climate lookup failed");
      if (id !== lookup.current) return;
      update({ climate: data.climate, source: "nasa", period: data.period });
      setStatus("");
    } catch {
      if (id !== lookup.current) return;
      setStatus(preset ? "" : "Couldn't reach NASA POWER just now. Try again, or pick a city below.");
    } finally { if (id === lookup.current) setBusy(false); }
  }
  async function search(event) {
    event.preventDefault();
    const q = query.trim();
    if (q.length < 2) return setStatus("Type a city, district or address.");
    const coords = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (coords) return choosePlace({ name: `${(+coords[1]).toFixed(3)}, ${(+coords[2]).toFixed(3)}`, lat: +coords[1], lon: +coords[2] });
    const preset = PRESETS.find((p) => p.name.toLowerCase().startsWith(q.toLowerCase()));
    setBusy(true); setStatus("Searching…");
    try {
      const response = await fetch(`/api/location?q=${encodeURIComponent(q)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (!data.results?.length) { setResults([]); setStatus("No match. Try a nearby city, or coordinates like 25.2, 55.27."); return; }
      setResults(data.results); setStatus("Choose the closest match.");
    } catch {
      if (preset) return choosePlace(preset);
      setStatus("Place search is unavailable right now. Enter coordinates (e.g. 25.2, 55.27) or pick a city below.");
    } finally { setBusy(false); }
  }
  const setInput = (id, value) => update({ inputs: { ...inputs, [id]: value === "" ? undefined : Number(value) } });
  const toggle = (id, value) => update({ choices: { ...choices, [id]: value } });
  const vHub = hubWind(climate.windMs, result.tier.hubHeightM);

  function exportJson() {
    const payload = { generated: new Date().toISOString(), note: "Indicative concept sizing from the WELOS sizing engine. Not a quotation.", place: state.place, climateSource: state.source, climate, tier, package: pkg, inputs: result.site,
      components: result.components.filter((c) => c.included).map((c) => ({ id: c.id, name: c.name, capacity: c.capacity.text, spec: c.spec, output: c.output, costAed: c.costAed, why: c.why })), totals: result.totals, rates: RATES };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `welos-${tier}-${pkg}-${shortPlace(state.place).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const maxOf = (fn) => Math.max(...Object.values(all).map(fn), 1e-6);
  const CMP = [
    ["Solar", (r) => r.components.find((c) => c.id === "solar").metrics.pvKwp, (v) => `${fmt(v, 1)} kWp`],
    ["Storage", (r) => r.components.find((c) => c.id === "battery").metrics.batteryKwh, (v) => `${fmt(v)} kWh`],
    ["Electricity covered", (r) => Math.min(100, r.totals.energyCoveragePct), (v) => `${fmt(v)}%`],
    ["Installed price", (r) => r.totals.totalAed, (v) => money(v)],
    ["Payback", (r) => r.totals.paybackYears || 0, (v) => `${fmt(v, 1)} yrs`],
  ];

  return (
    <div className="studio">
      <section className="st-stage twin-stage">
        <canvas ref={canvasRef} aria-label={`3D rooftop showing WELOS ${tier} configured for ${shortPlace(state.place)}`} />
        <div className="annos" ref={annoRef} aria-hidden="true">
          {annos.map((a) => <div key={a.id} data-id={a.id} className={`dimtag ${a.water ? "water" : ""}`}><i /><div><b className="t-num">{a.title}</b><span>{a.sub}</span></div></div>)}
        </div>
        {stage === false && <div className="st-nogl"><img src="/explore/ref-base.jpg" alt="" /><p>3D preview unavailable. Every figure in the configurator is still computed.</p></div>}
        <div className="st-float">
          <span className="t-label">WELOS {tier} · {result.package.name} · {shortPlace(state.place)}</span>
          <b className="t-num">{money(t.totalAed)}</b>
          <span>≈ {money(t.monthlyAed)}/mo financed · saves ≈ {money(t.monthlySavingsAed)}/mo</span>
        </div>
        {bays > 1 && stage && stage.__shownBays < bays - 1 && <p className="st-note t-fine">Showing {stage.__shownBays + 1} of {bays} canopy bays that fit this illustrative roof.</p>}
        <dl className="st-kpis">
          <div><dt className="t-label">Electricity</dt><dd className="t-num">{fmt(Math.min(t.energyCoveragePct, 100))}%</dd></div>
          <div><dt className="t-label">Water</dt><dd className="t-num">{fmt(Math.min(t.waterCoveragePct, 100))}%</dd></div>
          <div><dt className="t-label">Payback</dt><dd className="t-num">{t.paybackYears ? fmt(t.paybackYears, 1) : "—"} yrs</dd></div>
          <div><dt className="t-label">CO₂ avoided</dt><dd className="t-num">{fmt(t.co2TonnesYear, 1)} t/yr</dd></div>
        </dl>
      </section>

      <aside className="st-panel" aria-label="Configuration">
        <header className="st-head">
          <p className="t-label">Studio · configure</p>
          <h1 className="t-h2">Build your <span className="t-serif">rooftop.</span></h1>
          <p className="t-fine">Every figure comes from the deterministic sizing engine (src/site/sizing.js) using your climate. Indicative UAE prices, not a quotation.</p>
        </header>

        <section className="st-sec">
          <h2 className="t-label">01 Location</h2>
          <form className="st-search" onSubmit={search} role="search">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="City, district or coordinates" aria-label="Location" autoComplete="off" />
            <button type="submit" className="btn btn--sm" disabled={busy}>{busy ? "Working…" : "Find"}</button>
            {results.length > 0 && <ul className="st-results" role="listbox" aria-label="Matching places">{results.map((r) => <li key={`${r.lat},${r.lon}`}><button type="button" onClick={() => choosePlace(r)}>{r.name}</button></li>)}</ul>}
          </form>
          <div className="st-chips">{PRESETS.map((p) => <button type="button" key={p.id} className="chip" aria-pressed={state.place === p.name} onClick={() => choosePlace(p)}>{shortPlace(p.name).split(",")[0]}</button>)}</div>
          <p className="st-status" role="status" aria-live="polite">{status}</p>
          <div className="st-climate">
            <p><b>{shortPlace(state.place)}</b> <span>{state.source === "nasa" ? `NASA POWER · ${state.period || "long-term climatology"}` : "Built-in reference climate · approximate"}</span></p>
            <dl>
              <div><dt className="t-label">Sun</dt><dd className="t-num">{fmt(climate.solarDailyKwhM2, 1)}<small>kWh/m²/d</small></dd></div>
              <div><dt className="t-label">Wind</dt><dd className="t-num">{fmt(climate.windMs, 1)}<small>m/s · {fmt(vHub, 1)} at hub</small></dd></div>
              <div><dt className="t-label">Rain</dt><dd className="t-num">{fmt(climate.rainMmYear)}<small>mm/yr</small></dd></div>
              <div><dt className="t-label">Humidity</dt><dd className="t-num">{fmt(climate.humidityPct)}<small>% RH</small></dd></div>
              <div><dt className="t-label">Temp</dt><dd className="t-num">{fmt(climate.tempC, 1)}<small>°C</small></dd></div>
            </dl>
          </div>
        </section>

        <section className="st-sec">
          <h2 className="t-label">02 Scale</h2>
          <div className="st-opts three">{Object.values(TIERS).map((x) => <button type="button" key={x.id} className="opt" aria-pressed={tier === x.id} onClick={() => update({ tier: x.id, inputs: {} })}><b>WELOS {x.id}</b><span>{x.name}</span><small>{x.audience}</small></button>)}</div>
        </section>

        <section className="st-sec">
          <div className="st-sec-head"><h2 className="t-label">03 Package</h2><button type="button" className="chip" aria-pressed={showCompare} onClick={() => setShowCompare(!showCompare)}>Compare all three</button></div>
          <div className="st-opts">{Object.values(PACKAGES).map((p) => <button type="button" key={p.id} className="opt row" aria-pressed={pkg === p.id} onClick={() => update({ package: p.id })}>
            <b>{p.name}</b><span className="t-num">{money(all[p.id].totals.totalAed)}</span><small>{p.blurb} Covers ~{fmt(Math.min(all[p.id].totals.energyCoveragePct, 100))}% of electricity.</small></button>)}</div>
          {showCompare && <div className="st-compare" role="table" aria-label="Package comparison">
            <div role="row" className="cmp-row head"><span role="columnheader" /> {Object.values(PACKAGES).map((p) => <span role="columnheader" key={p.id} className={p.id === pkg ? "cur" : ""}>{p.name}</span>)}</div>
            {CMP.map(([label, fn, show]) => { const mx = maxOf(fn); return <div role="row" className="cmp-row" key={label}><span role="rowheader" className="t-label">{label}</span>{Object.values(PACKAGES).map((p) => { const v = fn(all[p.id]); return <span role="cell" key={p.id} className={p.id === pkg ? "cur" : ""}><i style={{ width: `${(v / mx) * 100}%` }} /><b className="t-num">{show(v)}</b></span>; })}</div>; })}
            <p className="t-fine">Differences come from each package's rules: array coverage target, module grade, battery share, cleaning method and water kit. Open "Why this size" on any component for the exact rule.</p>
          </div>}
        </section>

        <section className="st-sec">
          <h2 className="t-label">04 Your building</h2>
          <div className="st-inputs">{INPUTS.map(([id, label, unit, min, max, step]) => <label key={id}><span>{label}</span><span className="st-in"><input type="number" min={min} max={max} step={step} value={inputs[id] ?? result.site[id]} onChange={(e) => setInput(id, e.target.value)} /><em>{unit}</em></span></label>)}</div>
        </section>

        <section className="st-sec">
          <h2 className="t-label">05 Components</h2>
          {result.components.map((p) => <article key={p.id} className={`comp ${p.included ? "" : "off"}`}>
            <div className="comp-row">
              <div><h3>{p.name}</h3><p className="t-num comp-cap">{p.capacity.text}</p><p className="comp-spec">{p.spec}</p></div>
              <div className="comp-side">
                <span className="t-num">{p.included ? (p.costAed ? money(p.costAed) : "Included") : "—"}</span>
                {!p.core && <button type="button" className="toggle" role="switch" aria-checked={p.included} aria-label={`Include ${p.name}`} onClick={() => toggle(p.id, !p.included)} />}
              </div>
            </div>
            {!p.core && <span className={`comp-tag ${p.recommended ? "yes" : ""}`}>{p.recommended ? "Recommended for this climate" : "Not recommended here"}</span>}
            <button type="button" className="why-btn" aria-expanded={!!open[p.id]} onClick={() => setOpen((o) => ({ ...o, [p.id]: !o[p.id] }))}>Why this size {open[p.id] ? "−" : "+"}</button>
            {open[p.id] && <div className="why"><p>{p.why}</p><ul>{p.rules.map((r) => <li key={r.test} className={r.pass ? "pass" : "fail"}><b aria-label={r.pass ? "passes" : "fails"}>{r.pass ? "✓" : "✕"}</b><span>{r.test}<i>→ {r.effect}</i></span></li>)}</ul></div>}
          </article>)}
        </section>

        <section className="st-sec st-summary" id="summary">
          <h2 className="t-label">06 Summary</h2>
          <div className="sum-row"><span>Hardware</span><span className="t-num">{money(t.hardwareAed)}</span></div>
          <div className="sum-row"><span>Engineering, install, commissioning</span><span className="t-num">{money(t.installAed)}</span></div>
          <div className="sum-row total"><span>Indicative installed price</span><span className="t-num">{money(t.totalAed)}</span></div>
          <div className="sum-row"><span>Finance, {RATES.financeYears} yrs at {(RATES.financeApr * 100).toFixed(2)}% (illustrative)</span><span className="t-num">{money(t.monthlyAed)}/mo</span></div>
          <div className="sum-row"><span>Estimated savings</span><span className="t-num">{money(t.monthlySavingsAed)}/mo</span></div>
          <div className="sum-row"><span>Energy / water per year</span><span className="t-num">{fmt(t.energyKwhYear)} kWh · {fmt(t.waterLYear)} L</span></div>
          <div className="st-actions">
            <button type="button" className="btn" onClick={exportJson}>Download summary (JSON)</button>
            <button type="button" className="btn btn--line" onClick={() => print()}>Print / save PDF</button>
            <button type="button" className="btn btn--line" data-ai-open>Ask WELOS AI</button>
          </div>
          <p className="t-fine">Indicative UAE market prices and tariffs (AED {RATES.tariffPerKwh}/kWh). Finance figures are illustrative. Final design needs a site survey, structural review and local approvals.</p>
        </section>
      </aside>
    </div>
  );
}

createRoot(document.getElementById("studio-root")).render(<Studio />);
