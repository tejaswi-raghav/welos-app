import React, { useEffect, useMemo, useRef, useState } from "react";
import { sizeSystem, ruleAdvice, TIERS, hubWind, CURRENCY } from "./sizing.js";
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
  const saved = loadBuild();
  if (saved) return { inputs: {}, choices: {}, source: "reference", ...saved };
  return { place: DEFAULT_PRESET.name, lat: DEFAULT_PRESET.lat, lon: DEFAULT_PRESET.lon, climate: DEFAULT_PRESET.climate, source: "reference", tier: "S", inputs: {}, choices: {} };
}

export default function SiteConfigurator() {
  const [state, setState] = useState(initialState);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState({});
  const [advice, setAdvice] = useState(null);
  const [adviceState, setAdviceState] = useState("idle");
  const lookup = useRef(0);

  const { tier, climate, inputs, choices } = state;
  const result = useMemo(() => sizeSystem(climate, tier, inputs, choices), [climate, tier, inputs, choices]);
  const tierPrices = useMemo(() => Object.fromEntries(Object.keys(TIERS).map((id) => [id, sizeSystem(climate, id).totals.totalAed])), [climate]);
  const instantAdvice = useMemo(() => ruleAdvice(result, shortPlace(state.place)), [result, state.place]);
  const shown = advice || instantAdvice;
  const update = (patch) => setState((s) => ({ ...s, ...patch }));

  useEffect(() => { saveBuild(state); }, [state]);

  // Ask the AI advisor after the build settles; show rule advice meanwhile.
  useEffect(() => {
    const controller = new AbortController();
    setAdvice(null);
    setAdviceState("thinking");
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/advisor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ place: shortPlace(state.place), tier, climate, inputs, choices }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok || !data.headline) throw new Error("advisor");
        setAdvice(data);
        setAdviceState(data.source === "ai" ? "ai" : "rules");
      } catch (error) {
        if (error.name !== "AbortError") setAdviceState("rules");
      }
    }, 650);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [state.place, tier, climate, inputs, choices]);

  async function choosePlace(place) {
    const id = ++lookup.current;
    setResults([]);
    setQuery("");
    const preset = PRESETS.find((p) => p.name === place.name);
    update({ place: place.name, lat: place.lat, lon: place.lon, ...(preset ? { climate: preset.climate, source: "reference" } : {}) });
    setBusy(true);
    setStatus(preset ? `Showing reference climate for ${shortPlace(place.name)}. Checking NASA POWER for live data…` : `Fetching 20-year climate data for ${shortPlace(place.name)}…`);
    try {
      const response = await fetch(`/api/climate?lat=${place.lat}&lon=${place.lon}`);
      const data = await response.json();
      if (!response.ok || !data.climate) throw new Error(data.error || "Climate lookup failed");
      if (id !== lookup.current) return;
      update({ climate: data.climate, source: "nasa", period: data.period });
      setStatus("");
    } catch {
      if (id !== lookup.current) return;
      setStatus(preset ? "" : "Couldn't reach NASA POWER just now. Try again, or pick a reference city below.");
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
      if (!data.results?.length) { setResults([]); setStatus("No match. Try a nearby city, or enter coordinates like 25.2, 55.27."); return; }
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
  const t = result.totals;

  return <section className="sc section-wrap" id="configure" aria-labelledby="sc-title">
    <div className="section-top"><span className="section-label">01 / DESIGN YOUR WELOS</span><span className="section-rule" /></div>
    <div className="sc-head">
      <h2 id="sc-title">Your roof. Your climate.<br /><em>Your WELOS.</em></h2>
      <p>Enter a location. WELOS pulls 20 years of NASA climate data for that exact point, sizes every subsystem to it and prices the build instantly. Every size comes with the rule that chose it.</p>
    </div>

    <div className="sc-step">
      <span className="sc-n">STEP 1 · LOCATION</span>
      <form className="sc-search" onSubmit={search} role="search">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a city, district or address" aria-label="Location" autoComplete="off" />
        <button type="submit" disabled={busy}>{busy ? "Working…" : "Get my climate"}</button>
        {results.length > 0 && <ul className="sc-results" role="listbox" aria-label="Matching places">{results.map((r) => <li key={`${r.lat},${r.lon}`}><button type="button" onClick={() => choosePlace(r)}>{r.name}</button></li>)}</ul>}
      </form>
      <div className="sc-chips" aria-label="Reference cities">{PRESETS.map((p) => <button type="button" key={p.id} className={state.place === p.name ? "on" : ""} onClick={() => choosePlace(p)}>{shortPlace(p.name).split(",")[0]}</button>)}</div>
      <p className="sc-status" role="status" aria-live="polite">{status}</p>
    </div>

    <div className="sc-climate" aria-label={`Climate for ${state.place}`}>
      <div className="sc-place"><span>SITE</span><strong>{shortPlace(state.place)}</strong><small>{state.source === "nasa" ? `NASA POWER · ${state.period || "long-term climatology"}` : "Built-in reference climate · approx."}</small></div>
      <Metric label="Sun" value={fmt(climate.solarDailyKwhM2, 1)} unit="kWh/m²/day" note={`${fmt(climate.solarDailyKwhM2 * 365)} kWh/m²/yr`} />
      <Metric label="Wind" value={fmt(climate.windMs, 1)} unit="m/s at 10 m" note={`${fmt(vHub, 1)} m/s at ${result.tier.hubHeightM} m roof`} />
      <Metric label="Rain" value={fmt(climate.rainMmYear)} unit="mm/yr" note={climate.rainMmYear < 120 ? "Arid" : climate.rainMmYear >= 800 ? "Wet" : "Moderate"} />
      <Metric label="Humidity" value={fmt(climate.humidityPct)} unit="% RH" note={climate.humidityPct >= 45 && climate.tempC >= 24 ? "AC condensate source" : "Dry air"} />
      <Metric label="Temperature" value={fmt(climate.tempC, 1)} unit="°C mean" note={climate.tempC >= 27 ? "Heat-managed build" : "Standard build"} />
    </div>

    <div className="sc-step">
      <span className="sc-n">STEP 2 · SCALE</span>
      <div className="sc-tiers" role="radiogroup" aria-label="System size">
        {Object.values(TIERS).map((x) => <button type="button" role="radio" aria-checked={tier === x.id} key={x.id} className={tier === x.id ? "on" : ""} onClick={() => update({ tier: x.id, inputs: {} })}>
          <span className="sc-tier-id">WELOS {x.id}</span><strong>{x.name}</strong><small>{x.audience}</small><em>from {money(tierPrices[x.id])}</em>
        </button>)}
      </div>
      <div className="sc-inputs">{INPUTS.map(([id, label, unit, min, max, step]) => <label key={id}><span>{label}</span><span className="sc-input"><input type="number" min={min} max={max} step={step} value={inputs[id] ?? result.site[id]} onChange={(e) => setInput(id, e.target.value)} /><em>{unit}</em></span></label>)}<p>Defaults are typical for a {result.tier.name.toLowerCase()}. Change them to match your building.</p></div>
    </div>

    <div className="sc-grid">
      <div className="sc-build">
        <span className="sc-n">STEP 3 · YOUR BUILD · SIZED FOR {shortPlace(state.place).toUpperCase()}</span>
        {result.components.map((p) => <article key={p.id} className={`sc-part ${p.included ? "" : "off"}`}>
          <div className="sc-part-main">
            <div>
              <span className={`sc-tag ${p.core ? "core" : p.overridden ? "you" : p.recommended ? "yes" : "no"}`}>{p.core ? "Core" : p.overridden ? (p.included ? "Added by you" : "Removed by you") : p.recommended ? "Recommended here" : "Not recommended here"}</span>
              <h3>{p.name}</h3>
              <p className="sc-cap">{p.capacity.text}</p>
              <p className="sc-spec">{p.spec} · {p.output}</p>
            </div>
            <div className="sc-part-side">
              <strong>{p.included ? money(p.costAed) : "—"}</strong>
              {!p.core && <label className="sc-switch"><input type="checkbox" checked={p.included} onChange={(e) => toggle(p.id, e.target.checked)} /><span>{p.included ? "Included" : "Add"}</span></label>}
            </div>
          </div>
          <button type="button" className="sc-why-btn" aria-expanded={!!open[p.id]} onClick={() => setOpen((o) => ({ ...o, [p.id]: !o[p.id] }))}>Why this size {open[p.id] ? "−" : "+"}</button>
          {open[p.id] && <div className="sc-why"><p>{p.why}</p><ul>{p.rules.map((r) => <li key={r.test} className={r.pass ? "pass" : "fail"}><b>{r.pass ? "✓" : "✗"}</b><span>{r.test}</span><i>→ {r.effect}</i></li>)}</ul></div>}
        </article>)}
      </div>

      <aside className="sc-summary" aria-label="Price and performance">
        <span className="sc-n">WELOS {result.tier.id} · {result.tier.name.toUpperCase()}</span>
        <p className="sc-total"><small>Indicative installed price</small>{money(t.totalAed)}</p>
        <dl className="sc-lines">
          <dt>Hardware</dt><dd>{money(t.hardwareAed)}</dd>
          <dt>Engineering, install, commissioning</dt><dd>{money(t.installAed)}</dd>
        </dl>
        <dl className="sc-kpis">
          <div><dt>Electricity covered</dt><dd>{fmt(Math.min(t.energyCoveragePct, 100))}%</dd></div>
          <div><dt>Water covered</dt><dd>{fmt(Math.min(t.waterCoveragePct, 100))}%</dd></div>
          <div><dt>Savings / yr</dt><dd>{money(t.annualSavingsAed)}</dd></div>
          <div><dt>Payback</dt><dd>{t.paybackYears ? `${fmt(t.paybackYears, 1)} yrs` : "—"}</dd></div>
          <div><dt>Energy / yr</dt><dd>{fmt(t.energyKwhYear)} kWh</dd></div>
          <div><dt>CO₂ avoided</dt><dd>{fmt(t.co2TonnesYear, 1)} t/yr</dd></div>
        </dl>
        <div className="sc-cta"><a href="/explore.html">See your build taken apart <b>↗</b></a><a className="ghost" href="/model.html">Open the 3D model <b>↗</b></a></div>
        <p className="sc-fine">Indicative UAE market prices and tariffs (AED 0.38/kWh) for planning, not a quotation. Final design needs a site survey, structural review and local approvals.</p>
      </aside>
    </div>

    <div className="sc-ai" aria-live="polite">
      <div className="sc-ai-top"><span className="sc-n">WELOS AI · SITE ADVISOR</span><span className={`sc-pill ${adviceState}`}>{adviceState === "thinking" ? "Analysing your site…" : adviceState === "ai" ? "AI analysis" : "Rule-based analysis"}</span></div>
      <h3>{shown.headline}</h3>
      <p className="sc-ai-sum">{shown.summary}</p>
      <div className="sc-ai-cols">
        <div><h4>Why it's built this way</h4><ul>{shown.reasons.map((r, i) => <li key={i}><b>{r.component}</b>{r.text}</li>)}</ul></div>
        <div><h4>Make it better</h4><ul>{shown.upgrades.map((u, i) => <li key={i}><b>{u.title}</b>{u.text}</li>)}</ul><h4>Verify on site</h4><ul className="sc-q">{shown.questions.map((q, i) => <li key={i}>{q}</li>)}</ul></div>
      </div>
    </div>
  </section>;
}

function Metric({ label, value, unit, note }) {
  return <div className="sc-metric"><span>{label}</span><strong>{value}<small>{unit}</small></strong><em>{note}</em></div>;
}
