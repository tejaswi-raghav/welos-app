import React, { useEffect, useMemo, useRef, useState } from "react";
import { sizeSystem, ruleAdvice, TIERS, PACKAGES, hubWind, CURRENCY, RATES } from "./sizing.js";
import { PRESETS, DEFAULT_PRESET, saveBuild, loadBuild } from "./presets.js";
import "./site.css";

const fmt = (x, d = 0) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: 0 });
const money = (x) => `${CURRENCY} ${fmt(x)}`;
const shortPlace = (name) => String(name).split(",").slice(0, 2).join(",").trim();

const INPUTS = [
  ["roofM2", "Usable roof", "m²", 5, 200000, 1],
  ["loadKwhDay", "Daily electricity", "kWh/day", 0, 500000, 1],
  ["waterLDay", "Non-potable water", "L/day", 0, 5000000, 10],
];

function initialState() {
  const fresh = { place: DEFAULT_PRESET.name, lat: DEFAULT_PRESET.lat, lon: DEFAULT_PRESET.lon, climate: DEFAULT_PRESET.climate, source: "reference", tier: "S", package: "recommended", inputs: {}, choices: {} };
  const saved = loadBuild();
  return saved ? { ...fresh, ...saved, package: PACKAGES[saved.package] ? saved.package : "recommended" } : fresh;
}

export default function SiteConfigurator() {
  const [state, setState] = useState(initialState);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState({});
  const lookup = useRef(0);

  const { tier, climate, inputs, choices } = state;
  const pkg = state.package;
  const result = useMemo(() => sizeSystem(climate, tier, inputs, choices, pkg), [climate, tier, inputs, choices, pkg]);
  const packagePrices = useMemo(() => Object.fromEntries(Object.keys(PACKAGES).map((id) => [id, sizeSystem(climate, tier, inputs, choices, id).totals])), [climate, tier, inputs, choices]);
  const instantAdvice = useMemo(() => ruleAdvice(result, shortPlace(state.place)), [result, state.place]);
  const shown = instantAdvice;
  const update = (patch) => setState((s) => ({ ...s, ...patch }));
  const by = Object.fromEntries(result.components.map((p) => [p.id, p]));
  const t = result.totals;

  useEffect(() => { saveBuild(state); }, [state]);
  useEffect(() => {
    const onTier = (event) => TIERS[event.detail] && update({ tier: event.detail, inputs: {} });
    window.addEventListener("welos:tier", onTier);
    return () => window.removeEventListener("welos:tier", onTier);
  }, []);

  async function choosePlace(place) {
    const id = ++lookup.current;
    setResults([]);
    setQuery("");
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
    } finally {
      if (id === lookup.current) setBusy(false);
    }
  }

  async function search(event) {
    event.preventDefault();
    const q = query.trim();
    if (q.length < 2) return setStatus("Type a city, district or address.");
    const coords = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (coords) return choosePlace({ name: `${(+coords[1]).toFixed(3)}, ${(+coords[2]).toFixed(3)}`, lat: +coords[1], lon: +coords[2] });
    const preset = PRESETS.find((p) => p.name.toLowerCase().startsWith(q.toLowerCase()));
    setBusy(true);
    setStatus("Searching…");
    try {
      const response = await fetch(`/api/location?q=${encodeURIComponent(q)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (!data.results?.length) { setResults([]); setStatus("No match. Try a nearby city, or coordinates like 25.2, 55.27."); return; }
      setResults(data.results);
      setStatus("Choose the closest match.");
    } catch {
      if (preset) return choosePlace(preset);
      setStatus("Place search is unavailable right now. Enter coordinates (e.g. 25.2, 55.27) or pick a city below.");
    } finally {
      setBusy(false);
    }
  }

  const setInput = (id, value) => update({ inputs: { ...inputs, [id]: value === "" ? undefined : Number(value) } });
  const toggle = (id, value) => update({ choices: { ...choices, [id]: value } });
  const vHub = hubWind(climate.windMs, result.tier.hubHeightM);

  return <>
    <section className="cfg wrap" id="configure" aria-labelledby="cfg-title">
      <div className="cfg-head">
        <h2 id="cfg-title" className="h2">Design <span className="grad">yours.</span></h2>
        <p className="lede">Enter a location. WELOS pulls 20 years of NASA climate data for that point, sizes every subsystem to it and prices it instantly.</p>
      </div>

      <div className="cfg-find">
        <form className="cfg-search" onSubmit={search} role="search">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Enter your city, district or address" aria-label="Location" autoComplete="off" />
          <button type="submit" className="btn btn-dark" disabled={busy}>{busy ? "Working…" : "Get my climate"}</button>
          {results.length > 0 && <ul className="cfg-results" role="listbox" aria-label="Matching places">{results.map((r) => <li key={`${r.lat},${r.lon}`}><button type="button" onClick={() => choosePlace(r)}>{r.name}</button></li>)}</ul>}
        </form>
        <div className="cfg-chips" aria-label="Reference cities">{PRESETS.map((p) => <button type="button" key={p.id} className={state.place === p.name ? "on" : ""} aria-pressed={state.place === p.name} onClick={() => choosePlace(p)}>{shortPlace(p.name).split(",")[0]}</button>)}</div>
        <p className="cfg-status" role="status" aria-live="polite">{status}</p>
      </div>

      <div className="cfg-studio">
        <div className="cfg-stage">
          <div className="cfg-visual">
            <img src="/explore/ref-base.jpg" alt={`WELOS ${result.tier.id} configured for ${shortPlace(state.place)}`} />
            <div className="glass-card cfg-float">
              <span>WELOS {result.tier.id} · {result.package.name}</span>
              <strong>{money(t.totalAed)}</strong>
              <em>≈ {money(t.monthlyAed)}/mo financed · saves ≈ {money(t.monthlySavingsAed)}/mo</em>
            </div>
          </div>
          <dl className="cfg-specs">
            <div><dt>Solar</dt><dd>{fmt(by.solar.metrics.pvKwp, 1)}<small>kWp</small></dd></div>
            <div><dt>Storage</dt><dd>{fmt(by.battery.metrics.batteryKwh)}<small>kWh</small></dd></div>
            <div><dt>Water tank</dt><dd>{fmt(by.water.metrics.tankL)}<small>L</small></dd></div>
            <div><dt>Payback</dt><dd>{t.paybackYears ? fmt(t.paybackYears, 1) : "—"}<small>yrs</small></dd></div>
          </dl>
          <div className="cfg-climate" aria-label={`Climate for ${state.place}`}>
            <p className="cfg-site"><strong>{shortPlace(state.place)}</strong><span>{state.source === "nasa" ? `NASA POWER · ${state.period || "long-term climatology"}` : "Built-in reference climate · approx."}</span></p>
            <div className="cfg-metrics">
              <Metric label="Sun" value={fmt(climate.solarDailyKwhM2, 1)} unit="kWh/m²/day" />
              <Metric label="Wind" value={fmt(climate.windMs, 1)} unit={`m/s · ${fmt(vHub, 1)} at ${result.tier.hubHeightM} m`} />
              <Metric label="Rain" value={fmt(climate.rainMmYear)} unit="mm/yr" />
              <Metric label="Humidity" value={fmt(climate.humidityPct)} unit="% RH" />
              <Metric label="Temp" value={fmt(climate.tempC, 1)} unit="°C mean" />
            </div>
          </div>
        </div>

        <div className="cfg-panel">
          <fieldset className="opt-group">
            <legend>Scale</legend>
            {Object.values(TIERS).map((x) => <button type="button" key={x.id} className={`opt ${tier === x.id ? "on" : ""}`} aria-pressed={tier === x.id} onClick={() => update({ tier: x.id, inputs: {} })}>
              <span className="opt-main"><b>WELOS {x.id}</b><span>{x.name}</span></span><span className="opt-sub">{x.audience}</span>
            </button>)}
          </fieldset>

          <fieldset className="opt-group">
            <legend>Package</legend>
            {Object.values(PACKAGES).map((p) => <button type="button" key={p.id} className={`opt ${pkg === p.id ? "on" : ""}`} aria-pressed={pkg === p.id} onClick={() => update({ package: p.id })}>
              <span className="opt-main"><b>{p.name}</b><span>{money(packagePrices[p.id].totalAed)}</span></span>
              <span className="opt-sub">{p.blurb} About {fmt(Math.min(packagePrices[p.id].energyCoveragePct, 100))}% of your electricity · ≈ {money(packagePrices[p.id].monthlyAed)}/mo</span>
            </button>)}
          </fieldset>

          <button type="button" className="ai-peek" data-ai-open><span className="dot rules" aria-hidden="true" /><span><b>WELOS AI</b>{shown.headline}</span><i aria-hidden="true">→</i></button>

          <fieldset className="opt-group">
            <legend>Your building</legend>
            <div className="cfg-inputs">{INPUTS.map(([id, label, unit, min, max, step]) => <label key={id}><span>{label}</span><span className="cfg-input"><input type="number" min={min} max={max} step={step} value={inputs[id] ?? result.site[id]} onChange={(e) => setInput(id, e.target.value)} /><em>{unit}</em></span></label>)}</div>
          </fieldset>

          <div className="opt-group">
            <p className="legend">Your build</p>
            {result.components.map((p) => <article key={p.id} className={`part ${p.included ? "" : "off"}`}>
              <div className="part-row">
                <div>
                  <h3>{p.name}</h3>
                  <p className="part-cap">{p.capacity.text}</p>
                  <p className="part-spec">{p.spec}</p>
                </div>
                <div className="part-side">
                  <span className="part-cost">{p.included ? (p.costAed ? money(p.costAed) : "Included") : "—"}</span>
                  {!p.core && <label className="switch"><input type="checkbox" checked={p.included} onChange={(e) => toggle(p.id, e.target.checked)} /><span>{p.included ? "On" : "Add"}</span></label>}
                </div>
              </div>
              {!p.core && <span className={`part-tag ${p.recommended ? "yes" : ""}`}>{p.recommended ? "Recommended for this site" : "Not recommended here"}</span>}
              <button type="button" className="why-btn" aria-expanded={!!open[p.id]} onClick={() => setOpen((o) => ({ ...o, [p.id]: !o[p.id] }))}>Why this size {open[p.id] ? "−" : "+"}</button>
              {open[p.id] && <div className="why"><p>{p.why}</p><ul>{p.rules.map((r) => <li key={r.test} className={r.pass ? "pass" : "fail"}><b aria-label={r.pass ? "passes" : "fails"}>{r.pass ? "✓" : "✕"}</b><span>{r.test}<i>→ {r.effect}</i></span></li>)}</ul></div>}
            </article>)}
          </div>

          <div className="summary">
            <div className="sum-row"><span>Hardware</span><span>{money(t.hardwareAed)}</span></div>
            <div className="sum-row"><span>Engineering, install, commissioning</span><span>{money(t.installAed)}</span></div>
            <div className="sum-row total"><span>Indicative installed price</span><span>{money(t.totalAed)}</span></div>
            <div className="sum-row"><span>Est. finance, {RATES.financeYears} yrs at {(RATES.financeApr * 100).toFixed(2)}%</span><span>{money(t.monthlyAed)}/mo</span></div>
            <div className="sum-row"><span>Est. savings</span><span>{money(t.monthlySavingsAed)}/mo</span></div>
            <div className="sum-kpis">
              <div><b>{fmt(Math.min(t.energyCoveragePct, 100))}%</b><span>electricity</span></div>
              <div><b>{fmt(Math.min(t.waterCoveragePct, 100))}%</b><span>water</span></div>
              <div><b>{fmt(t.co2TonnesYear, 1)} t</b><span>CO₂/yr avoided</span></div>
            </div>
            <a className="btn btn-dark" href="/">See your build taken apart</a>
            <button type="button" className="btn btn-light" data-ai-open>Ask WELOS AI about it</button>
            <p className="fine">Indicative UAE market prices and tariffs (AED {RATES.tariffPerKwh}/kWh). Finance figures are illustrative. Final design needs a site survey, structural review and local approvals.</p>
          </div>
        </div>
      </div>
    </section>

  </>;
}

function Metric({ label, value, unit }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong><small>{unit}</small></div>;
}
